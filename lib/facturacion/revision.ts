// Revisión antes de facturar (pedido de Fer, 13/10). La factura automática no sale
// a ciegas: antes se lee lo que el comprador escribió (mensajes de Mercado Libre del
// pedido y WhatsApp del cliente) y las notas del pedido y del cliente, por si
// pidió algo para la factura.
// - Nada sobre la factura → se factura como siempre (sin texto, ni se llama a la IA).
// - Pedido claro → se aplica: la leyenda va a "Observaciones" de la factura; un
//   CUIT (o «factura A») pasa a la ficha del
//   cliente (razón social, condición de IVA, domicilio fiscal), de donde sale la factura.
// - Duda → no se factura: el pedido queda con «Factura retenida» y su motivo, y
//   avisa (barra de estado, ventana, Windows). Lo destraba una persona.
// Si el pedido llega con la factura ya hecha, se hace lo mismo y, si hay que
// cambiarla, se refactura: nota de crédito idéntica (anula la original) y factura
// nueva con los datos actuales, las dos con la fecha del día (refacturar()).
// Una retención por duda de esta lectura no es el final (Fer, 29/10, pedido 150490: pidió rehacer la factura A, se le
// pidieron los datos, los mandó a los dos minutos y quedó frenado): cuando el comprador vuelve a escribir, se lee todo
// de nuevo y, si ya está claro, se destraba solo —se refactura o se factura— y en Mercado Libre se le avisa.

import { createHash } from "node:crypto";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { pedirClaude, jsonDe, hayClaude } from "@/lib/claude";
import { cuitCierra, cuitLegible } from "@/lib/cuit";
import { CONDICIONES_IVA_TEXTO } from "@/lib/arca/padron-cliente";
import { prepararFactura, prepararNotaCredito, emitir, envioPagadoPorElCompradorDe, TIPOS_CBTE } from "@/lib/arca/facturar";

/** Lo que devuelve la IA. */
export type Lectura = {
  decision: "nada" | "aplicar" | "duda"; leyenda: string | null; cuit: string | null; factura_a: boolean; incluir_envio?: boolean; condicion_iva?: string | null;
  razon_social: string | null; domicilio: string | null; motivo: string;
};
export type Decision =
  | { accion: "facturar"; leyenda: string | null; cuit: string | null; facturaA: boolean; incluirEnvio: boolean; razonSocial: string | null; condicionIva: string | null; motivo: string }
  | { accion: "retener"; motivo: string };

export const LARGO_LEYENDA = 500;
const digitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/** De la lectura de la IA a qué se hace, con reglas fijas (la IA no decide sola lo delicado). Pura. */
export function decidir(l: Lectura | null, cliente: { cuit: string | null }): Decision {
  if (!l || !["nada", "aplicar", "duda"].includes(l.decision)) return { accion: "retener", motivo: "No se pudo leer qué pidió el comprador: mirá los mensajes y las notas antes de facturar." };
  const motivo = (l.motivo ?? "").trim();
  if (l.decision === "duda") return { accion: "retener", motivo: motivo || "Pidió algo sobre la factura que no está claro." };
  if (l.decision === "nada") return { accion: "facturar", leyenda: null, cuit: null, facturaA: false, incluirEnvio: false, razonSocial: null, condicionIva: null, motivo };
  const cuit = l.cuit ? digitos(l.cuit) : null;
  if (l.cuit && (cuit!.length !== 11 || !cuitCierra(cuit!))) return { accion: "retener", motivo: `Dio un CUIT que no es válido (${l.cuit}). ${motivo}`.trim() };
  if ((l.razon_social || l.domicilio) && !cuit) return { accion: "retener", motivo: `Pide otra razón social o domicilio sin dar el CUIT. ${motivo}`.trim() };
  if (l.factura_a && !cuit && digitos(cliente.cuit).length !== 11) return { accion: "retener", motivo: `Pide factura A pero no dio el CUIT. ${motivo}`.trim() };
  const leyenda = (l.leyenda ?? "").trim().replace(/^["«“']+|["»”']+$/g, "").slice(0, LARGO_LEYENDA) || null;
  return { accion: "facturar", leyenda, cuit, facturaA: !!l.factura_a, incluirEnvio: !!l.incluir_envio, razonSocial: (l.razon_social ?? "").trim().slice(0, 120) || null, condicionIva: ["monotributo", "exento", "consumidor_final"].includes(l.condicion_iva ?? "") ? l.condicion_iva! : null, motivo };
}

/** La huella de lo que escribió el comprador y de las notas: con la misma, no se vuelve a leer. Pura. */
export function firmaDe(textos: { quien: string; texto: string }[]): string {
  const delComprador = textos.filter((t) => t.quien !== "Vendedor").map((t) => `${t.quien}:${t.texto.trim()}`);
  return createHash("sha1").update(JSON.stringify(delComprador)).digest("hex");
}

const INSTRUCCIONES = `Antes de emitir la factura electrónica de un pedido de una tienda argentina, revisás lo que escribió el comprador (mensajes de Mercado Libre o WhatsApp) y las notas que cargó la tienda en el pedido o en el cliente, para ver si pidieron algo sobre la factura.
Devolvé SÓLO un JSON: {"decision": "nada" | "aplicar" | "duda", "leyenda": texto o null, "cuit": texto o null, "factura_a": true o false, "incluir_envio": true o false, "condicion_iva": "monotributo" | "exento" | "consumidor_final" | null, "razon_social": texto o null, "domicilio": texto o null, "motivo": una oración en castellano rioplatense}
- "nada": no pidieron nada sobre la factura (preguntas del envío, agradecimientos, consultas del producto…), o lo que pidieron ya está en los datos actuales.
- "aplicar": pidieron algo claro que se resuelve con una o las dos cosas de acá:
  · una leyenda u observación que tiene que figurar en la factura (un número de subsidio, expediente, orden de compra, proyecto…): va en "leyenda", textual, sin comillas;
  · que se facture el envío (o el flete) que pagó, o que la factura incluya el costo del envío: "incluir_envio" es true (ya está resuelto: se le corrige la factura sumando el envío);
  · factura A, o facturar a un CUIT: el CUIT va en "cuit" y "factura_a" es true si pidió A. Quien da un CUIT o pide factura A es Responsable Inscripto, salvo que diga expresamente otra cosa (monotributista, exento, consumidor final): en ese caso ponelo en "condicion_iva" (si no dijo nada, null; no se consulta ningún padrón); si dio razón social o domicilio, ponelos en esos campos.
- "duda": cualquier otra cosa sobre la factura, algo que no se entiende, o pedidos que se contradicen. Por ejemplo: otra razón social o domicilio sin CUIT, facturar a nombre de otra persona sin CUIT, partir la factura, otro importe que no sea el envío, otra fecha, otra descripción de los productos, factura sin IVA, o una leyenda de la que no está claro el texto.
Los mensajes del vendedor son sólo contexto; lo que vale es lo que pidió el comprador o lo que dicen las notas.
Una dirección, un nombre o un DNI para un envío o un reenvío NO son datos de la factura: eso es "nada", salvo que diga que es para la factura.
Si te paso una FACTURA YA HECHA, "aplicar" sólo si lo pedido es distinto de lo que ya tiene; si ya coincide, "nada".
"motivo": qué pidió y qué se va a hacer, o por qué hay duda (para la persona que lo revise).`;

type Contexto = {
  pedido: { id: number; cliente_id: number | null; notas: string | null; leyenda: string | null; retenida: string | null; revision: { firma?: string; decision?: string; motivo?: string } | null;
    nombre: string | null; razon_social: string | null; cuit: string | null; condicion_iva: string | null; cliente_notas: string | null; domicilio: string | null; con_envio: boolean };
  textos: { cuando: Date | null; donde: string; quien: string; texto: string }[];
};

/** Lo escrito sobre el pedido: mensajes de ML (los dos lados), WhatsApp del cliente desde el pedido, y las notas. */
async function contexto(org: string, pid: number): Promise<Contexto | null> {
  const pedido = await una<Contexto["pedido"] & { creado: Date }>(`
    select p.id::int, p.cliente_id::int, p.notas, p.factura_leyenda leyenda, p.factura_con_envio con_envio, p.factura_retenida retenida, p.factura_revision revision, p.creado_ts creado,
           cl.nombre, cl.razon_social, cl.cuit, cl.condicion_iva, cl.notas cliente_notas,
           (select concat_ws(', ', concat_ws(' ', d.calle, d.numero), d.localidad, d.provincia) from cliente_direccion d
             where d.cliente_id = cl.id order by (d.etiqueta = 'Fiscal') desc, d.principal desc, d.id limit 1) domicilio
      from pedido p left join cliente cl on cl.id = p.cliente_id where p.id = $1 and p.organizacion_id = $2`, [pid, org]);
  if (!pedido) return null;
  const [ml, wa] = await Promise.all([
    consulta<{ fecha: Date; de_vendedor: boolean; texto: string }>(
      "select fecha, de_vendedor, texto from meli_mensaje where organizacion_id = $1 and pedido_id = $2 and coalesce(texto, '') <> '' order by fecha", [org, pid]),
    pedido.cliente_id ? consulta<{ ts: Date; direccion: string; texto: string }>(`
      select m.ts, m.direccion, m.texto from chat_mensaje m join chat c on c.id = m.chat_id
       where c.organizacion_id = $1 and c.cliente_id = $2 and m.ts >= $3::timestamptz - interval '2 days' and coalesce(m.texto, '') <> ''
       order by m.ts desc limit 40`, [org, pedido.cliente_id, pedido.creado]) : Promise.resolve([]),
  ]);
  const textos: Contexto["textos"] = [
    ...ml.map((m) => ({ cuando: m.fecha, donde: "Mercado Libre", quien: m.de_vendedor ? "Vendedor" : "Comprador", texto: m.texto })),
    ...wa.reverse().map((m) => ({ cuando: m.ts, donde: "WhatsApp", quien: m.direccion === "entrante" ? "Comprador" : "Vendedor", texto: m.texto })),
  ];
  if (pedido.notas?.trim()) textos.push({ cuando: null, donde: "Notas del pedido", quien: "Nota", texto: pedido.notas.trim() });
  if (pedido.cliente_notas?.trim()) textos.push({ cuando: null, donde: "Notas del cliente", quien: "Nota", texto: pedido.cliente_notas.trim() });
  return { pedido, textos };
}

type Facturada = { tipo_cbte: number; receptor_nombre: string | null; doc_tipo: number; doc_nro: string; leyenda: string | null };

async function leerConIa(c: Contexto, facturada: Facturada | null): Promise<Lectura | null> {
  const p = c.pedido;
  const fecha = (d: Date | null) => (d ? new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) : "");
  const datos = [
    `Cliente: ${p.nombre ?? "—"}`, `Razón social: ${p.razon_social ?? "—"}`, `CUIT: ${p.cuit ? cuitLegible(p.cuit) : "—"}`,
    `Condición de IVA: ${CONDICIONES_IVA_TEXTO[p.condicion_iva ?? "consumidor_final"] ?? p.condicion_iva}`, `Domicilio: ${p.domicilio ?? "—"}`,
    `Leyenda prevista para la factura: ${p.leyenda ?? "(ninguna)"}`,
  ].join("\n");
  const hecha = facturada
    ? `\n\nFACTURA YA HECHA:\n${TIPOS_CBTE[facturada.tipo_cbte]?.nombre ?? "Factura"} a ${facturada.receptor_nombre ?? "—"} (doc ${facturada.doc_tipo === 99 ? "consumidor final" : facturada.doc_nro}), leyenda: ${facturada.leyenda ?? "(ninguna)"}` : "";
  const r = await pedirClaude({
    system: INSTRUCCIONES, modelo: "medio", maxTokens: 500,
    contenido: `DATOS ACTUALES:\n${datos}${hecha}\n\nLO ESCRITO:\n${c.textos.map((t) => `[${t.donde}${t.cuando ? ` ${fecha(t.cuando)}` : ""}] ${t.quien}: ${t.texto}`).join("\n")}`,
  });
  if ("error" in r) return null;
  return jsonDe<Lectura>(r.texto);
}

async function retener(org: string, pid: number, motivo: string, revision: object) {
  await consulta(`update pedido set factura_retenida = $3, factura_retenida_ts = now(), factura_revision = $4::jsonb where id = $1 and organizacion_id = $2`,
    [pid, org, motivo.slice(0, 1000), JSON.stringify(revision)]);
}

export type Resultado = { retenida: boolean; motivo?: string; cambio: boolean };

/** ¿La retuvo esta misma lectura (por duda)? Ésa se vuelve a leer cuando el comprador escribe; una retención por otra
 *  cosa (una refacturación que falló, una persona) no. */
export const retenidaPorLaLectura = (p: Pick<Contexto["pedido"], "retenida" | "revision">) => !!p.retenida && p.revision?.decision === "duda" && p.revision.motivo === p.retenida;

/** SQL (alias `p`): la misma condición, para buscar los pedidos que hay que volver a leer. */
const SQL_RETENIDA_POR_LECTURA = "(p.factura_revision ->> 'decision' = 'duda' and p.factura_revision ->> 'motivo' = p.factura_retenida)";

/** La revisión de un pedido antes de su factura (o, con `facturada`, después). No tira. */
export async function revisarPedido(org: string, pid: number, facturada: Facturada | null = null): Promise<Resultado> {
  const c = await contexto(org, pid);
  if (!c) return { retenida: false, cambio: false };
  const sigue = { retenida: true, motivo: c.pedido.retenida ?? undefined, cambio: false };
  if (c.pedido.retenida && !retenidaPorLaLectura(c.pedido)) return sigue;
  // Sin nada escrito por el comprador ni notas, no hay nada que leer.
  if (!c.textos.some((t) => t.quien !== "Vendedor")) return c.pedido.retenida ? sigue : { retenida: false, cambio: false };
  const firma = firmaDe(c.textos);
  // Lo mismo que ya se leyó: queda como estaba (retenida o no). Si escribió algo nuevo, se lee todo otra vez.
  if (c.pedido.revision?.firma === firma) return c.pedido.retenida ? sigue : { retenida: false, cambio: false };
  const base = { firma, ts: new Date().toISOString() };
  if (!hayClaude()) {
    const motivo = "Hay mensajes o notas en el pedido y la IA no está disponible para leerlos: mirálos antes de facturar.";
    await retener(org, pid, motivo, { ...base, decision: "duda", motivo });
    return { retenida: true, motivo, cambio: false };
  }
  const d = decidir(await leerConIa(c, facturada), { cuit: c.pedido.cuit });
  if (d.accion === "retener") {
    const motivo = facturada ? `Pide cambiar la factura ya hecha: ${d.motivo}` : d.motivo;
    await retener(org, pid, motivo, { ...base, decision: "duda", motivo });
    return { retenida: true, motivo, cambio: false };
  }
  const aplicado: string[] = [];
  let cambio = false;
  if (d.leyenda && d.leyenda !== (c.pedido.leyenda ?? "")) {
    await consulta("update pedido set factura_leyenda = $3 where id = $1 and organizacion_id = $2", [pid, org, d.leyenda]);
    aplicado.push(`leyenda «${d.leyenda}»`);
    cambio = true;
  }
  if (facturada && d.leyenda && d.leyenda !== (facturada.leyenda ?? "")) cambio = true;
  // El comprador pidió que se le facture el envío: se marca el pedido y, si ya estaba facturado, se refactura (sólo si pagó envío).
  if (d.incluirEnvio && !c.pedido.con_envio) {
    if (await envioPagadoPorElCompradorDe(pid) > 0) {
      await consulta("update pedido set factura_con_envio = true where id = $1 and organizacion_id = $2", [pid, org]);
      aplicado.push("el envío que pagó el comprador va en la factura");
      cambio = true;
    } else aplicado.push("pidió el envío en la factura, pero no pagó envío: no hay nada que sumar");
  }
  const cuit = d.cuit ?? (d.facturaA ? digitos(c.pedido.cuit) : null);
  if (cuit) {
    if (!c.pedido.cliente_id) {
      const motivo = `Pide facturar al CUIT ${cuitLegible(cuit)} pero el pedido no tiene cliente.`;
      await retener(org, pid, motivo, { ...base, decision: "duda", motivo });
      return { retenida: true, motivo, cambio: false };
    }
    // Sin consultar el padrón de ARCA (Fer, 20/10): lo que dio el comprador va a la ficha, y quien pide factura A es Responsable Inscripto.
    const cl = c.pedido;
    const cambios: string[] = [];
    if (digitos(cl.cuit) !== cuit) cambios.push(`CUIT ${cuitLegible(cuit)}`);
    // Con CUIT, Responsable Inscripto salvo que el comprador diga otra cosa (Fer, 20/10). Una condición ya cargada
    // distinta de consumidor final no se pisa, salvo que el comprador la diga.
    const sinCondicion = !cl.condicion_iva || cl.condicion_iva === "consumidor_final";
    const condicion = d.condicionIva ?? (sinCondicion ? "responsable_inscripto" : null);
    if (condicion && condicion !== cl.condicion_iva) cambios.push(CONDICIONES_IVA_TEXTO[condicion] ?? condicion);
    if (d.razonSocial && d.razonSocial !== cl.razon_social) cambios.push(`razón social ${d.razonSocial}`);
    if (cambios.length) {
      await consulta(`update cliente set cuit = $3, condicion_iva = coalesce($4::text, condicion_iva),
                             razon_social = coalesce($5::text, razon_social) where id = $1 and organizacion_id = $2`,
        [cl.cliente_id, org, cuit, condicion && condicion !== cl.condicion_iva ? condicion : null, d.razonSocial]);
      aplicado.push(`datos en la ficha del cliente (${cambios.join(", ")})`);
      cambio = true;
    }
    if (facturada && (digitos(facturada.doc_nro) !== cuit || (d.facturaA && facturada.tipo_cbte !== 1))) cambio = true;
  }
  const motivo = [d.motivo, aplicado.length ? `Se aplicó: ${aplicado.join("; ")}.` : ""].filter(Boolean).join(" ");
  // Si estaba retenida por una lectura anterior, con esto queda destrabada.
  await consulta("update pedido set factura_revision = $3::jsonb, factura_retenida = null, factura_retenida_ts = null where id = $1 and organizacion_id = $2",
    [pid, org, JSON.stringify({ ...base, decision: aplicado.length ? "aplicar" : "nada", motivo })]);
  return { retenida: false, motivo, cambio };
}

/** SQL: la factura del pedido que sigue vigente (autorizada y sin nota de crédito autorizada). Alias del comprobante `cb`. */
export const sqlFacturaVigente = (cb = "cb") => `(${cb}.tipo_cbte in (1, 6, 11) and ${cb}.estado = 'autorizado'
  and not exists (select 1 from comprobante nc where nc.comprobante_asociado_id = ${cb}.id and nc.estado = 'autorizado'))`;

/** Refacturar con los datos actuales: nota de crédito idéntica a la factura vigente (la anula) y factura
 *  nueva con lo que hoy tiene la ficha del cliente y la leyenda del pedido; las dos con la fecha del día. */
export async function refacturar(org: string, pid: number, usuario: string | null): Promise<string> {
  const f = await una<{ id: number; tipo_cbte: number }>(`
    select cb.id::int, cb.tipo_cbte from comprobante cb where cb.organizacion_id = $1 and cb.pedido_id = $2 and ${sqlFacturaVigente("cb")}
     order by cb.id desc limit 1`, [org, pid]);
  if (!f) throw new ErrorErp("El pedido no tiene una factura vigente para refacturar.");
  // Una nota de crédito que quedó a medio camino (pendiente o con error) se reintenta; si no, se arma.
  const previa = await una<{ id: number }>("select id::int from comprobante where comprobante_asociado_id = $1 and estado in ('pendiente', 'error') order by id desc limit 1", [f.id]);
  const nc = previa?.id ?? await prepararNotaCredito(org, f.id, usuario);
  const r1 = await emitir(org, nc);
  if (r1.estado !== "autorizado") throw new ErrorErp(`La nota de crédito no salió: ${r1.mensaje}`);
  const nueva = await prepararFactura(org, pid, usuario);
  // Si la anterior estaba subida a Mercado Libre, la nueva la reemplaza ahí (se borra la vieja y se sube ésta,
  // lib/mercadolibre/facturas.ts). Se marca antes de emitir: al autorizarse, entra a la cola.
  await consulta(`update comprobante set ml_reemplaza = exists (select 1 from comprobante o where o.pedido_id = $3 and o.id <> $1 and o.ml_subida_ts is not null)
                   where id = $1 and organizacion_id = $2`, [nueva, org, pid]);
  const r2 = await emitir(org, nueva);
  await consulta("update pedido set factura_retenida = null, factura_retenida_ts = null where id = $1 and organizacion_id = $2", [pid, org]);
  if (r2.estado !== "autorizado") throw new ErrorErp(`Se anuló la factura (${r1.mensaje}) pero la nueva no salió: ${r2.mensaje}`);
  return `Refacturado. ${r1.mensaje} ${r2.mensaje}`;
}

/** Destraba el pedido: la persona ya lo miró (factura o deja la factura como está). */
export async function liberarFactura(org: string, pid: number): Promise<void> {
  await consulta("update pedido set factura_retenida = null, factura_retenida_ts = null where id = $1 and organizacion_id = $2", [pid, org]);
}

type CandidatoFacturada = Facturada & { pedido_id: number };

/** Después de rehacer la factura porque lo pidió: en Mercado Libre se le avisa, si nadie le contestó todavía su último
 *  mensaje, y la conversación deja de esperar a una persona (sale de «Para atender»). No tira. */
async function avisarRefacturada(org: string, pid: number) {
  try {
    const c = await una<{ pack_id: string }>(`
      select c.pack_id from meli_conversacion c
       where c.organizacion_id = $1 and c.pedido_id = $2
         and (select not m.de_vendedor from meli_mensaje m where m.organizacion_id = c.organizacion_id and m.pack_id = c.pack_id order by m.fecha desc limit 1)
       limit 1`, [org, pid]);
    if (!c) return;
    const { enviarMensaje } = await import("@/lib/mercadolibre/mensajes");
    await enviarMensaje(org, c.pack_id, "¡Listo! Ya rehicimos la factura con los datos que nos pasaste. La vas a ver en el detalle de tu compra.", null, { auto: true });
    await consulta("update meli_conversacion set derivada_ts = null, no_responder_ts = now(), ia_estado = null where organizacion_id = $1 and pack_id = $2", [org, c.pack_id]);
  } catch (e) {
    console.error("[revisión] no se pudo avisar la refacturación", pid, e instanceof Error ? e.message : e);
  }
}

/** Revisa un pedido ya facturado: si el comprador pidió un cambio claro se refactura, si hay duda se retiene y avisa.
 *  Si la refacturación falla, queda retenido con el motivo para que una persona lo mire. */
async function revisarYRefacturar(org: string, x: CandidatoFacturada, res: { refacturadas: number; retenidas: number; liberadas: number; errores: string[] }) {
  try {
    const r = await revisarPedido(org, x.pedido_id, x);
    if (r.retenida) res.retenidas++;
    else if (r.cambio) { await refacturar(org, x.pedido_id, "sistema"); res.refacturadas++; await avisarRefacturada(org, x.pedido_id); }
  } catch (e) {
    const motivo = `No se pudo refacturar solo: ${e instanceof Error ? e.message : String(e)}`;
    await consulta("update pedido set factura_retenida = $3, factura_retenida_ts = now() where id = $1 and organizacion_id = $2", [x.pedido_id, org, motivo.slice(0, 1000)]).catch(() => {});
    res.errores.push(`pedido ${x.pedido_id}: ${motivo}`);
  }
}

/** Los pedidos ya facturados a los que el comprador les escribió después de la factura (o desde la
 *  última lectura). Con `pedidoId`, sólo ése (lo llama la llegada de un mensaje de ML, al instante);
 *  sin él, los que encuentre la tarea periódica (red de seguridad). */
export async function revisarFacturadas(org: string, hastaMs: number, pedidoId: number | null = null): Promise<{ refacturadas: number; retenidas: number; liberadas: number; errores: string[] }> {
  const res = { refacturadas: 0, retenidas: 0, liberadas: 0, errores: [] as string[] };
  const candidatos = await consulta<CandidatoFacturada>(`
    select p.id::int pedido_id, cb.tipo_cbte, cb.receptor_nombre, cb.doc_tipo, cb.doc_nro, cb.leyenda
      from comprobante cb join pedido p on p.id = cb.pedido_id
      join lateral (select greatest(
              (select max(m.fecha) from meli_mensaje m where m.pedido_id = p.id and not m.de_vendedor),
              (select max(x.ts) from chat_mensaje x join chat c on c.id = x.chat_id where c.cliente_id = p.cliente_id and x.direccion = 'entrante' and x.ts >= p.creado_ts)) ultimo) u on true
     where cb.organizacion_id = $1 and ${sqlFacturaVigente("cb")} and cb.autorizado_ts > now() - interval '60 days'
       and (p.factura_retenida is null or ${SQL_RETENIDA_POR_LECTURA})
       and u.ultimo > cb.autorizado_ts and u.ultimo > coalesce((p.factura_revision ->> 'ts')::timestamptz, '-infinity')
       and ($2::bigint is null or p.id = $2)
     order by u.ultimo limit 10`, [org, pedidoId]);
  for (const x of candidatos) {
    if (Date.now() > hastaMs) break;
    await revisarYRefacturar(org, x, res);
  }
  // Los que quedaron retenidos por duda antes de facturar y el comprador volvió a escribir: si ya está claro, se
  // destraba y vuelve a la facturación automática (el mismo evento que cuando se confirma un cobro).
  const sinFactura = await consulta<{ id: number }>(`
    select p.id::int from pedido p
      join lateral (select greatest(
              (select max(m.fecha) from meli_mensaje m where m.pedido_id = p.id and not m.de_vendedor),
              (select max(x.ts) from chat_mensaje x join chat c on c.id = x.chat_id where c.cliente_id = p.cliente_id and x.direccion = 'entrante' and x.ts >= p.creado_ts)) ultimo) u on true
     where p.organizacion_id = $1 and p.factura_retenida is not null and ${SQL_RETENIDA_POR_LECTURA}
       and p.factura_retenida_ts > now() - interval '60 days' and u.ultimo > (p.factura_revision ->> 'ts')::timestamptz
       and not exists (select 1 from comprobante cb where cb.pedido_id = p.id and ${sqlFacturaVigente("cb")})
       and ($2::bigint is null or p.id = $2)
     order by u.ultimo limit 10`, [org, pedidoId]);
  for (const x of sinFactura) {
    if (Date.now() > hastaMs) break;
    try {
      if ((await revisarPedido(org, x.id)).retenida) continue;
      await consulta("select emitir_evento($1, 'pedido_pago_confirmado', $2::jsonb)", [org, JSON.stringify({ pedido_id: x.id, quien: "revision" })]);
      res.liberadas++;
    } catch (e) {
      res.errores.push(`pedido ${x.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return res;
}
