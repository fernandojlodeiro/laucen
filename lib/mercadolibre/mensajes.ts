// Mensajes de posventa de Mercado Libre (la conversación con el comprador de
// un pedido), de todas las cuentas en una bandeja. Igual que las preguntas:
// la IA propone, el operador aprueba; con el interruptor de Mensajes prendido
// (Fer, 5/10) la IA contesta sola. Si el comprador pide una persona, o tiene
// un problema y la IA tiene la menor duda, le avisa que deriva el caso a una
// persona del equipo y no contesta más sola esa conversación (Fer, 25/10). Si
// le falta un dato técnico, lo busca en internet (lib/datos-internet.ts).

import { buscarProductosPedidos } from "@/lib/mercadolibre/productos-pedidos";
import { textosCanal, instruccionesExtra, conFirma, agregarFirma } from "@/lib/canales/textos";
import { igualALaSugerencia, leerPropuesta, FORMATO_IA, type EstadoIa } from "@/lib/mercadolibre/sugerencia";
import { respuestaAuto } from "@/lib/mercadolibre/respuesta-auto";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { SQL_SIN_RESPONDER } from "@/lib/mercadolibre/sql-mensajes";
export { SQL_SIN_RESPONDER };
import { pedirClaude, hayClaude } from "@/lib/claude";
import { AVISO_DERIVAR, ahoraYHorario, buscarEnInternet, guardarHallazgo, hallazgoParaIa, productoParaBuscar, SQL_DATOS_INTERNET, type Hallazgo } from "@/lib/datos-internet";
import { ml, mlOk, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";

type MensajeMl = {
  id: string; from: { user_id: number | string }; to?: { user_id: number | string };
  text?: string; message_date?: { created?: string; received?: string; read?: string | null };
  message_attachments?: unknown[] | null; message_resources?: { id: string; name: string }[];
};

/** Trae la conversación entera de un pack y la guarda. */
export async function importarConversacion(cuenta: CuentaMl, packId: string, marcarLeida = false): Promise<number> {
  const org = cuenta.organizacionId;
  const r = await ml<{ messages: MensajeMl[] }>(cuenta, "GET",
    `/messages/packs/${packId}/sellers/${cuenta.meliUserId}?tag=post_sale&mark_as_read=${marcarLeida}&limit=100`);
  if (r.status !== 200) throw new Error(`mensajes del pack ${packId}: ML contestó ${r.status}`);
  // Corte (el de los pedidos): una conversación sin ningún mensaje posterior
  // al corte de la cuenta no entra (ya está en Virtual Seller). Si tiene uno
  // nuevo, entra entera, para contestar con la historia a la vista.
  const fechaDe = (m: MensajeMl) => m.message_date?.created ?? m.message_date?.received ?? null;
  if (cuenta.pedidosCorte && !(r.datos.messages ?? []).some((m) => { const f = fechaDe(m); return !f || Date.parse(f) >= cuenta.pedidosCorte!.getTime(); })) return 0;
  const pedido = await una<{ id: string }>(`
    select id from pedido where organizacion_id = $1 and canal_id = $2 and (envio ->> 'pack_id' = $3 or id_externo = $3) order by id limit 1`,
    [org, cuenta.canalId, packId]);
  let sinLeer = 0, ultimo: string | null = null;
  for (const m of r.datos.messages ?? []) {
    const deVendedor = String(m.from.user_id) === String(cuenta.meliUserId);
    const fecha = m.message_date?.created ?? m.message_date?.received ?? new Date().toISOString();
    if (!deVendedor && !m.message_date?.read && !marcarLeida) sinLeer++;
    if (!ultimo || fecha > ultimo) ultimo = fecha;
    await consulta(`
      insert into meli_mensaje (id, organizacion_id, canal_id, pack_id, pedido_id, de_vendedor, texto, fecha, adjuntos, datos_externos)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
      on conflict (id) do update set pedido_id = coalesce(excluded.pedido_id, meli_mensaje.pedido_id), texto = excluded.texto,
        datos_externos = excluded.datos_externos`,
      [m.id, org, cuenta.canalId, packId, pedido?.id ?? null, deVendedor, m.text ?? null, fecha,
        JSON.stringify(m.message_attachments ?? []), JSON.stringify({ ml: m })]);
  }
  await consulta(`
    insert into meli_conversacion (organizacion_id, canal_id, pack_id, pedido_id, sin_leer, ultimo_ts) values ($1, $2, $3, $4, $5, $6)
    on conflict (organizacion_id, pack_id) do update set pedido_id = coalesce(excluded.pedido_id, meli_conversacion.pedido_id),
      sin_leer = excluded.sin_leer, ultimo_ts = excluded.ultimo_ts`,
    [org, cuenta.canalId, packId, pedido?.id ?? null, sinLeer, ultimo]);
  // Un mensaje del comprador posterior a la propuesta de la IA la deja vieja: se vuelve a proponer (y, con el
  // interruptor prendido, a contestar sola).
  await consulta(`
    update meli_conversacion c set sugerencia = null, sugerencia_intento_ts = null
     where c.organizacion_id = $1 and c.pack_id = $2 and c.sugerencia is not null
       and exists (select 1 from meli_mensaje m where m.organizacion_id = c.organizacion_id and m.pack_id = c.pack_id
                      and not m.de_vendedor and m.fecha > c.sugerencia_ts)`, [org, packId]);
  // Contestada desde la web de ML (ML no avisa los mensajes del vendedor; entran al releer): la propuesta de la IA ya no va.
  await consulta(`
    update meli_conversacion c set sugerencia = null
     where c.organizacion_id = $1 and c.pack_id = $2 and c.sugerencia is not null
       and (select m.de_vendedor from meli_mensaje m where m.organizacion_id = c.organizacion_id and m.pack_id = c.pack_id order by m.fecha desc limit 1)`, [org, packId]);
  return (r.datos.messages ?? []).length;
}


/** ML no avisa los mensajes que el vendedor manda desde su web: las conversaciones que esperan respuesta se
 *  releen (en el barrido de media hora y al abrirlas), así una contestada desde ML deja de figurar sin responder. */
export async function releerSinResponder(cuenta: CuentaMl, hastaMs: number, max = 30): Promise<number> {
  if (!cuenta.canalId) return 0;
  const packs = await consulta<{ pack_id: string }>(`
    select c.pack_id from meli_conversacion c where c.organizacion_id = $1 and c.canal_id = $2 and ${SQL_SIN_RESPONDER("c")}
     order by c.ultimo_ts desc limit $3`, [cuenta.organizacionId, cuenta.canalId, max]);
  let n = 0;
  for (const p of packs) {
    if (Date.now() > hastaMs) break;
    // Conserva lo ya leído en Laucen (releer recalcula «sin leer» con lo que dice ML).
    const leida = await una("select 1 from meli_conversacion where organizacion_id = $1 and pack_id = $2 and sin_leer = 0", [cuenta.organizacionId, p.pack_id]);
    try { await importarConversacion(cuenta, p.pack_id); n++; } catch { /* sigue con las demás */ }
    if (leida) await consulta("update meli_conversacion set sin_leer = 0 where organizacion_id = $1 and pack_id = $2", [cuenta.organizacionId, p.pack_id]);
  }
  return n;
}

/** Desde una notificación "messages": el recurso es el id del mensaje; de
 *  ahí se saca el pack y se trae la conversación entera. */
export async function importarMensaje(cuenta: CuentaMl, recurso: string) {
  const id = recurso.split("/").filter(Boolean).pop()!;
  const r = await ml<{ messages?: MensajeMl[] } & MensajeMl>(cuenta, "GET", `/messages/${id}?tag=post_sale`);
  if (r.status !== 200) throw new Error(`mensaje ${id}: ML contestó ${r.status}`);
  const m = r.datos.messages?.[0] ?? r.datos;
  const pack = m.message_resources?.find((x) => x.name === "packs" || x.name === "orders")?.id;
  if (!pack) throw new Error(`mensaje ${id}: no dice de qué pedido es`);
  await importarConversacion(cuenta, pack);
  await revisarFacturaDeLaVenta(cuenta, pack);
}

/** Llegó un mensaje del comprador: si la venta ya está facturada y pide un cambio de la factura (otro CUIT, factura A,
 *  el envío…), se refactura en el acto; si la factura todavía no salió, no se hace nada (la revisión corre al facturar).
 *  No tira: la tarea periódica es la red de seguridad. */
async function revisarFacturaDeLaVenta(cuenta: CuentaMl, pack: string | number) {
  try {
    const p = await una<{ id: number }>("select pedido_id::int id from meli_conversacion where organizacion_id = $1 and pack_id = $2 and pedido_id is not null", [cuenta.organizacionId, String(pack)]);
    if (!p) return;
    const { revisarFacturadas } = await import("@/lib/facturacion/revision");
    await revisarFacturadas(cuenta.organizacionId, Date.now() + 45_000, p.id);
  } catch (e) {
    console.error("[revisión de la factura al llegar el mensaje]", e instanceof Error ? e.message : e);
  }
}

const INSTRUCCIONES = `Sos quien atiende la posventa de una tienda argentina en Mercado Libre. Escribí la próxima respuesta al comprador, en castellano rioplatense, cordial y breve (1 a 4 oraciones, máximo 350 caracteres, que es el límite de ML).
Reglas de Mercado Libre: nada de teléfonos, mails ni redes; links, sólo los de publicaciones nuestras de Mercado Libre que figuren en productos_pedidos, nunca otros; no ofrecer arreglos por fuera de ML.
Usá SOLO los datos del pedido y del envío que te paso; no prometas fechas que no figuran. Para una pregunta técnica del producto comprado (memoria, ampliaciones, discos, compatibilidad, etc.), usá los datos_tecnicos de su línea: es lo que la tienda sabe del equipo; después, sus datos_de_internet (lo que ya se buscó en internet, con su certeza: usalo con las reglas de CERTEZA de abajo). Si el dato técnico no está en ningún lado, no lo inventes: el estado es "falta_dato" (se va a buscar en internet).
Si el comprador tiene un problema o reclama (no le llegó, llegó roto, incompleto o distinto, no funciona, quiere devolverlo o cambiarlo, la factura está mal, etc.): contestá vos sólo si la solución está clarísima en los datos y en las reglas de la tienda. Ante la menor duda, o si es algo que no está en lo que te paso, el estado es "derivar": en "texto", empatía en pocas palabras y el aviso de que derivás el caso.
${AVISO_DERIVAR}
Si traigo productos_pedidos, el comprador pide también otros productos: cada uno trae las publicaciones nuestras que se encontraron (con link, plan y stock disponible) o ninguna. Usá sólo esos datos; qué decir según haya o no stock lo dicen las reglas de la tienda. Un solo link por producto, el de la primera con stock.
Mirá toda la conversación: si en cualquier mensaje el comprador pidió hablar con una persona, el estado es "persona" y en "texto" va el aviso de que derivás su caso.
${FORMATO_IA}
- "derivar" si derivás el caso a una persona (ver arriba): en "texto" va el mensaje que se lo avisa al comprador.`;

/** Las reglas para un dato que se buscó en internet (Fer, 25/10). En ML nunca se nombra la fuente. */
const CERTEZA = `CERTEZA de un dato buscado en internet:
- "seguro": contestá con el dato, normal.
- "duda": contestá con el dato y aclará en una frase corta que ese dato no figura en la ficha del producto y que lo buscamos en internet para responderle. No digas que no lo podemos garantizar.
- "contradice": explicá que encontramos información que no coincide, mencioná los dos datos, pedí disculpas por no tener el dato exacto y avisá que derivás el caso a una persona (estado "derivar").
Nunca nombres de dónde salió ni pongas links que no sean de nuestras publicaciones.`;

/** La segunda vuelta, con lo que se buscó en internet. */
const CON_INTERNET = `

SEGUNDA VUELTA: en la primera te faltó un dato. Se buscó en internet y el resultado está en DATO_DE_INTERNET. Ahora contestá siempre:
- "no_encontrado" o "no_aplica": decí con amabilidad que no logramos conseguir ese dato y avisá que derivás el caso a una persona (estado "derivar").
- "seguro" o "duda": el estado es "ok".`;

/** Con lo encontrado así, la IA no lo resuelve sola: deriva. */
const DERIVA_CON: Hallazgo["certeza"][] = ["contradice", "no_encontrado", "no_aplica"];

/** La compra leída de ML (sólo lectura) cuando no está en Laucen: una venta anterior al día desde el que se traen
 *  pedidos (Fer, 22/10: sin ella la IA no sabía qué producto era y contestó genérico). Lo que diga la venta: producto,
 *  cantidad, garantía con que se vendió, fecha y estado. Si ML no la da, null. */
async function compraDeMl(org: string, canalId: string | null, packId: string): Promise<Record<string, unknown> | null> {
  const cuenta = canalId ? await cuentaDelCanal(org, Number(canalId)) : null;
  if (!cuenta) return null;
  type OrdenMl = { date_created?: string; status?: string; tags?: string[];
    order_items?: { quantity?: number; item?: { title?: string; warranty?: string | null; seller_sku?: string | null } }[] };
  let ordenes: OrdenMl[] = [];
  const o = await ml<OrdenMl>(cuenta, "GET", `/orders/${packId}`).catch(() => null);
  if (o?.status === 200) ordenes = [o.datos];
  else {
    const pack = await ml<{ orders?: { id: number }[] }>(cuenta, "GET", `/packs/${packId}`).catch(() => null);
    for (const x of pack?.status === 200 ? pack.datos.orders ?? [] : []) {
      const r = await ml<OrdenMl>(cuenta, "GET", `/orders/${x.id}`).catch(() => null);
      if (r?.status === 200) ordenes.push(r.datos);
    }
  }
  if (!ordenes.length) return null;
  const items = ordenes.flatMap((x) => x.order_items ?? []);
  // Los datos técnicos para la IA del producto de Laucen, por el SKU de la venta.
  const skus = [...new Set(items.map((l) => l.item?.seller_sku).filter((x): x is string => !!x))];
  const tecnicos = new Map((skus.length ? await consulta<{ sku: string; producto_id: number; notas_ia: string | null; internet: string | null }>(`
    select v.sku, pr.id::int producto_id, nullif(trim(pr.notas_ia), '') notas_ia, ${SQL_DATOS_INTERNET("pr")} internet
      from variacion v join producto pr on pr.id = v.producto_id
     where v.organizacion_id = $1 and v.sku = any($2::text[])`, [org, skus]) : []).map((x) => [x.sku, x]));
  return {
    nota: "Compra anterior a Laucen: leída de Mercado Libre",
    fecha: ordenes[0].date_created ?? null, estado: ordenes[0].status ?? null, entregado: ordenes.some((x) => x.tags?.includes("delivered")),
    lineas: items.map((l) => ({ titulo: l.item?.title ?? null, cantidad: l.quantity ?? null, garantia: l.item?.warranty ?? null,
      ...(() => { const t = l.item?.seller_sku ? tecnicos.get(l.item.seller_sku) : undefined;
        return { producto_id: t?.producto_id ?? null, datos_tecnicos: t?.notas_ia ?? null, datos_de_internet: t?.internet ?? null }; })() })),
  };
}

export async function sugerirMensaje(org: string, packId: string): Promise<{ texto: string; estado: EstadoIa }> {
  if (!hayClaude()) throw new ErrorErp("Falta la llave de Claude: no se puede sugerir la respuesta.");
  const conv = await una<{ pedido_id: string | null; canal_id: string | null }>("select pedido_id, canal_id from meli_conversacion where organizacion_id = $1 and pack_id = $2", [org, packId]);
  const textos = await textosCanal(org, conv?.canal_id);
  const mensajes = await consulta<{ de_vendedor: boolean; texto: string | null; fecha: Date }>(
    "select de_vendedor, texto, fecha from meli_mensaje where organizacion_id = $1 and pack_id = $2 order by fecha", [org, packId]);
  const pedido = conv?.pedido_id ? await una(`
    select p.estado, p.fecha, p.total_ars,
           (select json_agg(json_build_object('titulo', l.titulo, 'cantidad', l.cantidad, 'producto_id', pr.id,
                   'datos_tecnicos', nullif(trim(pr.notas_ia), ''), 'datos_de_internet', ${SQL_DATOS_INTERNET("pr")}) order by l.id)
              from pedido_linea l left join variacion v on v.id = l.variacion_id left join producto pr on pr.id = v.producto_id
             where l.pedido_id = p.id) lineas,
           (select json_build_object('estado', e.estado, 'subestado', e.subestado, 'logistica', e.logistica, 'tracking', e.tracking, 'entrega_estimada', e.entrega_estimada)
              from envio e where e.pedido_id = p.id order by e.id desc limit 1) envio
      from pedido p where p.id = $1`, [conv.pedido_id]) : await compraDeMl(org, conv?.canal_id ?? null, packId);
  // ¿Pide otros productos? Se buscan entre las publicaciones de esta cuenta (lib/mercadolibre/productos-pedidos.ts).
  const ultimo = mensajes[mensajes.length - 1];
  const delComprador = mensajes.filter((m) => !m.de_vendedor && m.texto).slice(-3).map((m) => m.texto).join("\n");
  const pedidos = conv?.canal_id && ultimo && !ultimo.de_vendedor && delComprador
    ? await buscarProductosPedidos(org, Number(conv.canal_id), {
        pregunta: delComprador, itemId: "", plan: null,
        tituloPublicacion: ((pedido as { lineas?: { titulo: string }[] } | null)?.lineas ?? []).map((l) => l.titulo).join(" | ") || null })
    : [];
  const momento = await ahoraYHorario(org);
  const contenido = (extra = "") => `${momento}\n\nPEDIDO:\n${JSON.stringify(pedido)}${pedidos.length ? `\n\nproductos_pedidos:\n${JSON.stringify(pedidos, null, 1)}` : ""}${extra}\n\nCONVERSACIÓN:\n${mensajes.map((m) => `${m.de_vendedor ? "Vendedor" : "Comprador"}: ${m.texto ?? "(adjunto)"}`).join("\n")}`;
  const r = await pedirClaude({ system: `${INSTRUCCIONES}\n${CERTEZA}${instruccionesExtra(textos)}`, modelo: "medio", maxTokens: 400, contenido: contenido() });
  if ("error" in r) throw new ErrorErp(`La IA no pudo proponer una respuesta (${r.error.slice(0, 120)}).`);
  let p = leerPropuesta(r.texto);
  // Le faltó un dato técnico (Fer, 25/10): se busca en internet, del producto de la compra (el primero), y se contesta
  // con lo encontrado; si no se encontró o no coincide, se deriva a una persona. Si la búsqueda falla, queda como estaba.
  let internet: Hallazgo | null = null;
  if (p.estado === "falta_dato" && delComprador) {
    const linea = ((pedido as { lineas?: { titulo: string | null; producto_id: number | null }[] } | null)?.lineas ?? [])[0];
    const productoId = linea?.producto_id ?? null;
    const buscado = (productoId ? await productoParaBuscar(org, productoId) : null) ?? (linea?.titulo ? { titulo: linea.titulo } : null);
    // Sin un producto que buscar, es como si no fuera un dato del producto: se deriva igual.
    internet = buscado ? await buscarEnInternet(buscado, delComprador) : { certeza: "no_aplica", dato: "", fuentes: [], usd: 0 };
    if (!internet.error) {
      await guardarHallazgo(org, productoId, delComprador, internet, `Mensaje de Mercado Libre (pack ${packId})`);
      const r2 = await pedirClaude({
        system: `${INSTRUCCIONES}\n${CERTEZA}${CON_INTERNET}${instruccionesExtra(textos)}`, modelo: "medio", maxTokens: 400,
        contenido: contenido(`\n\nDATO_DE_INTERNET:\n${JSON.stringify(hallazgoParaIa(internet, false))}`),
      });
      const p2 = "error" in r2 ? null : leerPropuesta(r2.texto);
      if (p2?.texto) p = { texto: p2.texto, estado: DERIVA_CON.includes(internet.certeza) || p2.estado === "derivar" || p2.estado === "persona" ? "derivar" : "ok" };
    }
  }
  // La firma del canal la pone Laucen, no la IA (lib/canales/textos.ts); con ella, sigue dentro de los 350 de ML.
  const texto = conFirma(p.texto, textos.firma, 350);
  // Si pidió una persona, queda marcado para siempre: la IA no contesta más sola esta conversación.
  await consulta(`update meli_conversacion set sugerencia = $3, sugerencia_ts = now(), ia_estado = $4, ia_internet = $5::jsonb,
                         pidio_persona_ts = coalesce(pidio_persona_ts, case when $4 = 'persona' then now() end)
                   where organizacion_id = $1 and pack_id = $2`, [org, packId, texto, p.estado, internet ? JSON.stringify(internet) : null]);
  return { texto, estado: p.estado };
}

/** ¿La IA puede mandar sola la respuesta a esta conversación? Sólo si el
 *  último mensaje es del comprador, reciente (3 días), nunca pidió una persona y la IA no la derivó ya. */
async function puedeContestarSola(org: string, packId: string): Promise<boolean> {
  const c = await una<{ ok: boolean }>(`
    select c.pidio_persona_ts is null and c.derivada_ts is null
           and (select not m.de_vendedor and m.fecha > now() - interval '3 days' from meli_mensaje m
                 where m.organizacion_id = c.organizacion_id and m.pack_id = c.pack_id order by m.fecha desc limit 1) ok
      from meli_conversacion c where c.organizacion_id = $1 and c.pack_id = $2`, [org, packId]);
  return !!c?.ok;
}

/** Lo mismo que las preguntas: la IA propone sola la respuesta a las conversaciones con mensajes del comprador sin leer.
 *  Con el interruptor de Mensajes prendido se manda sola (puedeContestarSola), también el aviso de que deriva el caso a
 *  una persona (pidió una persona o la IA deriva: Fer, 25/10); desde ese aviso la IA no contesta más esa conversación.
 *  Lo único que no sale solo es lo que sigue con un dato faltante (la búsqueda en internet falló). */
export async function sugerirMensajesPendientes(opts: { org?: string; max?: number; hastaMs?: number } = {}): Promise<{ propuestas: number; errores: number; enviadas: number }> {
  const res = { propuestas: 0, errores: 0, enviadas: 0 };
  if (!hayClaude()) return res;
  const tomadas = await consulta<{ pack_id: string; organizacion_id: string }>(`
    update meli_conversacion c set sugerencia_intento_ts = now()
     where (c.organizacion_id, c.pack_id) in (select organizacion_id, pack_id from meli_conversacion
                   where sin_leer > 0 and sugerencia is null and ($1::text is null or organizacion_id = $1)
                     and (sugerencia_intento_ts is null or sugerencia_intento_ts < now() - interval '30 minutes')
                   order by ultimo_ts limit $2 for update skip locked)
    returning c.pack_id, c.organizacion_id`, [opts.org ?? null, opts.max ?? 5]);
  for (const c of tomadas) {
    if (opts.hastaMs && Date.now() > opts.hastaMs - 8_000) break;
    try {
      // Antes de proponer: si pide una persona, la propuesta misma marca la conversación.
      const podia = await puedeContestarSola(c.organizacion_id, c.pack_id);
      const p = await sugerirMensaje(c.organizacion_id, c.pack_id);
      res.propuestas++;
      if (p.estado !== "falta_dato" && podia && (await respuestaAuto(c.organizacion_id)).mensajes) {
        await enviarMensaje(c.organizacion_id, c.pack_id, p.texto, null, { auto: true });
        if (p.estado !== "ok") await consulta("update meli_conversacion set derivada_ts = coalesce(derivada_ts, now()) where organizacion_id = $1 and pack_id = $2", [c.organizacion_id, c.pack_id]);
        res.enviadas++;
      }
    } catch { res.errores++; }
  }
  return res;
}

/** El texto de un mensaje como lo acepta Mercado Libre (sólo letras latinas, ISO-8859-1): saltos de renglón simples,
 *  espacios comunes, sin caracteres invisibles ni de control, y la puntuación «tipográfica» en su forma simple. Puro. */
export function textoParaMl(s: string): string {
  return s.replace(/\r\n?/g, "\n")
    .replace(/[\u00A0\u2007\u202F\u2000-\u200A]/g, " ")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
    .replace(/[\u201C\u201D\u201E]/g, '"').replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/\u2026/g, "...").replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/[ ]+\n/g, "\n").trim();
}

/** Manda un mensaje al comprador del pack. Sin usuario y con `auto`: lo mandó la IA sola. */
export async function enviarMensaje(org: string, packId: string, texto: string, usuarioId: string | null = null, o: { auto?: boolean } = {}) {
  if (!texto.trim()) throw new ErrorErp("El mensaje está vacío.");
  const conv = await una<{ canal_id: string; pedido_id: string | null; sugerencia: string | null }>("select canal_id, pedido_id, sugerencia from meli_conversacion where organizacion_id = $1 and pack_id = $2", [org, packId]);
  if (!conv) throw new ErrorErp("La conversación no existe.");
  // La firma del canal va siempre, la escriba una persona o la IA (si ya la trae, no se repite).
  const firma = (await textosCanal(org, conv.canal_id)).firma;
  // Tal como lo acepta siempre ML (el mismo texto mandado por la cola salía y desde la caja de la pantalla no: 22/10).
  const t = textoParaMl(agregarFirma(textoParaMl(texto), firma));
  if (t.length > 350) {
    throw new ErrorErp(t !== texto.trim()
      ? `Mercado Libre acepta hasta 350 caracteres por mensaje, contando la firma (${firma.trim().length + 1}): acortá el texto a ${349 - firma.trim().length}.`
      : "Mercado Libre acepta hasta 350 caracteres por mensaje.");
  }
  const cuenta = await cuentaDelCanal(org, Number(conv.canal_id));
  if (!cuenta) throw new ErrorErp("La cuenta de Mercado Libre ya no está conectada.");
  const comprador = conv.pedido_id
    ? (await una<{ c: string | null }>("select datos_externos #>> '{ml,orden,buyer,id}' c from pedido where id = $1", [conv.pedido_id]))?.c
    : (await una<{ c: string | null }>("select datos_externos #>> '{ml,from,user_id}' c from meli_mensaje where pack_id = $1 and not de_vendedor limit 1", [packId]))?.c;
  if (!comprador) throw new ErrorErp("No se sabe quién es el comprador de esta conversación.");
  const ruta = `/messages/packs/${packId}/sellers/${cuenta.meliUserId}?tag=post_sale`;
  const cuerpo = { from: { user_id: cuenta.meliUserId }, to: { user_id: Number(comprador) }, text: t };
  await mlOk(cuenta, "POST", ruta, cuerpo).catch(async (e) => {
    // ML rechazó (403 «the format is not allowed») dos mensajes desde la pantalla que, con el mismo texto y en la
    // misma conversación, salieron por la cola (Fer, 22/10: pedido 150344 y el pack 2000016634887584). Se limpia el
    // texto (textoParaMl) y, si vuelve a pasar, queda guardado lo que se mandó, carácter por carácter, para comparar.
    if (e instanceof ErrorErp && /format is not allowed/i.test(e.message)) {
      await consulta(`insert into ml_mensaje_rechazado (organizacion_id, canal_id, pack_id, ruta, cuerpo, codigos, error)
                      values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [org, conv.canal_id, packId, ruta, JSON.stringify(cuerpo), [...t].map((c) => c.codePointAt(0)!.toString(16)).join(" "), e.message.slice(0, 500)]).catch(() => {});
      throw new ErrorErp("Mercado Libre no aceptó este mensaje desde Laucen. Mandalo desde Mercado Libre («Ver la venta», arriba); quedó anotado para revisar la causa.");
    }
    throw e;
  });
  await importarConversacion(cuenta, packId, true);
  // Quién lo mandó: el mensaje recién vuelto de ML con ese mismo texto. Si es justo lo que propuso la IA, también "con la IA".
  if (usuarioId) await consulta(`
    update meli_mensaje set usuario_id = $3, con_ia = $5 where id = (
      select id from meli_mensaje where organizacion_id = $1 and pack_id = $2 and de_vendedor and usuario_id is null
         and trim(texto) = $4 and fecha > now() - interval '30 minutes' order by fecha desc limit 1)`, [org, packId, usuarioId, t, igualALaSugerencia(t, conv.sugerencia)]);
  else if (o.auto) await consulta(`
    update meli_mensaje set auto = true, con_ia = true where id = (
      select id from meli_mensaje where organizacion_id = $1 and pack_id = $2 and de_vendedor and usuario_id is null and not auto
         and trim(texto) = $3 and fecha > now() - interval '30 minutes' order by fecha desc limit 1)`, [org, packId, t]);
  await consulta("update meli_conversacion set sugerencia = null where organizacion_id = $1 and pack_id = $2", [org, packId]);
}
