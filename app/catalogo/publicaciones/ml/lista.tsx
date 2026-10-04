// Vincular con Mercado Libre como lista configurable (lib/listas/tipos.ts):
// "Descargar Excel" de las publicaciones traídas de ML del canal elegido, con
// las mismas casillas (sin vincular, activas…) y búsqueda que la pantalla.

import { patronBusqueda } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import type { Lista, SP } from "@/lib/listas/tipos";

export const ESTADO_ML: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" | "azul" }> = {
  active: { texto: "Activa", tono: "verde" }, paused: { texto: "Pausada", tono: "amarillo" },
  closed: { texto: "Cerrada", tono: "gris" }, under_review: { texto: "En revisión", tono: "azul" },
  inactive: { texto: "Inactiva", tono: "gris" }, payment_required: { texto: "Falta pagar", tono: "amarillo" },
};
export const TIPO_ML: Record<string, string> = { gold_pro: "Premium", gold_special: "Clásica", free: "Gratuita" };
export const LOGISTICA_ML: Record<string, string> = { fulfillment: "Full" };

/** Las casillas para filtrar (Fer, 4/10: en vez de pestañas, para
 *  combinarlas, ej. "Sin vincular" + "Activas"). Dentro de cada grupo suman
 *  (Activas o Pausadas); entre grupos se cruzan (sin vincular y activas). Un
 *  grupo sin nada tildado no filtra. */
export const CASILLAS_ML = [
  { clave: "sin", texto: "Sin vincular", grupo: "vinculo" }, { clave: "vinc", texto: "Vinculadas", grupo: "vinculo" },
  { clave: "activas", texto: "Activas", grupo: "estado" }, { clave: "pausadas", texto: "Pausadas", grupo: "estado" },
  { clave: "revision", texto: "Con cuestiones", grupo: "estado" },
] as const;
export type CasillaMl = (typeof CASILLAS_ML)[number]["clave"];
export type VerMl = CasillaMl[];
const esCasilla = (x: string): x is CasillaMl => CASILLAS_ML.some((c) => c.clave === x);

/** Lo tildado: ?f=sin,activas ("-" = nada tildado, todas). Sin ?f, el ?ver=
 *  de antes (los enlaces viejos) y si tampoco, "Sin vincular". */
export function verMl(sp: SP): VerMl {
  if (sp.f != null) return sp.f.split(",").filter(esCasilla);
  if (sp.ver === "todas") return [];
  return sp.ver && esCasilla(sp.ver) ? [sp.ver] : ["sin"];
}
/** Lo tildado como valor de ?f. */
export const valorVerMl = (ver: VerMl) => (ver.length ? ver.join(",") : "-");

/** Publicaciones que ML frena hasta que se corrija algo: en revisión, inactivas o con el pago pendiente. */
export const ESTADOS_ML_CON_PROBLEMAS = "('under_review', 'inactive', 'payment_required')";

/** Los filtros de la pantalla sobre meli_item (alias mi): $1 organización, $2 canal, $3 búsqueda. */
export function filtroMl(ver: VerMl) {
  const t = (c: CasillaMl) => ver.includes(c);
  const vinculo = t("sin") === t("vinc") ? "" : t("sin") ? "and mi.publicacion_id is null" : "and mi.publicacion_id is not null";
  const estados = [t("activas") && "mi.estado = 'active'", t("pausadas") && "mi.estado = 'paused'", t("revision") && `mi.estado in ${ESTADOS_ML_CON_PROBLEMAS}`].filter(Boolean);
  return `mi.organizacion_id = $1 and mi.canal_id = $2 ${vinculo} ${estados.length ? `and (${estados.join(" or ")})` : ""}
    and ($3::text is null or mi.titulo ilike $3 or mi.sku ilike $3 or mi.item_id ilike $3)`;
}

export const LISTA_VINCULAR_ML: Lista = {
  pantalla: "vincular_ml",
  titulo: "Publicaciones de Mercado Libre",
  ruta: "/catalogo/publicaciones/ml",
  permiso: "publicaciones_ver",
  campos: [
    { clave: "item", titulo: "Publicación (MLA)", sql: "mi.item_id", orden: "mi.item_id", ancho: 16 },
    { clave: "variacion_ml", titulo: "Variación de ML", sql: "nullif(mi.variation_id, '')" },
    { clave: "titulo", titulo: "Título", sql: "mi.titulo", ancho: 50 },
    { clave: "atributos", titulo: "Atributos", sql: "mi.atributos", ancho: 30 },
    { clave: "sku", titulo: "SKU en ML", sql: "mi.sku", ancho: 18 },
    { clave: "precio", titulo: "Precio $", sql: "mi.precio::float", orden: "mi.precio", formato: "pesos" },
    { clave: "stock", titulo: "Stock ML", sql: "mi.stock", formato: "entero" },
    { clave: "vendidos", titulo: "Vendidos", sql: "mi.vendidos", formato: "entero" },
    { clave: "estado", titulo: "Estado", sql: "mi.estado", valor: (f) => ESTADO_ML[f.estado]?.texto ?? f.estado },
    { clave: "tipo", titulo: "Tipo", sql: "mi.tipo", valor: (f) => TIPO_ML[f.tipo] ?? f.tipo },
    { clave: "logistica", titulo: "Logística", sql: "mi.logistica", valor: (f) => (f.logistica ? LOGISTICA_ML[f.logistica] ?? f.logistica : null) },
    { clave: "permalink", titulo: "Enlace", sql: "mi.permalink", orden: false, ancho: 40 },
    { clave: "vinculo", titulo: "Vinculada a (SKU)", sql: "v.sku", ancho: 18 },
    { clave: "vinculo_titulo", titulo: "Vinculada a (variación)", sql: "case when v.id is null then null else titulo_variacion(v.id) end", orden: false, ancho: 40 },
    { clave: "disponible", titulo: "Disponible en Laucen", sql: "case when v.id is null then null else stock_disponible_canal($1, v.id, $2) end", formato: "entero" },
  ],
  enPantalla: ["item", "titulo", "sku", "precio", "stock", "vendidos", "estado", "tipo", "vinculo"],
  consulta: async (ctx, sp) => {
    let canal = Number(sp.canal) || 0;
    if (!canal) {
      const [c] = await consulta<{ id: number }>(`
        select c.id::int from canal c where c.organizacion_id = $1 and c.tipo = 'mercadolibre'
           and exists (select 1 from meli_cuenta mc where mc.canal_id = c.id) order by c.nombre limit 1`, [ctx.org]);
      canal = c?.id ?? 0;
    }
    return {
      desde: `meli_item mi
        left join publicacion pu on pu.id = mi.publicacion_id and pu.organizacion_id = $1
        left join variacion v on v.id = pu.variacion_id`,
      donde: filtroMl(verMl(sp)),
      valores: [ctx.org, canal, patronBusqueda(sp.q?.trim() || "", sp.contiene !== "1")],
      orden: "mi.titulo, mi.item_id, mi.variation_id",
    };
  },
};
