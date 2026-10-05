// Mensajes de posventa de Mercado Libre (la conversación con el comprador de
// un pedido), de todas las cuentas en una bandeja. Igual que las preguntas:
// la IA propone, el operador aprueba; con el interruptor de Mensajes prendido
// (Fer, 5/10) la IA contesta sola, salvo en una conversación donde el
// comprador pidió hablar con una persona: ahí no contesta más.

import { igualALaSugerencia, leerPropuesta, FORMATO_IA, type EstadoIa } from "@/lib/mercadolibre/sugerencia";
import { respuestaAuto } from "@/lib/mercadolibre/respuesta-auto";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { pedirClaude, hayClaude } from "@/lib/claude";
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
  return (r.datos.messages ?? []).length;
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
}

const INSTRUCCIONES = `Sos quien atiende la posventa de una tienda argentina en Mercado Libre. Escribí la próxima respuesta al comprador, en castellano rioplatense, cordial y breve (1 a 4 oraciones, máximo 350 caracteres, que es el límite de ML).
Reglas de Mercado Libre: nada de teléfonos, mails, links ni redes; no ofrecer arreglos por fuera de ML.
Usá SOLO los datos del pedido y del envío que te paso; no prometas fechas que no figuran. Si el comprador reclama, primero empatía y una solución concreta dentro de lo que se ve en los datos.
Mirá toda la conversación: si en cualquier mensaje el comprador pidió hablar con una persona, el estado es "persona".
${FORMATO_IA}`;

export async function sugerirMensaje(org: string, packId: string): Promise<{ texto: string; estado: EstadoIa }> {
  if (!hayClaude()) throw new ErrorErp("Falta la llave de Claude: no se puede sugerir la respuesta.");
  const conv = await una<{ pedido_id: string | null }>("select pedido_id from meli_conversacion where organizacion_id = $1 and pack_id = $2", [org, packId]);
  const mensajes = await consulta<{ de_vendedor: boolean; texto: string | null; fecha: Date }>(
    "select de_vendedor, texto, fecha from meli_mensaje where organizacion_id = $1 and pack_id = $2 order by fecha", [org, packId]);
  const pedido = conv?.pedido_id ? await una(`
    select p.estado, p.fecha, p.total_ars, (select json_agg(json_build_object('titulo', l.titulo, 'cantidad', l.cantidad)) from pedido_linea l where l.pedido_id = p.id) lineas,
           (select json_build_object('estado', e.estado, 'subestado', e.subestado, 'logistica', e.logistica, 'tracking', e.tracking, 'entrega_estimada', e.entrega_estimada)
              from envio e where e.pedido_id = p.id order by e.id desc limit 1) envio
      from pedido p where p.id = $1`, [conv.pedido_id]) : null;
  const r = await pedirClaude({
    system: INSTRUCCIONES, modelo: "medio", maxTokens: 400,
    contenido: `PEDIDO:\n${JSON.stringify(pedido)}\n\nCONVERSACIÓN:\n${mensajes.map((m) => `${m.de_vendedor ? "Vendedor" : "Comprador"}: ${m.texto ?? "(adjunto)"}`).join("\n")}`,
  });
  if ("error" in r) throw new ErrorErp(`La IA no pudo proponer una respuesta (${r.error.slice(0, 120)}).`);
  const p = leerPropuesta(r.texto);
  const texto = p.texto.slice(0, 350);
  // Si pidió una persona, queda marcado para siempre: la IA no contesta más sola esta conversación.
  await consulta(`update meli_conversacion set sugerencia = $3, sugerencia_ts = now(), ia_estado = $4,
                         pidio_persona_ts = coalesce(pidio_persona_ts, case when $4 = 'persona' then now() end)
                   where organizacion_id = $1 and pack_id = $2`, [org, packId, texto, p.estado]);
  return { texto, estado: p.estado };
}

/** ¿La IA puede mandar sola la respuesta a esta conversación? Sólo si el
 *  último mensaje es del comprador, reciente (3 días), y nunca pidió una persona. */
async function puedeContestarSola(org: string, packId: string): Promise<boolean> {
  const c = await una<{ ok: boolean }>(`
    select c.pidio_persona_ts is null
           and (select not m.de_vendedor and m.fecha > now() - interval '3 days' from meli_mensaje m
                 where m.organizacion_id = c.organizacion_id and m.pack_id = c.pack_id order by m.fecha desc limit 1) ok
      from meli_conversacion c where c.organizacion_id = $1 and c.pack_id = $2`, [org, packId]);
  return !!c?.ok;
}

/** Lo mismo que las preguntas: la IA propone sola la respuesta a las conversaciones con mensajes del comprador sin leer.
 *  Con el interruptor de Mensajes prendido, la que la IA da por buena se manda sola (puedeContestarSola). */
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
      const p = await sugerirMensaje(c.organizacion_id, c.pack_id);
      res.propuestas++;
      if (p.estado === "ok" && (await respuestaAuto(c.organizacion_id)).mensajes && await puedeContestarSola(c.organizacion_id, c.pack_id)) {
        await enviarMensaje(c.organizacion_id, c.pack_id, p.texto, null, { auto: true });
        res.enviadas++;
      }
    } catch { res.errores++; }
  }
  return res;
}

/** Manda un mensaje al comprador del pack. Sin usuario y con `auto`: lo mandó la IA sola. */
export async function enviarMensaje(org: string, packId: string, texto: string, usuarioId: string | null = null, o: { auto?: boolean } = {}) {
  const t = texto.trim();
  if (!t) throw new ErrorErp("El mensaje está vacío.");
  if (t.length > 350) throw new ErrorErp("Mercado Libre acepta hasta 350 caracteres por mensaje.");
  const conv = await una<{ canal_id: string; pedido_id: string | null; sugerencia: string | null }>("select canal_id, pedido_id, sugerencia from meli_conversacion where organizacion_id = $1 and pack_id = $2", [org, packId]);
  if (!conv) throw new ErrorErp("La conversación no existe.");
  const cuenta = await cuentaDelCanal(org, Number(conv.canal_id));
  if (!cuenta) throw new ErrorErp("La cuenta de Mercado Libre ya no está conectada.");
  const comprador = conv.pedido_id
    ? (await una<{ c: string | null }>("select datos_externos #>> '{ml,orden,buyer,id}' c from pedido where id = $1", [conv.pedido_id]))?.c
    : (await una<{ c: string | null }>("select datos_externos #>> '{ml,from,user_id}' c from meli_mensaje where pack_id = $1 and not de_vendedor limit 1", [packId]))?.c;
  if (!comprador) throw new ErrorErp("No se sabe quién es el comprador de esta conversación.");
  await mlOk(cuenta, "POST", `/messages/packs/${packId}/sellers/${cuenta.meliUserId}?tag=post_sale`,
    { from: { user_id: cuenta.meliUserId }, to: { user_id: Number(comprador) }, text: t });
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
