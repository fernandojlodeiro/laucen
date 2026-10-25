// La bandeja de Mensajes (Fer, 25/10; como la Bandeja de CadaMes): todas las conversaciones de los clientes —WhatsApp,
// Instagram, mensajes y preguntas de Mercado Libre, reclamos— en una sola lista, la más nueva primero, y la
// conversación abierta. Lee de las tablas de cada canal; no muda nada: cada respuesta sale por el camino de su canal
// (app/ventas/mensajes/acciones.ts). `sello` cambia cuando algo cambió, así la pantalla pregunta cada pocos segundos
// y sólo baja todo si hace falta. Cada persona ve los canales que su rol puede ver.

import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { consulta, una } from "@/lib/erp/base";
import type { PermisoKey } from "@/lib/permisos";
import { SQL_RECLAMO_A_ATENDER } from "@/lib/erp/contadores";
import { SQL_DERIVADA_ESPERA, SQL_SIN_RESPONDER } from "@/lib/mercadolibre/sql-mensajes";
import { configMensajes } from "./config";
import { credencialDeOrg } from "./chats";
import { telefonoLindo, ventanaAbierta } from "./reglas";
import {
  partirClave, ORIGENES,
  type ChatAbierto, type FiltroBandeja, type FiltroOrigen, type FilaBandeja, type FotoBandeja, type MensajeVista, type Origen,
} from "./bandeja-tipos";

type Puede = (p: PermisoKey) => boolean;

/** Cuántos días para atrás entra cada canal en la lista (lo viejo se ve en la pantalla de cada uno). */
const DIAS_ML = 60, DIAS_PREGUNTAS = 7, DIAS_RECLAMOS = 15;

export async function selloDe(org: string): Promise<string> {
  const r = await una<{ s: string }>(`
    select concat_ws('.', (select coalesce(max(id), 0) from chat_mensaje where organizacion_id = $1),
                          (select count(*) from chat_caso where organizacion_id = $1 and resuelto_ts is null),
                          (select count(*) from chat where organizacion_id = $1 and atiende_persona_desde is not null),
                          (select coalesce(max(extract(epoch from ultimo_ts))::bigint, 0) from chat where organizacion_id = $1),
                          (select count(*) from chat_mensaje where organizacion_id = $1 and estado_entrega in ('leido', 'fallido')),
                          (select coalesce(max(extract(epoch from greatest(ultimo_ts, sugerencia_ts, derivada_ts, no_responder_ts, pidio_persona_ts)))::bigint, 0)
                             from meli_conversacion where organizacion_id = $1),
                          (select coalesce(max(extract(epoch from greatest(actualizado_ts, sugerencia_ts, respondida_ts)))::bigint, 0) from meli_pregunta where organizacion_id = $1),
                          (select count(*) from meli_pregunta where organizacion_id = $1 and estado = 'UNANSWERED'),
                          (select coalesce(max(id), 0) from reclamo_mensaje where organizacion_id = $1),
                          (select count(*) from reclamo r where r.organizacion_id = $1 and ${SQL_RECLAMO_A_ATENDER})) s`, [org]);
  return r?.s ?? "0";
}

/** Los canales que esta persona puede ver. */
function canales(puede: Puede) {
  return { chats: puede("mensajes_ver"), ml: puede("preguntas_ver"), reclamos: puede("reclamos_ver") };
}

async function filasChats(org: string, q: string): Promise<FilaBandeja[]> {
  const filas = await consulta<{
    id: number; canal: "whatsapp" | "instagram" | "prueba"; nombre: string; externo: string; cliente_nombre: string | null;
    ultimo: string | null; ultimo_clase: string | null; ultimo_ts: string; casos: number; atiende_persona: boolean;
  }>(`
    select ch.id::int, ch.canal, ch.nombre, ch.externo, cl.nombre cliente_nombre, ch.ultimo_ts::text,
           u.texto ultimo, u.clase ultimo_clase,
           (select count(*)::int from chat_caso k where k.chat_id = ch.id and k.resuelto_ts is null) casos,
           ch.atiende_persona_desde is not null atiende_persona
      from chat ch
      left join cliente cl on cl.id = ch.cliente_id
      left join lateral (select texto, clase from chat_mensaje m where m.chat_id = ch.id and m.texto <> '' order by id desc limit 1) u on true
     where ch.organizacion_id = $1
       and ${sqlBusqueda("$2", ["ch.nombre", { num: "ch.externo" }, "ch.notas", "cl.nombre"])}
     order by ch.ultimo_ts desc limit 300`, [org, parametroBusqueda(q)]);
  return filas.map((f) => ({
    clave: `c:${f.id}`, origen: f.canal,
    nombre: f.cliente_nombre || f.nombre || (f.canal === "prueba" ? "Prueba" : f.canal === "whatsapp" ? telefonoLindo(f.externo) : f.externo),
    detalle: f.canal === "whatsapp" ? `WhatsApp · ${telefonoLindo(f.externo)}` : f.canal === "instagram" ? "Instagram" : "Prueba desde el panel",
    ultimo: f.ultimo ?? "", ultimoClase: f.ultimo_clase ?? "", ultimoTs: f.ultimo_ts,
    sinResponder: f.ultimo_clase === "entrante", enEspera: f.casos > 0, atiendePersona: f.atiende_persona,
  }));
}

/** El comprador y el título de una conversación de ML, por la venta (si no está el pedido en Laucen). */
const VENTA_DEL_PACK = (c: string) => `left join lateral (select v.id::int venta_id, v.comprador, v.titulo from ml_venta v
  where v.organizacion_id = ${c}.organizacion_id and ${c}.pack_id ~ '^[0-9]+$' and (v.pack_id = ${c}.pack_id::bigint or v.order_id = ${c}.pack_id::bigint)
  order by v.id limit 1) mv on true`;

async function filasMl(org: string, q: string): Promise<FilaBandeja[]> {
  const filas = await consulta<{
    pack_id: string; canal: string | null; nombre: string | null; pedido_id: number | null; titulo: string | null; ultimo_ts: string;
    ultimo: string | null; de_vendedor: boolean | null; auto: boolean | null; por_usuario: boolean | null; sin_responder: boolean; derivada: boolean; persona: boolean;
  }>(`
    select c.pack_id, ca.nombre canal, coalesce(cl.nombre, mv.comprador) nombre, c.pedido_id::int, mv.titulo, c.ultimo_ts::text,
           u.texto ultimo, u.de_vendedor, u.auto, u.usuario_id is not null por_usuario,
           ${SQL_SIN_RESPONDER("c")} sin_responder, ${SQL_DERIVADA_ESPERA("c")} derivada,
           (c.pidio_persona_ts is not null or c.derivada_ts is not null) persona
      from meli_conversacion c
      left join canal ca on ca.id = c.canal_id
      left join pedido p on p.id = c.pedido_id
      left join cliente cl on cl.id = p.cliente_id
      ${VENTA_DEL_PACK("c")}
      left join lateral (select texto, de_vendedor, auto, usuario_id from meli_mensaje m
                          where m.organizacion_id = c.organizacion_id and m.pack_id = c.pack_id order by m.fecha desc limit 1) u on true
     where c.organizacion_id = $1 and c.ultimo_ts > now() - interval '${DIAS_ML} days'
       and ${sqlBusqueda("$2", ["cl.nombre", "mv.comprador", "mv.titulo", "c.pack_id"])}
     order by c.ultimo_ts desc limit 300`, [org, parametroBusqueda(q)]);
  return filas.map((f) => ({
    clave: `m:${f.pack_id}`, origen: "ml",
    nombre: f.nombre || `Pack ${f.pack_id}`,
    detalle: [f.canal, f.pedido_id ? `pedido ${f.pedido_id}` : null, f.titulo].filter(Boolean).join(" · "),
    ultimo: f.ultimo ?? "(adjunto)",
    ultimoClase: !f.de_vendedor ? "entrante" : f.auto ? "ia" : f.por_usuario ? "operador" : "desde_el_telefono",
    ultimoTs: f.ultimo_ts, sinResponder: f.sin_responder, enEspera: f.derivada, atiendePersona: f.persona,
  }));
}

async function filasPreguntas(org: string, q: string): Promise<FilaBandeja[]> {
  const filas = await consulta<{
    id: string; canal: string | null; texto: string; respuesta: string | null; estado: string; ts: string; ia_estado: string | null;
    respondida_auto: boolean; titulo: string | null;
  }>(`
    select q.id::text, ca.nombre canal, q.texto, q.respuesta, q.estado, coalesce(q.respondida_ts, q.fecha)::text ts, q.ia_estado,
           q.respondida_auto, coalesce(mi.titulo, pu.titulo) titulo
      from meli_pregunta q
      left join canal ca on ca.id = q.canal_id
      left join publicacion pu on pu.id = q.publicacion_id
      left join lateral (select titulo from meli_item m where m.organizacion_id = q.organizacion_id and m.item_id = q.item_id limit 1) mi on true
     where q.organizacion_id = $1 and q.estado in ('UNANSWERED', 'ANSWERED')
       and (q.estado = 'UNANSWERED' or coalesce(q.respondida_ts, q.fecha) > now() - interval '${DIAS_PREGUNTAS} days')
       and ${sqlBusqueda("$2", ["q.texto", "mi.titulo", "q.item_id"])}
     order by coalesce(q.respondida_ts, q.fecha) desc limit 200`, [org, parametroBusqueda(q)]);
  return filas.map((f) => {
    const pendiente = f.estado === "UNANSWERED";
    return {
      clave: `p:${f.id}`, origen: "pregunta" as Origen,
      nombre: f.titulo ? `Pregunta: ${f.titulo}` : "Pregunta",
      detalle: f.canal ?? "Mercado Libre",
      ultimo: pendiente ? f.texto : f.respuesta ?? "", ultimoClase: pendiente ? "entrante" : f.respondida_auto ? "ia" : "operador", ultimoTs: f.ts,
      sinResponder: pendiente, enEspera: pendiente && f.ia_estado === "falta_dato", atiendePersona: false,
    };
  });
}

async function filasReclamos(org: string, q: string): Promise<FilaBandeja[]> {
  const filas = await consulta<{
    id: number; origen: string; tipo: string | null; motivo: string | null; canal: string | null; nombre: string | null; pedido_id: number | null;
    ts: string; ultimo: string | null; de: string | null; atender: boolean;
  }>(`
    select r.id::int, r.origen, r.tipo, r.motivo, ca.nombre canal, cl.nombre, r.pedido_id::int,
           greatest(r.fecha, coalesce(u.fecha, r.fecha))::text ts, u.texto ultimo, u.de, ${SQL_RECLAMO_A_ATENDER} atender
      from reclamo r
      left join canal ca on ca.id = r.canal_id
      left join cliente cl on cl.id = r.cliente_id
      left join lateral (select texto, de, fecha from reclamo_mensaje m where m.reclamo_id = r.id and m.de <> 'interno' and m.texto <> ''
                          order by m.fecha desc limit 1) u on true
     where r.organizacion_id = $1 and (r.estado <> 'resuelto' or r.fecha > now() - interval '${DIAS_RECLAMOS} days')
       and ${sqlBusqueda("$2", ["cl.nombre", "r.motivo", "r.id_externo"])}
     order by greatest(r.fecha, coalesce(u.fecha, r.fecha)) desc limit 200`, [org, parametroBusqueda(q)]);
  return filas.map((f) => ({
    clave: `r:${f.id}`, origen: "reclamo" as Origen,
    nombre: f.nombre || `Reclamo ${f.id}`,
    detalle: [`Reclamo ${f.id}`, f.canal ?? (f.origen === "web" ? "web" : f.origen === "local" ? "local" : null), f.pedido_id ? `pedido ${f.pedido_id}` : null].filter(Boolean).join(" · "),
    ultimo: f.ultimo ?? f.motivo ?? "", ultimoClase: f.de === "comprador" ? "entrante" : f.de === "vendedor" ? "operador" : f.de === "ml" ? "ml" : "entrante",
    ultimoTs: f.ts, sinResponder: f.atender, enEspera: f.atender, atiendePersona: true,
  }));
}

const DE_ORIGEN: Record<Exclude<FiltroOrigen, "todos">, (f: FilaBandeja) => boolean> = {
  whatsapp: (f) => f.origen === "whatsapp" || f.origen === "prueba", instagram: (f) => f.origen === "instagram",
  ml: (f) => f.origen === "ml", pregunta: (f) => f.origen === "pregunta", reclamo: (f) => f.origen === "reclamo",
};
const PASA: Record<FiltroBandeja, (f: FilaBandeja) => boolean> = {
  todos: () => true, sin_responder: (f) => f.sinResponder, en_espera: (f) => f.enEspera, persona: (f) => f.atiendePersona,
};

export async function fotoBandeja(org: string, puede: Puede, filtro: FiltroBandeja, origen: FiltroOrigen, q: string, abierto: string | null): Promise<FotoBandeja> {
  const ve = canales(puede);
  const [sello, c, cred, chats, ml, preguntas, reclamos] = await Promise.all([
    selloDe(org), configMensajes(org), credencialDeOrg(org),
    ve.chats ? filasChats(org, q) : [], ve.ml ? filasMl(org, q) : [], ve.ml ? filasPreguntas(org, q) : [], ve.reclamos ? filasReclamos(org, q) : [],
  ]);
  const todas = [...chats, ...ml, ...preguntas, ...reclamos].sort((a, b) => b.ultimoTs.localeCompare(a.ultimoTs));
  const deOrigen = origen === "todos" ? todas : todas.filter(DE_ORIGEN[origen]);
  const cuantos = Object.fromEntries((Object.keys(PASA) as FiltroBandeja[]).map((k) => [k, deOrigen.filter(PASA[k]).length])) as Record<FiltroBandeja, number>;
  const enFiltro = todas.filter(PASA[filtro]);
  const porOrigen = Object.fromEntries(ORIGENES.map((o) => [o.clave, o.clave === "todos" ? enFiltro.length : enFiltro.filter(DE_ORIGEN[o.clave as Exclude<FiltroOrigen, "todos">]).length])) as Record<FiltroOrigen, number>;
  return {
    sello, filas: deOrigen.filter(PASA[filtro]).slice(0, 300), cuantos, porOrigen,
    abierto: abierto ? await conversacionAbierta(org, puede, abierto) : null,
    iaActiva: c.iaActiva, nombreIa: c.nombre, conectado: !!cred,
  };
}

/** La conversación abierta, venga de donde venga. */
export async function conversacionAbierta(org: string, puede: Puede, clave: string): Promise<ChatAbierto | null> {
  const k = partirClave(clave);
  if (!k) return null;
  const ve = canales(puede);
  if (k.tipo === "c") return ve.chats ? chatAbierto(org, Number(k.id)) : null;
  if (k.tipo === "m") return ve.ml ? mlAbierta(org, k.id) : null;
  if (k.tipo === "p") return ve.ml ? preguntaAbierta(org, k.id) : null;
  return ve.reclamos ? reclamoAbierto(org, Number(k.id)) : null;
}

export async function chatAbierto(org: string, id: number): Promise<ChatAbierto | null> {
  if (!Number.isInteger(id)) return null;
  const ch = await una<{ id: number; canal: "whatsapp" | "instagram" | "prueba"; nombre: string; externo: string; cliente_id: number | null; cliente_nombre: string | null;
    atiende: boolean; notas: string; ultimo_entrante_ts: string | null }>(`
    select ch.id::int, ch.canal, ch.nombre, ch.externo, ch.cliente_id::int, cl.nombre cliente_nombre, ch.atiende_persona_desde is not null atiende,
           ch.notas, ch.ultimo_entrante_ts::text
      from chat ch left join cliente cl on cl.id = ch.cliente_id where ch.organizacion_id = $1 and ch.id = $2`, [org, id]);
  if (!ch) return null;
  const [mensajes, casos] = await Promise.all([
    consulta<{ id: number; clase: MensajeVista["clase"]; texto: string; ts: string; estado: string | null; motivo: string | null; quien: string | null; usd: number; herramientas: { nombre: string }[] }>(`
      select * from (
        select m.id::int, m.clase, m.texto, m.ts::text, m.estado_entrega estado, m.entrega_motivo motivo, u.nombre quien, m.usd::float, m.herramientas
          from chat_mensaje m left join usuarios u on u.id = m.usuario_id
         where m.chat_id = $1 and m.texto <> '' order by m.id desc limit 300) x order by id`, [id]),
    consulta<{ id: number; asunto: string; motivo: string; abierto_ts: string; asignado: string | null }>(`
      select k.id::int, k.asunto, k.motivo, k.abierto_ts::text, u.nombre asignado from chat_caso k left join usuarios u on u.id = k.asignado_a
       where k.chat_id = $1 and k.resuelto_ts is null order by k.id`, [id]),
  ]);
  const abierta = ch.canal === "prueba" || ventanaAbierta(ch.ultimo_entrante_ts);
  const canal = ch.canal === "instagram" ? "Instagram" : "WhatsApp";
  return {
    clave: `c:${ch.id}`, origen: ch.canal,
    nombre: ch.cliente_nombre || ch.nombre || (ch.canal === "prueba" ? "Prueba" : ch.canal === "whatsapp" ? telefonoLindo(ch.externo) : ch.externo),
    detalle: ch.canal === "whatsapp" ? `WhatsApp · ${telefonoLindo(ch.externo)}${ch.cliente_id ? "" : " · no es cliente cargado"}` : ch.canal === "instagram" ? "Instagram" : "Prueba desde el panel",
    enlaces: ch.cliente_id ? [{ texto: "Ficha del cliente", href: `/ventas/clientes/${ch.cliente_id}` }] : [],
    ia: ch.canal === "prueba" ? null : { prendida: !ch.atiende }, notas: ch.notas,
    casos: casos.map((c) => ({ id: c.id, asunto: c.asunto, motivo: c.motivo, abiertoTs: c.abierto_ts, asignado: c.asignado, resolver: true })),
    mensajes: mensajes.map((m) => ({
      id: String(m.id), clase: m.clase, texto: m.texto, ts: m.ts, estado: m.estado, motivo: m.motivo, quien: m.quien, usd: m.usd,
      herramientas: (m.herramientas ?? []).map((h) => h.nombre),
      ...(m.clase === "ia" && ch.canal !== "prueba" ? { corregir: { origen: "whatsapp" as const, id: String(m.id) } } : {}),
    })),
    aviso: null,
    escribir: {
      puede: abierta, porQueNo: abierta ? null : `Pasaron más de 24 horas desde el último mensaje del cliente: ${canal} no deja escribirle desde acá. Cuando vuelva a escribir, seguís desde acá.`,
      tope: 4096, ayuda: null, proponer: false, sugerencia: null, canalId: null,
    },
  };
}

const AVISO_IA: Record<string, string> = {
  falta_dato: "La IA no la mandó sola: le falta un dato. Revisá la respuesta propuesta.",
  persona: "Pidió hablar con una persona: la IA no contesta más sola.",
  nada: "El último mensaje no necesita respuesta (lo vio la IA).",
};

async function mlAbierta(org: string, pack: string): Promise<ChatAbierto | null> {
  const c = await una<{ pack_id: string; canal_id: number | null; canal: string | null; firma: string | null; pedido_id: number | null; nombre: string | null;
    venta_id: number | null; titulo: string | null; sugerencia: string | null; ia_estado: string | null; persona: boolean; derivada: boolean; producto_id: number | null }>(`
    select c.pack_id, c.canal_id::int, ca.nombre canal, nullif(trim(ca.config ->> 'firma'), '') firma, c.pedido_id::int, coalesce(cl.nombre, mv.comprador) nombre,
           mv.venta_id, mv.titulo, c.sugerencia, c.ia_estado, (c.pidio_persona_ts is not null or c.derivada_ts is not null) persona,
           ${SQL_DERIVADA_ESPERA("c")} derivada,
           (select v.producto_id::int from pedido_linea l join variacion v on v.id = l.variacion_id where l.pedido_id = c.pedido_id order by l.id limit 1) producto_id
      from meli_conversacion c left join canal ca on ca.id = c.canal_id left join pedido p on p.id = c.pedido_id
      left join cliente cl on cl.id = p.cliente_id ${VENTA_DEL_PACK("c")}
     where c.organizacion_id = $1 and c.pack_id = $2`, [org, pack]);
  if (!c) return null;
  const mensajes = await consulta<{ id: string; de_vendedor: boolean; texto: string | null; fecha: string; usuario: string | null; con_ia: boolean; auto: boolean }>(`
    select m.id, m.de_vendedor, m.texto, m.fecha::text, u.nombre usuario, m.con_ia, m.auto from meli_mensaje m left join usuarios u on u.id = m.usuario_id
     where m.organizacion_id = $1 and m.pack_id = $2 order by m.fecha`, [org, pack]);
  // Abrirla la da por leída en Laucen (como la pestaña Mensajes de Preguntas y mensajes).
  await consulta("update meli_conversacion set sin_leer = 0 where organizacion_id = $1 and pack_id = $2 and sin_leer > 0", [org, pack]);
  return {
    clave: `m:${c.pack_id}`, origen: "ml", nombre: c.nombre || `Pack ${c.pack_id}`,
    detalle: ["Mercado Libre", c.canal, c.titulo].filter(Boolean).join(" · "),
    enlaces: [
      ...(c.pedido_id ? [{ texto: `Pedido ${c.pedido_id}`, href: `/ventas/pedidos/${c.pedido_id}` }] : []),
      ...(c.venta_id ? [{ texto: "Ver la venta", href: `/ventas/historial/${c.venta_id}` }] : []),
      ...(c.producto_id ? [{ texto: "Ficha del producto", href: `/catalogo/productos/${c.producto_id}` }] : []),
    ],
    ia: { prendida: !c.persona }, notas: null,
    casos: c.derivada ? [{ id: 0, asunto: "Derivada a una persona", motivo: "La IA le avisó al comprador que una persona del equipo le va a responder. Sale de «En espera» cuando le escribas.", abiertoTs: "", asignado: null, resolver: false }] : [],
    mensajes: mensajes.map((m) => ({
      id: m.id, texto: m.texto ?? "(adjunto)", ts: m.fecha, estado: null, motivo: null, usd: 0, herramientas: [],
      clase: !m.de_vendedor ? "entrante" : m.auto ? "ia" : m.usuario ? "operador" : "desde_el_telefono",
      quien: m.de_vendedor && !m.auto ? (m.usuario ? `${m.usuario}${m.con_ia ? " con la IA" : ""}` : "Desde Mercado Libre") : null,
      ...(m.de_vendedor && (m.auto || m.con_ia) && m.texto ? { corregir: { origen: "mensaje" as const, id: m.id } } : {}),
    })),
    aviso: c.ia_estado && AVISO_IA[c.ia_estado] && (c.sugerencia || c.ia_estado !== "falta_dato") ? AVISO_IA[c.ia_estado] : null,
    escribir: {
      puede: true, porQueNo: null, tope: 350, proponer: true, sugerencia: c.sugerencia || null, canalId: c.canal_id,
      ayuda: `Hasta 350 caracteres (el límite de Mercado Libre). Sin teléfonos ni mails.${c.firma ? ` Se agrega la firma «${c.firma}».` : ""}`,
    },
  };
}

async function preguntaAbierta(org: string, id: string): Promise<ChatAbierto | null> {
  if (!/^\d{1,20}$/.test(id)) return null;
  const q = await una<{ id: string; canal_id: number | null; canal: string | null; firma: string | null; texto: string; fecha: string; estado: string;
    respuesta: string | null; respondida_ts: string | null; respondida_por: string | null; respondida_auto: boolean; respondida_con_ia: boolean;
    sugerencia: string | null; ia_estado: string | null; titulo: string | null; permalink: string | null; item_id: string; producto_id: number | null }>(`
    select q.id::text, q.canal_id::int, ca.nombre canal, nullif(trim(ca.config ->> 'firma'), '') firma, q.texto, q.fecha::text, q.estado,
           q.respuesta, q.respondida_ts::text, u.nombre respondida_por, q.respondida_auto, q.respondida_con_ia, q.sugerencia, q.ia_estado,
           coalesce(mi.titulo, pu.titulo) titulo, mi.permalink, q.item_id,
           (select v.producto_id::int from variacion v where v.id = pu.variacion_id) producto_id
      from meli_pregunta q left join canal ca on ca.id = q.canal_id left join publicacion pu on pu.id = q.publicacion_id
      left join usuarios u on u.id = q.respondida_por
      left join lateral (select titulo, permalink from meli_item m where m.organizacion_id = q.organizacion_id and m.item_id = q.item_id limit 1) mi on true
     where q.organizacion_id = $1 and q.id = $2::bigint`, [org, id]);
  if (!q) return null;
  const pendiente = q.estado === "UNANSWERED";
  const mensajes: MensajeVista[] = [{ id: `${q.id}:p`, clase: "entrante", texto: q.texto, ts: q.fecha, estado: null, motivo: null, quien: null, usd: 0, herramientas: [] }];
  if (q.respuesta) {
    mensajes.push({
      id: `${q.id}:r`, clase: q.respondida_auto ? "ia" : "operador", texto: q.respuesta, ts: q.respondida_ts ?? q.fecha, estado: null, motivo: null, usd: 0, herramientas: [],
      quien: q.respondida_auto ? null : q.respondida_por ? `${q.respondida_por}${q.respondida_con_ia ? " con la IA" : ""}` : "Desde Mercado Libre",
      ...(q.respondida_auto || q.respondida_con_ia ? { corregir: { origen: "pregunta" as const, id: q.id } } : {}),
    });
  }
  return {
    clave: `p:${q.id}`, origen: "pregunta", nombre: q.titulo ? `Pregunta: ${q.titulo}` : "Pregunta",
    detalle: ["Pregunta de Mercado Libre", q.canal, q.item_id].filter(Boolean).join(" · "),
    enlaces: [
      ...(q.permalink ? [{ texto: "Ver la publicación", href: q.permalink, afuera: true }] : []),
      ...(q.producto_id ? [{ texto: "Ficha del producto", href: `/catalogo/productos/${q.producto_id}` }] : []),
    ],
    ia: null, notas: null, casos: [], mensajes,
    aviso: pendiente && q.ia_estado && AVISO_IA[q.ia_estado] ? AVISO_IA[q.ia_estado] : null,
    escribir: {
      puede: pendiente, porQueNo: pendiente ? null : "Ya está respondida.", tope: 2000, proponer: pendiente, sugerencia: pendiente ? q.sugerencia || null : null,
      canalId: q.canal_id, ayuda: `Hasta 2.000 caracteres. Sin teléfonos, mails ni links de afuera.${q.firma ? ` Se agrega la firma «${q.firma}».` : ""}`,
    },
  };
}

async function reclamoAbierto(org: string, id: number): Promise<ChatAbierto | null> {
  if (!Number.isInteger(id)) return null;
  const r = await una<{ id: number; origen: string; tipo: string | null; motivo: string | null; canal: string | null; nombre: string | null; cliente_id: number | null;
    pedido_id: number | null; estado: string; vence: string | null; atender: boolean; puede_mensaje: boolean }>(`
    select r.id::int, r.origen, r.tipo, r.motivo, ca.nombre canal, cl.nombre, r.cliente_id::int, r.pedido_id::int, r.estado,
           to_char(r.vence_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM "a las" HH24:MI') vence, ${SQL_RECLAMO_A_ATENDER} atender,
           coalesce(r.acciones_disponibles @> '[{"action": "send_message_to_complainant"}]'::jsonb, false) puede_mensaje
      from reclamo r left join canal ca on ca.id = r.canal_id left join cliente cl on cl.id = r.cliente_id
     where r.organizacion_id = $1 and r.id = $2`, [org, id]);
  if (!r) return null;
  const mensajes = await consulta<{ id: number; de: string; texto: string | null; fecha: string; quien: string | null }>(`
    select m.id::int, m.de, m.texto, m.fecha::text, u.nombre quien from reclamo_mensaje m left join usuarios u on u.id = m.usuario_id
     where m.reclamo_id = $1 and m.organizacion_id = $2 and m.de <> 'interno' order by m.fecha, m.id`, [id, org]);
  const deMl = r.origen === "mercadolibre";
  const porQueNo = r.estado === "resuelto" ? "El reclamo está cerrado."
    : !deMl ? "Es un reclamo de la web o del local: se atiende desde su ficha."
    : !r.puede_mensaje ? "Mercado Libre no deja mandarle un mensaje al comprador en este momento (tocá «Actualizar» en la ficha del reclamo)." : null;
  return {
    clave: `r:${r.id}`, origen: "reclamo", nombre: r.nombre || `Reclamo ${r.id}`,
    detalle: [`Reclamo ${r.id}`, r.canal, r.motivo].filter(Boolean).join(" · "),
    enlaces: [
      { texto: "Ficha del reclamo (devolución, mediación…)", href: `/ventas/reclamos/${r.id}` },
      ...(r.pedido_id ? [{ texto: `Pedido ${r.pedido_id}`, href: `/ventas/pedidos/${r.pedido_id}` }] : []),
      ...(r.cliente_id ? [{ texto: "Ficha del cliente", href: `/ventas/clientes/${r.cliente_id}` }] : []),
    ],
    ia: null, notas: null,
    casos: r.atender ? [{ id: 0, asunto: "Reclamo para atender", motivo: r.vence ? `Hay que responder antes del ${r.vence}.` : "Está esperando que lo atiendas.", abiertoTs: "", asignado: null, resolver: false }] : [],
    mensajes: mensajes.map((m) => ({
      id: String(m.id), texto: m.texto || "(adjunto)", ts: m.fecha, estado: null, motivo: null, usd: 0, herramientas: [],
      clase: m.de === "comprador" ? "entrante" : m.de === "ml" ? "ml" : "operador",
      quien: m.de === "ml" ? "Mercado Libre" : m.de === "vendedor" ? m.quien ?? "Vendedor" : null,
    })),
    aviso: null,
    escribir: { puede: !porQueNo, porQueNo, tope: 2000, proponer: false, sugerencia: null, canalId: null,
      ayuda: "Le llega al comprador dentro del reclamo de Mercado Libre. Sale en unos segundos (por la cola de Mercado Libre)." },
  };
}
