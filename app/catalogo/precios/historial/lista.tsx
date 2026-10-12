// Historial de precios de lista (pedido de Fer, 12/10): cada precio que se
// cargó en una lista, con el anterior de esa variación en esa lista, cuánto
// cambió y quién (o qué) lo cambió: una persona, la regla de precio del
// seguimiento (sola o aplicada a mano) o una carga masiva. Mismos filtros
// para la pantalla y para "Descargar Excel".

import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import type { Lista, SP } from "@/lib/listas/tipos";

/** Cada precio con el anterior de la misma variación y lista (h). */
const HISTORIA = `(
  select pr.id, pr.organizacion_id, pr.lista_id, pr.variacion_id, pr.importe_ars, pr.importe_usd, pr.moneda_origen, pr.vigente_desde,
         pr.usuario_id, pr.creado_ts, pr.origen, pr.motivo,
         lag(pr.importe_ars) over w antes_ars, lag(pr.importe_usd) over w antes_usd
    from precio pr where pr.organizacion_id = $1
  window w as (partition by pr.lista_id, pr.variacion_id order by pr.vigente_desde, pr.id)) h
  join variacion v on v.id = h.variacion_id join producto p on p.id = v.producto_id
  join lista_precios l on l.id = h.lista_id left join usuarios u on u.id = h.usuario_id`;

/** Subió, bajó, igual o nuevo (el primero), comparando en la moneda en que se cargó. */
export const SENTIDO = `case when h.antes_ars is null then 'nuevo'
  when (case when h.moneda_origen = 'USD' then h.importe_usd - h.antes_usd else h.importe_ars - h.antes_ars end) > 0 then 'subio'
  when (case when h.moneda_origen = 'USD' then h.importe_usd - h.antes_usd else h.importe_ars - h.antes_ars end) < 0 then 'bajo'
  else 'igual' end`;
const PCT = `case when h.moneda_origen = 'USD' then (h.importe_usd - h.antes_usd) / nullif(h.antes_usd, 0) else (h.importe_ars - h.antes_ars) / nullif(h.antes_ars, 0) end * 100`;
/** Quién: la persona, o la regla del seguimiento cuando la cambió sola. */
export const QUIEN = `case when h.origen = 'seguimiento' and h.usuario_id is null then 'Regla de seguimiento (automática)'
  when h.origen = 'seguimiento' then coalesce(u.nombre, u.email, '—') || ' (aplicó la regla de seguimiento)'
  when h.origen = 'masivo' then coalesce(u.nombre, u.email, 'Carga masiva') || ' (carga masiva)'
  when h.origen = 'copia' then 'Copiado al duplicar el producto'
  when h.origen = 'ajuste' or (h.usuario_id is not null and u.id is null) then 'Ajuste en lote (ver motivo)'
  else coalesce(u.nombre, u.email, 'Carga directa (sin usuario)') end`;

export const SENTIDOS = { cambios: "Subieron o bajaron", subio: "Sólo los que subieron", bajo: "Sólo los que bajaron", nuevo: "Precios cargados por primera vez", todos: "Todos" } as const;
export type Sentido = keyof typeof SENTIDOS;
export const sentidoDe = (x: string | undefined): Sentido => (x && Object.hasOwn(SENTIDOS, x) ? (x as Sentido) : "cambios");

export const LISTA_HISTORIAL_PRECIOS: Lista = {
  pantalla: "historial_precios",
  titulo: "Historial de precios de lista",
  ruta: "/catalogo/precios/historial",
  permiso: "precios_ver",
  campos: [
    { clave: "fecha", titulo: "Cuándo", sql: "to_char(h.creado_ts at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI')", orden: "h.creado_ts", formato: "fechahora", desc: true },
    { clave: "sku", titulo: "SKU", sql: "v.sku", ancho: 14 },
    { clave: "titulo", titulo: "Producto", sql: "coalesce(v.titulo, p.titulo)", orden: "lower(coalesce(v.titulo, p.titulo))", ancho: 45 },
    { clave: "lista", titulo: "Lista", sql: "l.nombre", ancho: 16 },
    { clave: "antes", titulo: "Antes", sql: "h.antes_ars::float8", formato: "pesos" },
    { clave: "despues", titulo: "Después", sql: "h.importe_ars::float8", formato: "pesos" },
    { clave: "pct", titulo: "Cambio %", sql: `round((${PCT})::numeric, 1)::float8`, orden: PCT, formato: "pct" },
    { clave: "moneda", titulo: "Cargado en", sql: "h.moneda_origen", ancho: 8 },
    { clave: "quien", titulo: "Quién", sql: QUIEN, ancho: 30 },
    { clave: "motivo", titulo: "Motivo", sql: "h.motivo", ancho: 40 },
    { clave: "vigente", titulo: "Rige desde", sql: "to_char(h.vigente_desde, 'YYYY-MM-DD')", orden: "h.vigente_desde", formato: "fecha" },
  ],
  enPantalla: ["fecha", "sku", "titulo", "lista", "antes", "despues", "pct", "quien", "motivo"],
  porDefecto: "fecha",
  consulta: async (ctx, sp) => filtrosHistorial(ctx.org, sp),
};

/** El FROM y el WHERE con los filtros de la pantalla (fechas, sentido, lista, quién y búsqueda). */
export function filtrosHistorial(org: string, sp: SP) {
  const valores: unknown[] = [org, parametroBusqueda(sp.q, sp.contiene !== "1")];
  const donde = [`h.organizacion_id = $1`, sqlBusqueda("$2", ["v.sku", "v.titulo", "p.titulo", "p.sku_base", "h.motivo"])];
  const sentido = sentidoDe(sp.sentido);
  if (sentido === "cambios") donde.push(`${SENTIDO} in ('subio', 'bajo')`);
  else if (sentido !== "todos") donde.push(`${SENTIDO} = '${sentido}'`);
  // Días en hora argentina, como el resto de los filtros de fechas.
  if (sp.desde && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde)) { valores.push(sp.desde); donde.push(`h.creado_ts >= ($${valores.length}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'`); }
  if (sp.hasta && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta)) { valores.push(sp.hasta); donde.push(`h.creado_ts < ($${valores.length}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`); }
  if (Number(sp.lista)) { valores.push(Number(sp.lista)); donde.push(`h.lista_id = $${valores.length}`); }
  if (Number(sp.producto)) { valores.push(Number(sp.producto)); donde.push(`p.id = $${valores.length}`); }
  if (sp.quien === "regla") donde.push("h.origen = 'seguimiento' and h.usuario_id is null");
  else if (sp.quien) { valores.push(sp.quien); donde.push(`h.usuario_id = $${valores.length}`); }
  return { desde: HISTORIA, donde: donde.join(" and "), valores, orden: "h.creado_ts desc, h.id desc" };
}

/** Lo que trae cada fila de la pantalla (y de la pestaña «Cambios de precio» de la ficha). */
export type FilaHistorial = { id: number; fecha: Date; vigente: string; producto_id: number; sku: string; titulo: string; lista: string; antes: number | null; despues: number;
  pct: number | null; sentido: string; quien: string; motivo: string | null; moneda: string; fotos: string[] | null };

export const CAMPOS_HISTORIAL = `h.id::int, h.creado_ts fecha, to_char(h.vigente_desde, 'DD/MM/YYYY') vigente, p.id::int producto_id, v.sku, coalesce(v.titulo, p.titulo) titulo,
  l.nombre lista, h.antes_ars::float8 antes, h.importe_ars::float8 despues, h.moneda_origen moneda,
  round((${PCT})::numeric, 1)::float8 pct, ${SENTIDO} sentido, ${QUIEN} quien, h.motivo,
  (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = p.id) fotos`;

/** El orden por columna (lista blanca). */
export const ORDEN_HISTORIAL = { fecha: "h.creado_ts", sku: "v.sku", titulo: "lower(coalesce(v.titulo, p.titulo))", lista: "l.nombre", antes: "h.antes_ars", despues: "h.importe_ars",
  pct: PCT, quien: QUIEN };
