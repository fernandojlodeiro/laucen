// Informe "Promociones de ML" como tres listas (lib/listas/tipos.ts): la historia de cada cambio, las publicaciones
// que están en una campaña y las campañas de cada cuenta. Salen de lo que Laucen lee de Mercado Libre y registra
// (lib/precios-ml/promos.ts, db/precios_ml.sql). Cada una sirve a la pantalla y a "Descargar Excel".

import Link from "next/link";
import { parametroBusqueda, sqlBusqueda, type CampoBusqueda } from "@/lib/busqueda";
import { campoFecha, traducido, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import { hoyArgentina, rangoDeAtajo } from "@/lib/rango-fechas";
import { ESTADOS_PROMO, QUE_PROMO, TIPOS_PROMO, descuentoPct, textoValorPromo } from "./formato";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";

export const BASE_PROMOS = "/informes/promociones";
const ZONA = "'America/Argentina/Buenos_Aires'";
const ENLACE = "text-[#16577F] hover:underline";
const esFecha = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");

/** Los filtros comunes de las tres pestañas, leídos de la dirección. */
export function filtrosPromos(sp: SP, hoy: string = hoyArgentina()) {
  const defecto = rangoDeAtajo("7dias", hoy);
  const desde = esFecha(sp.desde), hasta = esFecha(sp.hasta);
  const ver = sp.ver === "campanas" || sp.ver === "publicaciones" ? sp.ver : "historia";
  return {
    ver,
    desde: desde || (hasta ? "" : defecto.desde), hasta: hasta || (desde ? "" : defecto.hasta),
    canal: Number(sp.canal) || 0,
    q: sp.q?.trim() ?? "", comienza: sp.contiene !== "1",
    promo: sp.promo?.trim() ?? "",
    grupo: ["campanas", "publicaciones", "precios"].includes(sp.grupo ?? "") ? (sp.grupo as string) : "",
    estado: sp.estado ?? "",
    tipo: sp.tipo?.trim() ?? "",
  };
}
export type FiltrosPromos = ReturnType<typeof filtrosPromos>;

// ── Campos que se repiten ──────────────────────────────────

const campoItem = (alias: string): Campo => ({
  clave: "item", titulo: "Publicación", sql: `${alias}.item_id`, ancho: 16, usa: ["permalink"],
  celda: (f) => <span className="font-mono whitespace-nowrap">{f.item ? <><Link href={historialPublicacion(f.item)} className={ENLACE} title="Historial de esta publicación">{f.item}</Link> <a href={enlaceMl(f.item, f.permalink)} target="_blank" rel="noopener noreferrer" className={ENLACE} title="Ver en Mercado Libre">↗</a></> : "—"}</span>,
});
const CAMPOS_PUBLICACION: Campo[] = [
  { clave: "permalink", titulo: "Enlace en ML", sql: "mi.permalink", orden: false, ancho: 40 },
  {
    clave: "sku", titulo: "SKU", sql: "coalesce(v.sku, mi.sku)", ancho: 18,
    celda: (f) => f.producto_id ? <Link href={`/catalogo/productos/${f.producto_id}`} className={`${ENLACE} font-semibold whitespace-nowrap`}>{f.sku}</Link> : <span className="whitespace-nowrap">{f.sku ?? "—"}</span>,
  },
  { clave: "titulo", titulo: "Título", sql: "mi.titulo", ancho: 50 },
];
const JOIN_PUBLICACION = (alias: string) => `
  join canal ca on ca.id = ${alias}.canal_id
  left join lateral (select m.titulo, m.sku, m.permalink, m.precio, m.publicacion_id from meli_item m
                      where m.canal_id = ${alias}.canal_id and m.item_id = ${alias}.item_id order by m.variation_id limit 1) mi on true
  left join publicacion pu on pu.id = mi.publicacion_id
  left join variacion v on v.id = pu.variacion_id`;
/** Un código traducido como se ve en pantalla, para buscarlo en SQL. */
const enCriolloSql = (col: string, mapa: Record<string, string>) =>
  `case ${col} ${Object.entries(mapa).map(([k, v]) => `when '${k}' then '${v.replace(/'/g, "''")}'`).join(" ")} end`;
/** Regla común de búsqueda (lib/busqueda.ts): los campos de texto de la fila (`propios`), la cuenta
 *  y la publicación. */
const condBusqueda = (alias: string, b: string, propios: CampoBusqueda[]) =>
  sqlBusqueda(b, [`${alias}.item_id`, `${alias}.promocion_id`, `${alias}.nombre`, `${alias}.tipo`, enCriolloSql(`${alias}.tipo`, TIPOS_PROMO),
    ...propios, "ca.nombre", "v.sku", "mi.sku", "mi.titulo"]);

// ── 1. Historia ────────────────────────────────────────────

const CAMPOS_HISTORIA: Campo[] = [
  campoFecha("fecha", "Fecha y hora", "h.fecha", { hora: true }),
  { clave: "cuenta", titulo: "Cuenta", sql: "ca.nombre", ancho: 16 },
  { clave: "que", titulo: "Qué pasó", sql: "h.que", valor: traducido("que", QUE_PROMO), ancho: 34 },
  { clave: "campana", titulo: "Campaña", sql: "coalesce(h.nombre, h.promocion_id)", ancho: 34, usa: ["promocion_id"],
    celda: (f) => <Link href={`${BASE_PROMOS}?ver=historia&promo=${encodeURIComponent(f.promocion_id)}`} className={ENLACE} title="Toda la historia de esta campaña">{f.campana}</Link> },
  { clave: "promocion_id", titulo: "N.º de campaña", sql: "h.promocion_id", ancho: 16 },
  { clave: "tipo", titulo: "Tipo", sql: "h.tipo", valor: traducido("tipo", TIPOS_PROMO), ancho: 24 },
  campoItem("h"),
  ...CAMPOS_PUBLICACION,
  { clave: "antes", titulo: "Antes", sql: "h.antes", orden: false, usa: ["que"], valor: (f) => textoValorPromo(f.que, f.antes), ancho: 26 },
  { clave: "despues", titulo: "Después", sql: "h.despues", orden: false, usa: ["que"], valor: (f) => textoValorPromo(f.que, f.despues), ancho: 26 },
  { clave: "precio_antes", titulo: "Precio antes", sql: "h.precio_antes", formato: "pesos", fiscal: true, ancho: 14 },
  { clave: "precio_despues", titulo: "Precio después", sql: "h.precio_despues", formato: "pesos", fiscal: true, ancho: 14 },
  { clave: "pct", titulo: "Variación %", formato: "pct", sql: "case when h.precio_antes > 0 and h.precio_despues is not null then round((h.precio_despues / h.precio_antes - 1) * 100, 1) end" },
];

export const LISTA_PROMO_HISTORIA: Lista = {
  pantalla: "promociones-historia", titulo: "Promociones de ML — historia", ruta: BASE_PROMOS, permiso: "informes_publicaciones_ver",
  campos: CAMPOS_HISTORIA,
  enPantalla: ["fecha", "cuenta", "que", "campana", "item", "sku", "titulo", "antes", "despues", "precio_antes", "precio_despues", "pct"],
  siempre: "h.id::int as id, v.producto_id::int as producto_id, h.canal_id::int as canal_id",
  porDefecto: "fecha",
  consulta: async (ctx, sp) => {
    const f = filtrosPromos(sp);
    const valores: unknown[] = [ctx.org];
    const p = (v: unknown) => { valores.push(v); return `$${valores.length}`; };
    const donde = ["h.organizacion_id = $1"];
    if (f.desde) donde.push(`h.fecha >= (${p(f.desde)}::date)::timestamp at time zone ${ZONA}`);
    if (f.hasta) donde.push(`h.fecha < (${p(f.hasta)}::date + 1)::timestamp at time zone ${ZONA}`);
    if (f.canal) donde.push(`h.canal_id = ${p(f.canal)}`);
    if (f.promo) donde.push(`h.promocion_id = ${p(f.promo)}`);
    if (f.grupo === "campanas") donde.push("h.item_id is null");
    if (f.grupo === "publicaciones") donde.push("h.item_id is not null");
    if (f.grupo === "precios") donde.push("(h.que = 'item_precio' or h.precio_antes is distinct from h.precio_despues)");
    if (f.tipo) donde.push(`h.tipo = ${p(f.tipo)}`);
    if (f.q) donde.push(condBusqueda("h", p(parametroBusqueda(f.q, f.comienza)), ["h.id::text", "h.que", "h.antes", "h.despues"]));
    return { desde: `ml_promo_historia h ${JOIN_PUBLICACION("h")}`, donde: donde.join(" and "), valores, orden: "h.fecha desc, h.id desc" };
  },
};

// ── 2. Publicaciones en campañas ───────────────────────────

const CAMPOS_PUBLICACIONES: Campo[] = [
  { clave: "cuenta", titulo: "Cuenta", sql: "ca.nombre", ancho: 16 },
  campoItem("i"),
  ...CAMPOS_PUBLICACION,
  { clave: "campana", titulo: "Campaña", sql: "coalesce(i.nombre, i.promocion_id)", ancho: 34, usa: ["promocion_id"],
    celda: (f) => <Link href={`${BASE_PROMOS}?ver=historia&promo=${encodeURIComponent(f.promocion_id)}`} className={ENLACE}>{f.campana}</Link> },
  { clave: "promocion_id", titulo: "N.º de campaña", sql: "i.promocion_id", ancho: 16 },
  { clave: "tipo", titulo: "Tipo", sql: "i.tipo", valor: traducido("tipo", TIPOS_PROMO), ancho: 24 },
  { clave: "estado", titulo: "Estado", sql: "i.estado", valor: traducido("estado", ESTADOS_PROMO), ancho: 14 },
  { clave: "precio_actual", titulo: "Precio hoy en ML", sql: "mi.precio", formato: "pesos", fiscal: true, ancho: 14 },
  { clave: "precio", titulo: "Precio en la campaña", sql: "i.precio", formato: "pesos", fiscal: true, ancho: 16 },
  { clave: "precio_original", titulo: "Precio de lista", sql: "i.precio_original", formato: "pesos", fiscal: true, ancho: 14 },
  { clave: "descuento", titulo: "Descuento %", formato: "pct", sql: "case when i.precio_original > 0 and i.precio is not null then round((1 - i.precio / i.precio_original) * 100, 1) end",
    usa: ["precio", "precio_original"], valor: (f) => descuentoPct(f.precio_original, f.precio) },
  { clave: "min_precio", titulo: "Mínimo que acepta ML", sql: "i.min_precio", formato: "pesos", fiscal: true, ancho: 16 },
  { clave: "max_precio", titulo: "Máximo con descuento", sql: "i.max_precio", formato: "pesos", fiscal: true, ancho: 16 },
  { clave: "pct_meli", titulo: "% que pone ML", sql: "coalesce(i.pct_meli, cp.pct_meli)", formato: "pct" },
  { clave: "pct_vendedor", titulo: "% que ponés vos", sql: "coalesce(i.pct_vendedor, cp.pct_vendedor)", formato: "pct" },
  // Si la publicación no trae sus fechas (las campañas tradicionales no las dan por publicación), las de la campaña.
  campoFecha("desde", "Desde", "coalesce(i.desde, cp.desde)", { hora: true }),
  campoFecha("hasta", "Hasta", "coalesce(i.hasta, cp.hasta)", { hora: true }),
  campoFecha("limite", "Se puede entrar hasta", "coalesce(i.limite, cp.limite)", { hora: true }),
  campoFecha("visto", "Visto por primera vez", "i.visto_ts", { hora: true }),
  campoFecha("leido", "Última lectura", "i.leido_ts", { hora: true }),
];

export const LISTA_PROMO_PUBLICACIONES: Lista = {
  pantalla: "promociones-publicaciones", titulo: "Promociones de ML — publicaciones en campañas", ruta: BASE_PROMOS, permiso: "informes_publicaciones_ver",
  campos: CAMPOS_PUBLICACIONES,
  enPantalla: ["cuenta", "item", "sku", "titulo", "campana", "estado", "precio_actual", "precio", "descuento", "hasta"],
  siempre: "v.producto_id::int as producto_id, i.canal_id::int as canal_id",
  porDefecto: "hasta",
  consulta: async (ctx, sp) => {
    const f = filtrosPromos(sp);
    const valores: unknown[] = [ctx.org];
    const p = (v: unknown) => { valores.push(v); return `$${valores.length}`; };
    const donde = ["i.organizacion_id = $1"];
    // Sin elegir: las que están adentro de una campaña (en curso o por empezar).
    if (f.estado === "candidate") donde.push("i.estado = 'candidate'");
    else if (f.estado === "todas") donde.push("true");
    else donde.push("i.estado in ('started', 'pending')");
    if (f.canal) donde.push(`i.canal_id = ${p(f.canal)}`);
    if (f.promo) donde.push(`i.promocion_id = ${p(f.promo)}`);
    if (f.tipo) donde.push(`i.tipo = ${p(f.tipo)}`);
    if (f.q) donde.push(condBusqueda("i", p(parametroBusqueda(f.q, f.comienza)), ["i.estado", enCriolloSql("i.estado", ESTADOS_PROMO), "i.oferta_id", "cp.nombre"]));
    return {
      desde: `ml_promo_item i left join ml_promo_campana cp on cp.canal_id = i.canal_id and cp.promocion_id = i.promocion_id ${JOIN_PUBLICACION("i")}`,
      donde: donde.join(" and "), valores, orden: "coalesce(i.hasta, cp.hasta) nulls last, i.item_id",
    };
  },
};

// ── 3. Campañas ────────────────────────────────────────────

const CAMPOS_CAMPANAS: Campo[] = [
  { clave: "cuenta", titulo: "Cuenta", sql: "ca.nombre", ancho: 16 },
  { clave: "nombre", titulo: "Campaña", sql: "coalesce(c.nombre, c.promocion_id)", ancho: 40, usa: ["promocion_id"],
    celda: (f) => <Link href={`${BASE_PROMOS}?ver=historia&promo=${encodeURIComponent(f.promocion_id)}`} className={ENLACE} title="Toda la historia de esta campaña">{f.nombre}</Link> },
  { clave: "promocion_id", titulo: "N.º de campaña", sql: "c.promocion_id", ancho: 16 },
  { clave: "tipo", titulo: "Tipo", sql: "c.tipo", valor: traducido("tipo", TIPOS_PROMO), ancho: 24 },
  { clave: "subtipo", titulo: "Subtipo", sql: "c.subtipo", ancho: 18 },
  { clave: "estado", titulo: "Estado", sql: "c.estado", valor: traducido("estado", ESTADOS_PROMO), ancho: 14 },
  campoFecha("desde", "Desde", "c.desde", { hora: true }),
  campoFecha("hasta", "Hasta", "c.hasta", { hora: true }),
  campoFecha("limite", "Se puede entrar hasta", "c.limite", { hora: true }),
  { clave: "pct_meli", titulo: "% que pone ML", sql: "c.pct_meli", formato: "pct" },
  { clave: "pct_vendedor", titulo: "% que ponés vos", sql: "c.pct_vendedor", formato: "pct" },
  { clave: "en_curso", titulo: "Publicaciones adentro", formato: "entero", desc: true,
    sql: "(select count(*) from ml_promo_item i where i.canal_id = c.canal_id and i.promocion_id = c.promocion_id and i.estado in ('started', 'pending'))::int",
    celda: (f) => <Link href={`${BASE_PROMOS}?ver=publicaciones&promo=${encodeURIComponent(f.promocion_id)}&canal=${f.canal_id}`} className={ENLACE}>{Number(f.en_curso).toLocaleString("es-AR")}</Link> },
  { clave: "candidatas", titulo: "Pueden entrar", formato: "entero", desc: true,
    sql: "(select count(*) from ml_promo_item i where i.canal_id = c.canal_id and i.promocion_id = c.promocion_id and i.estado = 'candidate')::int" },
  campoFecha("visto", "Vista por primera vez", "c.visto_ts", { hora: true }),
  campoFecha("leido", "Última lectura", "c.leido_ts", { hora: true }),
];

export const LISTA_PROMO_CAMPANAS: Lista = {
  pantalla: "promociones-campanas", titulo: "Promociones de ML — campañas", ruta: BASE_PROMOS, permiso: "informes_publicaciones_ver",
  campos: CAMPOS_CAMPANAS,
  enPantalla: ["cuenta", "nombre", "tipo", "estado", "desde", "hasta", "pct_meli", "pct_vendedor", "en_curso", "candidatas"],
  siempre: "c.canal_id::int as canal_id",
  porDefecto: "desde",
  consulta: async (ctx, sp) => {
    const f = filtrosPromos(sp);
    const valores: unknown[] = [ctx.org];
    const p = (v: unknown) => { valores.push(v); return `$${valores.length}`; };
    const donde = ["c.organizacion_id = $1"];
    if (f.estado === "terminadas") donde.push("c.estado = 'finished'");
    else if (f.estado === "todas") donde.push("true");
    else donde.push("c.estado in ('started', 'pending', 'programmed')");
    if (f.canal) donde.push(`c.canal_id = ${p(f.canal)}`);
    if (f.tipo) donde.push(`c.tipo = ${p(f.tipo)}`);
    if (f.q) {
      donde.push(sqlBusqueda(p(parametroBusqueda(f.q, f.comienza)), ["c.nombre", "c.promocion_id", "c.tipo", enCriolloSql("c.tipo", TIPOS_PROMO),
        "c.subtipo", "c.estado", enCriolloSql("c.estado", ESTADOS_PROMO), "ca.nombre"]));
    }
    return { desde: "ml_promo_campana c join canal ca on ca.id = c.canal_id", donde: donde.join(" and "), valores, orden: "c.desde desc nulls last, c.promocion_id" };
  },
};

