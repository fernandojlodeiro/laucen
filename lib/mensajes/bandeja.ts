// Lo que muestra la carpeta de mensajes: la lista de chats (con sus filtros y
// buscador) y el chat abierto. `sello` cambia cuando algo cambió, así la
// pantalla pregunta cada pocos segundos y sólo baja todo si hace falta.

import { consulta, una } from "@/lib/erp/base";
import { configMensajes } from "./config";
import { credencialDeOrg } from "./chats";
import { telefonoLindo, ventanaAbierta } from "./reglas";
import type { ChatAbierto, FiltroBandeja, FilaBandeja, FotoBandeja } from "./bandeja-tipos";

export async function selloDe(org: string): Promise<string> {
  const r = await una<{ s: string }>(`
    select concat_ws('.', (select coalesce(max(id), 0) from chat_mensaje where organizacion_id = $1),
                          (select count(*) from chat_caso where organizacion_id = $1 and resuelto_ts is null),
                          (select count(*) from chat where organizacion_id = $1 and atiende_persona_desde is not null),
                          (select coalesce(max(extract(epoch from ultimo_ts))::bigint, 0) from chat where organizacion_id = $1),
                          (select count(*) from chat_mensaje where organizacion_id = $1 and estado_entrega in ('leido', 'fallido'))) s`, [org]);
  return r?.s ?? "0";
}

export async function fotoBandeja(org: string, filtro: FiltroBandeja, q: string, abierto: number | null): Promise<FotoBandeja> {
  const [sello, c, cred] = await Promise.all([selloDe(org), configMensajes(org), credencialDeOrg(org)]);
  const busca = q.trim() ? `%${q.trim().toLowerCase()}%` : null;
  const filas = await consulta<{
    id: number; canal: "whatsapp" | "prueba"; nombre: string; externo: string; cliente_id: number | null; cliente_nombre: string | null;
    ultimo: string | null; ultimo_clase: string | null; ultimo_ts: string; sin_responder: boolean; casos: number; atiende_persona: boolean;
  }>(`
    with base as (
      select ch.id::int, ch.canal, ch.nombre, ch.externo, ch.cliente_id::int, cl.nombre cliente_nombre, ch.ultimo_ts::text,
             u.texto ultimo, u.clase ultimo_clase, coalesce(u.clase = 'entrante', false) sin_responder,
             (select count(*)::int from chat_caso k where k.chat_id = ch.id and k.resuelto_ts is null) casos,
             ch.atiende_persona_desde is not null atiende_persona
        from chat ch
        left join cliente cl on cl.id = ch.cliente_id
        left join lateral (select texto, clase from chat_mensaje m where m.chat_id = ch.id and m.texto <> '' order by id desc limit 1) u on true
       where ch.organizacion_id = $1
         and ($2::text is null or lower(ch.nombre) like $2 or ch.externo like $2 or lower(coalesce(cl.nombre, '')) like $2)
    )
    select * from base order by ultimo_ts desc limit 300`, [org, busca]);
  const todas: FilaBandeja[] = filas.map((f) => ({
    id: f.id, canal: f.canal, nombre: f.cliente_nombre || f.nombre || (f.canal === "prueba" ? "Prueba" : telefonoLindo(f.externo)),
    telefono: f.canal === "whatsapp" ? telefonoLindo(f.externo) : "Prueba desde el panel",
    clienteId: f.cliente_id, clienteNombre: f.cliente_nombre, ultimo: f.ultimo ?? "", ultimoClase: f.ultimo_clase ?? "", ultimoTs: f.ultimo_ts,
    sinResponder: f.sin_responder, casos: f.casos, atiendePersona: f.atiende_persona,
  }));
  const pasa: Record<FiltroBandeja, (f: FilaBandeja) => boolean> = {
    todos: () => true, sin_responder: (f) => f.sinResponder, en_espera: (f) => f.casos > 0, persona: (f) => f.atiendePersona,
  };
  const cuantos = Object.fromEntries((Object.keys(pasa) as FiltroBandeja[]).map((k) => [k, todas.filter(pasa[k]).length])) as Record<FiltroBandeja, number>;
  return {
    sello, filas: todas.filter(pasa[filtro]), cuantos, abierto: abierto ? await chatAbierto(org, abierto) : null,
    iaActiva: c.iaActiva, nombreIa: c.nombre, conectado: !!cred,
  };
}

export async function chatAbierto(org: string, id: number): Promise<ChatAbierto | null> {
  const ch = await una<{ id: number; canal: "whatsapp" | "prueba"; nombre: string; externo: string; cliente_id: number | null; cliente_nombre: string | null;
    atiende: boolean; notas: string; ultimo_entrante_ts: string | null }>(`
    select ch.id::int, ch.canal, ch.nombre, ch.externo, ch.cliente_id::int, cl.nombre cliente_nombre, ch.atiende_persona_desde is not null atiende,
           ch.notas, ch.ultimo_entrante_ts::text
      from chat ch left join cliente cl on cl.id = ch.cliente_id where ch.organizacion_id = $1 and ch.id = $2`, [org, id]);
  if (!ch) return null;
  const [mensajes, casos] = await Promise.all([
    consulta<{ id: number; clase: ChatAbierto["mensajes"][number]["clase"]; texto: string; ts: string; estado: string | null; motivo: string | null; quien: string | null; usd: number; herramientas: { nombre: string }[] }>(`
      select * from (
        select m.id::int, m.clase, m.texto, m.ts::text, m.estado_entrega estado, m.entrega_motivo motivo, u.nombre quien, m.usd::float, m.herramientas
          from chat_mensaje m left join usuarios u on u.id = m.usuario_id
         where m.chat_id = $1 and m.texto <> '' order by m.id desc limit 300) x order by id`, [id]),
    consulta<{ id: number; asunto: string; motivo: string; abierto_ts: string; asignado: string | null }>(`
      select k.id::int, k.asunto, k.motivo, k.abierto_ts::text, u.nombre asignado from chat_caso k left join usuarios u on u.id = k.asignado_a
       where k.chat_id = $1 and k.resuelto_ts is null order by k.id`, [id]),
  ]);
  return {
    id: ch.id, canal: ch.canal, nombre: ch.cliente_nombre || ch.nombre || (ch.canal === "prueba" ? "Prueba" : telefonoLindo(ch.externo)),
    telefono: ch.canal === "whatsapp" ? telefonoLindo(ch.externo) : "Prueba desde el panel",
    clienteId: ch.cliente_id, clienteNombre: ch.cliente_nombre, atiendePersona: ch.atiende, notas: ch.notas,
    ventanaAbierta: ch.canal === "prueba" || ventanaAbierta(ch.ultimo_entrante_ts),
    mensajes: mensajes.map((m) => ({ ...m, herramientas: (m.herramientas ?? []).map((h) => h.nombre) })),
    casos: casos.map((k) => ({ id: k.id, asunto: k.asunto, motivo: k.motivo, abiertoTs: k.abierto_ts, asignado: k.asignado })),
  };
}
