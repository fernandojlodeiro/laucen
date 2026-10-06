// Informe "Cambios en publicaciones" como lista (lib/listas/tipos.ts): qué
// publicaciones de Mercado Libre cambiaron de estado, precio o stock en un
// rango de fechas, de la historia que anota el trigger de meli_item
// (meli_item_cambio, db/mercadolibre.sql). La misma consulta sirve a la
// pantalla y a "Descargar Excel" (filtros, búsqueda, agrupado y orden).
//
// Dos modos sobre la misma forma (alias c): cada cambio, o una fila por
// publicación y tipo de cambio con el primer "antes" y el último "después"
// del rango y cuántos cambios hubo.

import Link from "next/link";
import { url } from "@/app/componentes/erp";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import FotosProducto from "@/app/componentes/FotosProducto";
import { campoFecha, traducido, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import { hoyArgentina, rangoDeAtajo } from "@/lib/rango-fechas";
import { QUE_PROMO } from "@/app/informes/promociones/formato";
import { CAMPOS_CAMBIO, ORIGENES_CAMBIO, describirCambioMl, enlaceMl, esCampoCambio, historialPublicacion, textoPct, valorCambio, variacionPct, type CampoCambio } from "./formato";

export const BASE_CAMBIOS = "/informes/cambios-publicaciones";
const ZONA = "'America/Argentina/Buenos_Aires'";
const esFecha = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");
const TIPOS_DEFECTO: CampoCambio[] = ["estado", "precio"];
/** Los estados a los que puede pasar una publicación (filtro "Pasó a"; sin el parámetro, todos). */
export const ESTADOS_DESTINO = ["active", "paused", "under_review", "inactive", "closed", "payment_required"] as const;

/** Los filtros de la pantalla, leídos de la dirección. Sin fechas: los últimos 7 días.
 *  `tipos`: los campos separados por coma (sin el parámetro, estado y precio). */
export function filtrosCambios(sp: SP, hoy: string = hoyArgentina()) {
  const defecto = rangoDeAtajo("7dias", hoy);
  const desde = esFecha(sp.desde), hasta = esFecha(sp.hasta);
  const tipos = sp.tipos == null ? TIPOS_DEFECTO : [...new Set(sp.tipos.split(",").filter(esCampoCambio))];
  return {
    desde: desde || (hasta ? "" : defecto.desde),
    hasta: hasta || (desde ? "" : defecto.hasta),
    canal: Number(sp.canal) || 0,
    tipos,
    // Sin el parámetro, todos; "ninguno" = ninguno tildado.
    estados: sp.estados == null ? [...ESTADOS_DESTINO] as string[] : sp.estados.split(",").filter((e) => (ESTADOS_DESTINO as readonly string[]).includes(e)),
    externos: sp.externos === "1",
    // "Sólo si sigue en ese estado" (Fer, 6/10): tildada de entrada; "sigue=0" la destilda.
    sigue: sp.sigue !== "0",
    agrupar: sp.agrupar === "1",
    q: sp.q?.trim() ?? "",
    comienza: sp.contiene !== "1",
  };
}
export type FiltrosCambios = ReturnType<typeof filtrosCambios>;

/** Los parámetros de la dirección de estos filtros (para armar enlaces). */
export function parametrosCambios(f: FiltrosCambios) {
  const tiposDefecto = f.tipos.length === TIPOS_DEFECTO.length && TIPOS_DEFECTO.every((t) => f.tipos.includes(t));
  return {
    desde: f.desde || null, hasta: f.hasta || null, canal: f.canal || null,
    tipos: tiposDefecto ? null : f.tipos.join(",") || "ninguno",
    estados: f.estados.length === ESTADOS_DESTINO.length ? null : f.estados.join(",") || "ninguno",
    externos: f.externos ? "1" : null, sigue: f.sigue ? null : "0", agrupar: f.agrupar ? "1" : null,
    q: f.q || null, contiene: f.comienza ? null : "1",
  };
}

const ENLACE = "text-[#16577F] hover:underline";

const CAMPOS: Campo[] = [
  campoFecha("fecha", "Fecha y hora", "c.fecha", { hora: true }),
  campoFecha("primera", "Primer cambio", "c.primera", { hora: true }),
  { clave: "cuenta", titulo: "Cuenta", sql: "ca.nombre", ancho: 16 },
  {
    clave: "item", titulo: "Publicación", sql: "c.item_id", ancho: 16, usa: ["permalink", "variacion"],
    celda: (f) => (
      <span className="font-mono whitespace-nowrap">
        {/* El número abre el historial de la publicación; la flechita, Mercado Libre en otra pestaña (Fer, 6/10). */}
        <Link href={historialPublicacion(f.item)} className={ENLACE} title="Historial de esta publicación">{f.item}</Link>
        <a href={enlaceMl(f.item, f.permalink)} target="_blank" rel="noopener noreferrer" className={`${ENLACE} ml-1`} title="Ver en Mercado Libre">↗</a>
        {f.variacion && <span className="block text-[10px] text-[#5C6B76]">var. {f.variacion}</span>}
      </span>
    ),
  },
  { clave: "variacion", titulo: "Variación", sql: "nullif(c.variation_id, '')" },
  { clave: "permalink", titulo: "Enlace en ML", sql: "mi.permalink", orden: false, ancho: 40 },
  {
    clave: "sku", titulo: "SKU", sql: "coalesce(v.sku, mi.sku, c.datos ->> 'sku')", ancho: 18, usa: ["titulo"],
    celda: (f) => (
      // La foto a la izquierda y el SKU al lado, en su propio renglón: no se enciman (Fer, 6/10).
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        {f.producto_id && <FotosProducto fotos={f.fotos} titulo={String(f.titulo ?? f.sku ?? "")} />}
        {f.producto_id ? <Link href={`/catalogo/productos/${f.producto_id}`} className={`${ENLACE} font-semibold`}>{f.sku}</Link> : f.sku ?? "—"}
      </span>
    ),
  },
  { clave: "titulo", titulo: "Título", sql: "coalesce(mi.titulo, c.datos ->> 'titulo')", ancho: 50 },
  { clave: "campo", titulo: "Qué cambió", sql: "c.campo", valor: traducido("campo", CAMPOS_CAMBIO) },
  { clave: "antes", titulo: "Antes", sql: "c.antes", orden: false, usa: ["campo"], valor: (f) => valorCambio(f.campo, f.antes), ancho: 16 },
  { clave: "despues", titulo: "Después", sql: "c.despues", orden: false, usa: ["campo"], valor: (f) => valorCambio(f.campo, f.despues), ancho: 16 },
  {
    clave: "cambio", titulo: "Cambio", orden: false,
    usa: ["campo", "antes", "despues"], ancho: 34,
    valor: (f) => describirCambioMl(f.campo, f.antes, f.despues),
    celda: (f) => {
      const p = f.campo === "precio" ? variacionPct(f.antes, f.despues) : null;
      return (
        <span className="whitespace-nowrap">
          <span className="text-[#5C6B76]">{valorCambio(f.campo, f.antes)}</span> → <b>{valorCambio(f.campo, f.despues)}</b>
          {p != null && p !== 0 && <span className={`ml-1 font-semibold ${p > 0 ? "text-[#167655]" : "text-[#C03420]"}`}>{textoPct(p)}</span>}
        </span>
      );
    },
  },
  {
    clave: "pct", titulo: "Variación %", formato: "pct",
    sql: "case when c.campo in ('precio', 'stock') and c.antes ~ '^-?[0-9.]+$' and c.despues ~ '^-?[0-9.]+$' and c.antes::numeric <> 0 then round((c.despues::numeric / c.antes::numeric - 1) * 100, 1) end",
  },
  { clave: "cambios", titulo: "Cambios", sql: "c.cambios", formato: "entero", desc: true },
  {
    // Qué anotó Laucen de las campañas de ML alrededor de un cambio de precio: una campaña que empezó o terminó, la
    // publicación que entró, salió o cambió de precio en ella (lib/precios-ml/promos.ts). Sirve de pista, no de prueba.
    clave: "causa", titulo: "Posible causa (campañas de ML)", orden: false, ancho: 60,
    sql: `case when c.campo = 'precio' then (
      select string_agg(distinct coalesce(p.nombre, p.promocion_id) || '|' || p.que, '; ') from ml_promo_historia p
       where p.canal_id = c.canal_id and p.fecha between c.fecha - interval '90 minutes' and c.fecha + interval '10 minutes'
         and (p.item_id = c.item_id or (p.item_id is null and p.promocion_id in (select i.promocion_id from ml_promo_item i where i.canal_id = c.canal_id and i.item_id = c.item_id)))) end`,
    valor: (f) => !f.causa ? null : String(f.causa).split("; ").map((x) => { const [nombre, que] = x.split("|"); return `${nombre}: ${QUE_PROMO[que] ?? que}`; }).join("; "),
  },
  {
    clave: "origen", titulo: "Origen", sql: "c.origen", valor: traducido("origen", ORIGENES_CAMBIO), usa: ["item"],
    celda: (f) => f.origen === "externo" ? <span>{ORIGENES_CAMBIO.externo}</span> : (
      <Link href={url("/config/canales/cola", { ver: "enviados", q: f.item })} className={ENLACE} title="Lo que mandó la cola a esta publicación">
        {ORIGENES_CAMBIO[f.origen] ?? f.origen}
      </Link>
    ),
  },
];

export const LISTA_CAMBIOS_PUBLICACIONES: Lista = {
  pantalla: "cambios-publicaciones",
  titulo: "Cambios en publicaciones",
  ruta: BASE_CAMBIOS,
  permiso: "informes_publicaciones_ver",
  campos: CAMPOS,
  enPantalla: ["fecha", "cuenta", "item", "sku", "titulo", "campo", "cambio", "cambios", "origen", "causa"],
  siempre: "c.id::int as id, v.producto_id::int as producto_id, (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = v.producto_id) as fotos",
  porDefecto: "fecha",
  consulta: async (ctx, sp) => {
    const f = filtrosCambios(sp);
    const valores: unknown[] = [ctx.org];
    const p = (v: unknown) => { valores.push(v); return `$${valores.length}`; };
    const adentro = ["h.organizacion_id = $1"];
    if (f.desde) adentro.push(`h.fecha >= (${p(f.desde)}::date)::timestamp at time zone ${ZONA}`);
    if (f.hasta) adentro.push(`h.fecha < (${p(f.hasta)}::date + 1)::timestamp at time zone ${ZONA}`);
    if (f.canal) adentro.push(`h.canal_id = ${p(f.canal)}`);
    adentro.push(`h.campo = any(${p(f.tipos)}::text[])`);
    // "Pasó a": sólo filtra los cambios de estado (los de precio y stock pasan igual).
    if (f.estados.length < ESTADOS_DESTINO.length) adentro.push(`(h.campo <> 'estado' or h.despues = any(${p(f.estados)}::text[]))`);
    if (f.externos) adentro.push("h.origen = 'externo'");
    const donde = adentro.join(" and ");
    const base = f.agrupar
      ? `(select min(h.id) id, h.canal_id, h.item_id, h.variation_id, h.campo,
                 (array_agg(h.antes order by h.fecha, h.id))[1] antes,
                 (array_agg(h.despues order by h.fecha desc, h.id desc))[1] despues,
                 max(h.fecha) fecha, min(h.fecha) primera, count(*)::int cambios,
                 case when bool_and(h.origen = 'laucen') then 'laucen' when bool_and(h.origen = 'externo') then 'externo' else 'mixto' end origen,
                 (array_agg(h.datos order by h.fecha desc, h.id desc))[1] datos
            from meli_item_cambio h where ${donde}
           group by h.canal_id, h.item_id, h.variation_id, h.campo) c`
      : `(select h.id, h.canal_id, h.item_id, h.variation_id, h.campo, h.antes, h.despues, h.fecha, h.fecha primera, 1 cambios, h.origen, h.datos
            from meli_item_cambio h where ${donde}) c`;
    // Un cambio de estado se muestra sólo si la publicación sigue en el estado al que pasó
    // (pasó a pausada y hoy está pausada); los de precio y stock pasan igual.
    const fueraY = f.sigue ? ["(c.campo <> 'estado' or c.despues = mi.estado)"] : [];
    let fuera = "true";
    if (f.q) {
      // Regla común (lib/busqueda.ts): los campos de texto del cambio, la cuenta y la publicación.
      fuera = sqlBusqueda(p(parametroBusqueda(f.q, f.comienza)), ["c.id::text", "c.item_id", "c.variation_id", "c.campo", "c.antes", "c.despues",
        "c.origen", "c.datos ->> 'sku'", "c.datos ->> 'titulo'", "ca.nombre", "v.sku", "mi.sku", "mi.titulo"]);
    }
    return {
      desde: `${base}
        join canal ca on ca.id = c.canal_id
        left join meli_item mi on mi.canal_id = c.canal_id and mi.item_id = c.item_id and mi.variation_id = c.variation_id
        left join publicacion pu on pu.id = mi.publicacion_id
        left join variacion v on v.id = pu.variacion_id`,
      donde: [fuera, ...fueraY].join(" and "),
      valores,
      orden: "c.fecha desc, c.id desc",
    };
  },
};
