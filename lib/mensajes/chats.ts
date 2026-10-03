// La base de la carpeta de mensajes: chats, mensajes, casos en espera, el
// interruptor de la IA por chat, la espera para contestar y las credenciales
// de WhatsApp. Lo usan el webhook (sin sesión), las pantallas y la IA.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ultimos10 } from "./reglas";

export type Canal = "whatsapp" | "prueba";

export type Credencial = {
  id: number; organizacionId: string; phoneNumberId: string; wabaId: string; numero: string; nombre: string;
  token: string; coexistencia: boolean; expiraEl: string | null; estado: string;
};

const SQL_CRED = `select id::int, organizacion_id "organizacionId", phone_number_id "phoneNumberId", waba_id "wabaId", numero, nombre,
                         token, coexistencia, expira_el::text "expiraEl", estado from wa_credencial`;

export const credencialDeNumero = (phoneNumberId: string) =>
  una<Credencial>(`${SQL_CRED} where phone_number_id = $1 and estado = 'activo'`, [phoneNumberId]);

export const credencialDeOrg = (org: string) =>
  una<Credencial>(`${SQL_CRED} where organizacion_id = $1 and estado = 'activo' order by conectado_ts desc limit 1`, [org]);

/** ¿Existe una cuenta con esa clave de verificación? (Meta la usa al suscribir). */
export async function verifyTokenValido(token: string): Promise<boolean> {
  if (!token) return false;
  return !!(await una("select 1 from wa_credencial where verify_token = $1", [token]));
}

// ── Chats ────────────────────────────────────────────────────────────
export type Chat = {
  id: number; organizacionId: string; canal: Canal; externo: string; nombre: string; clienteId: number | null;
  atiendePersonaDesde: string | null; notas: string; ultimoEntranteTs: string | null;
};

const SQL_CHAT = `select id::int, organizacion_id "organizacionId", canal, externo, nombre, cliente_id::int "clienteId",
                         atiende_persona_desde::text "atiendePersonaDesde", notas, ultimo_entrante_ts::text "ultimoEntranteTs" from chat`;

export const chatPorId = (org: string, id: number) => una<Chat>(`${SQL_CHAT} where organizacion_id = $1 and id = $2`, [org, id]);

/** El cliente de la ficha con ese teléfono (o celular), comparando los últimos 10 dígitos. */
export async function clientePorTelefono(org: string, telefono: string): Promise<number | null> {
  const d = ultimos10(telefono);
  if (d.length !== 10) return null;
  const r = await una<{ id: number }>(`
    select id::int from cliente
     where organizacion_id = $1
       and $2 in (right(regexp_replace(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), '^0?(\\d{2,4})15(\\d{6,8})$', '\\1\\2'), 10),
                  right(regexp_replace(regexp_replace(coalesce(telefono_movil, ''), '\\D', '', 'g'), '^0?(\\d{2,4})15(\\d{6,8})$', '\\1\\2'), 10))
     order by id desc limit 1`, [org, d]);
  return r?.id ?? null;
}

/** El chat de esa persona en ese canal; si no existe, lo crea (y lo enlaza
 *  con la ficha del cliente si hay una con ese teléfono). */
export async function chatDe(org: string, canal: Canal, externo: string, nombre = ""): Promise<Chat> {
  const existente = await una<Chat>(`${SQL_CHAT} where organizacion_id = $1 and canal = $2 and externo = $3`, [org, canal, externo]);
  if (existente) {
    if (nombre && !existente.nombre) await consulta("update chat set nombre = $2 where id = $1", [existente.id, nombre]);
    if (!existente.clienteId && canal === "whatsapp") {
      const cli = await clientePorTelefono(org, externo);
      if (cli) { await consulta("update chat set cliente_id = $2 where id = $1", [existente.id, cli]); existente.clienteId = cli; }
    }
    return { ...existente, nombre: existente.nombre || nombre };
  }
  const cli = canal === "whatsapp" ? await clientePorTelefono(org, externo) : null;
  const r = await una<Chat>(`
    insert into chat (organizacion_id, canal, externo, nombre, cliente_id) values ($1, $2, $3, $4, $5)
    on conflict (organizacion_id, canal, externo) do update set nombre = case when chat.nombre = '' then excluded.nombre else chat.nombre end
    returning id::int, organizacion_id "organizacionId", canal, externo, nombre, cliente_id::int "clienteId",
              atiende_persona_desde::text "atiendePersonaDesde", notas, ultimo_entrante_ts::text "ultimoEntranteTs"`,
  [org, canal, externo, nombre, cli]);
  return r!;
}

// ── Mensajes ─────────────────────────────────────────────────────────
export type Clase = "entrante" | "ia" | "operador" | "desde_el_telefono";
export type NuevoMensaje = {
  org: string; chatId: number; clase: Clase; texto: string; wamid?: string | null; estado?: "enviado" | "fallido" | null;
  motivo?: string | null; usuarioId?: string | null; herramientas?: unknown; tokensIn?: number; tokensOut?: number; usd?: number;
};

/** Guarda un mensaje. Si Meta reenvía uno que ya está (mismo wamid), no lo
 *  duplica y devuelve null. */
export async function guardarMensaje(m: NuevoMensaje): Promise<number | null> {
  const direccion = m.clase === "entrante" ? "entrante" : "saliente";
  const r = await una<{ id: number }>(`
    insert into chat_mensaje (organizacion_id, chat_id, direccion, clase, texto, wamid, estado_entrega, entrega_motivo, usuario_id, herramientas, tokens_in, tokens_out, usd)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
    on conflict (wamid) where wamid is not null do nothing
    returning id::int`,
  [m.org, m.chatId, direccion, m.clase, m.texto, m.wamid ?? null, m.estado ?? null, m.motivo ?? null, m.usuarioId ?? null,
    JSON.stringify(m.herramientas ?? []), m.tokensIn ?? 0, m.tokensOut ?? 0, m.usd ?? 0]);
  if (!r) return null;
  await consulta(`update chat set ultimo_ts = now()${direccion === "entrante" ? ", ultimo_entrante_ts = now()" : ""} where id = $1`, [m.chatId]);
  return r.id;
}

/** Lo que dice Meta de un mensaje nuestro (entregado, leído, no entregado). */
export async function anotarEntrega(wamid: string, estado: "entregado" | "leido" | "fallido", motivo: string | null) {
  // Un "entregado" que llega después del "leído" no lo pisa.
  await consulta(`
    update chat_mensaje set estado_entrega = $2, entrega_motivo = $3
     where wamid = $1 and not (estado_entrega = 'leido' and $2 = 'entregado')`, [wamid, estado, motivo]);
}

export type Turno = { clase: Clase; texto: string; ts: string };

/** Los últimos mensajes del chat, del más viejo al más nuevo. */
export async function historialDe(chatId: number, n = 20): Promise<Turno[]> {
  const filas = await consulta<Turno>(`
    select clase, texto, ts::text from (select * from chat_mensaje where chat_id = $1 and texto <> '' order by id desc limit $2) x order by id`, [chatId, n]);
  return filas;
}

export async function iaRespuestasUltimaHora(chatId: number): Promise<number> {
  const r = await una<{ n: number }>("select count(*)::int n from chat_mensaje where chat_id = $1 and clase = 'ia' and ts > now() - interval '1 hour'", [chatId]);
  return r?.n ?? 0;
}

// ── El interruptor de la IA de un chat ───────────────────────────────
/** prender = la IA vuelve a contestar; apagar = lo atiende una persona. */
export async function ponerIa(org: string, chatId: number, prender: boolean) {
  await consulta(`update chat set atiende_persona_desde = ${prender ? "null" : "coalesce(atiende_persona_desde, now())"} where organizacion_id = $1 and id = $2`, [org, chatId]);
}

// ── Casos en espera ──────────────────────────────────────────────────
export type Caso = { id: number; asunto: string; motivo: string; abiertoTs: string; asignadoA: string | null };

export const casosAbiertos = (org: string, chatId: number) => consulta<Caso>(`
  select id::int, asunto, motivo, abierto_ts::text "abiertoTs", asignado_a "asignadoA" from chat_caso
   where organizacion_id = $1 and chat_id = $2 and resuelto_ts is null order by id`, [org, chatId]);

export async function abrirCaso(org: string, chatId: number, asunto: string, motivo: string): Promise<number> {
  // Si ya hay uno abierto con el mismo asunto, no se duplica.
  const igual = await una<{ id: number }>("select id::int from chat_caso where chat_id = $1 and resuelto_ts is null and lower(asunto) = lower($2)", [chatId, asunto]);
  if (igual) return igual.id;
  const r = await una<{ id: number }>("insert into chat_caso (organizacion_id, chat_id, asunto, motivo) values ($1, $2, $3, $4) returning id::int", [org, chatId, asunto.slice(0, 200), motivo.slice(0, 1000)]);
  return r!.id;
}

export async function resolverCaso(org: string, casoId: number, resolucion: string, chatId?: number) {
  const r = await una<{ id: number }>(`
    update chat_caso set resuelto_ts = now(), resolucion = $3
     where organizacion_id = $1 and id = $2 and resuelto_ts is null${chatId ? " and chat_id = $4" : ""} returning id::int`,
  chatId ? [org, casoId, resolucion.slice(0, 500), chatId] : [org, casoId, resolucion.slice(0, 500)]);
  if (!r) throw new ErrorErp("Ese caso ya estaba resuelto o no existe.");
}

/** Quien contesta desde el panel se queda con los casos sin asignar de ese chat. */
export async function tomarCasos(org: string, chatId: number, usuarioId: string) {
  await consulta("update chat_caso set asignado_a = $3 where organizacion_id = $1 and chat_id = $2 and resuelto_ts is null and asignado_a is null", [org, chatId, usuarioId]);
}

// ── La espera para contestar (copiada de CadaMes, ventana-conversacion.ts) ─
/** Programa o corre la hora de contestar y espera a que llegue. Devuelve true
 *  sólo para la invocación que tiene que contestar (la del último mensaje). */
export async function ganaLaEspera(chatId: number, segundos: number): Promise<boolean> {
  if (!Number.isFinite(segundos) || segundos <= 0) return true;
  let objetivo = new Date(Date.now() + segundos * 1000);
  await consulta(`insert into chat_espera (chat_id, procesar_desde) values ($1, $2)
                  on conflict (chat_id) do update set procesar_desde = excluded.procesar_desde`, [chatId, objetivo]);
  for (;;) {
    const falta = objetivo.getTime() - Date.now();
    if (falta > 0) { await new Promise((r) => setTimeout(r, Math.min(falta, 1000))); continue; }
    const f = await una<{ p: Date }>("select procesar_desde p from chat_espera where chat_id = $1", [chatId]);
    if (!f) return false; // ya la reclamó otra invocación
    if (new Date(f.p).getTime() > objetivo.getTime()) { objetivo = new Date(f.p); continue; }
    break;
  }
  const r = await consulta("delete from chat_espera where chat_id = $1 and procesar_desde <= now() returning chat_id", [chatId]);
  return r.length > 0;
}

// ── El crudo de Meta ─────────────────────────────────────────────────
export async function anotarEvento(tipo: string, payload: unknown, org: string | null = null, desde: string | null = null) {
  await consulta("insert into wa_evento (organizacion_id, tipo, desde, payload) values ($1, $2, $3, $4::jsonb)", [org, tipo, desde, JSON.stringify(payload ?? null)])
    .catch((e) => console.error("[wa-evento]", e));
}
