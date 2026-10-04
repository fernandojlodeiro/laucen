// Publicaciones como lista configurable (lib/listas/tipos.ts): "Descargar
// Excel" con los mismos filtros que la pantalla.

import { patronBusqueda } from "@/app/componentes/erp";
import { verInactivos } from "@/app/componentes/Inactivos";
import { campoFecha, type Lista, type SP } from "@/lib/listas/tipos";

export const TEXTO_ESTADO_PUBLICACION: Record<string, string> = { activa: "Activa", pausada: "Pausada", cerrada: "Cerrada" };

export function filtrosPublicaciones(sp: SP) {
  return {
    canal: Number(sp.canal) || null,
    estado: sp.estado && TEXTO_ESTADO_PUBLICACION[sp.estado] ? sp.estado : null,
    q: sp.q?.trim() || "",
    comienza: sp.contiene !== "1",
    inactivos: verInactivos(sp),
  };
}

export const DISPONIBLE_PUBLICACION = "stock_disponible_canal($1, v.id, c.id)";

// Lo que dice Mercado Libre de la publicación (aunque esté pausada): la copia
// local meli_item, que mantienen al día los avisos y los barridos. Con
// variaciones, la fila de esa variación. Sin fila: "—".
export const UNIR_MELI_ITEM = `left join meli_item mi on mi.canal_id = pu.canal_id and mi.item_id = pu.id_externo and mi.variation_id = coalesce(pu.variacion_externa, '')`;
export const TEXTO_ESTADO_ML: Record<string, string> = {
  active: "Activa", paused: "Pausada", closed: "Cerrada", under_review: "En revisión", inactive: "Inactiva", payment_required: "Pago pendiente",
};
export const textoEstadoMl = (e: string | null | undefined) => (e ? TEXTO_ESTADO_ML[e] ?? e : null);
const UMBRAL = "umbral_pausa_de($1, v.id, c.id)";
export const PLAN_ML: Record<string, string> = { gold_pro: "Premium", gold_special: "Clásica", free: "Gratuita", gold: "Oro", silver: "Plata", bronze: "Bronce" };
/** El precio publicado (con la campaña ya aplicada: el que paga el cliente), el tachado (si lo hay y es mayor) y la campaña activa. */
export const PRECIO_PUBLICACION = "coalesce(mi.precio, pu.precio_canal)::float8";
export const TACHADO_PUBLICACION = `(case when coalesce(nullif(mi.datos_externos -> 'ml' ->> 'original_price', '')::numeric, pu.precio_tachado) > coalesce(mi.precio, pu.precio_canal)
  then coalesce(nullif(mi.datos_externos -> 'ml' ->> 'original_price', '')::numeric, pu.precio_tachado)::float8 end)`;
export const PRECIO_CAMPANA_PUBLICACION = `(select min(x.precio)::float8 from ml_promo_item x
   where x.canal_id = pu.canal_id and x.item_id = pu.id_externo and x.estado = 'started' and x.precio > 0 and (x.hasta is null or x.hasta > now()))`;
export const CAMPANA_PUBLICACION = `(select string_agg(distinct coalesce(x.nombre, x.tipo), ' · ') from ml_promo_item x
   where x.canal_id = pu.canal_id and x.item_id = pu.id_externo and x.estado = 'started' and (x.hasta is null or x.hasta > now()))`;

export const LISTA_PUBLICACIONES: Lista = {
  pantalla: "publicaciones",
  titulo: "Publicaciones",
  ruta: "/catalogo/publicaciones",
  permiso: "publicaciones_ver",
  campos: [
    { clave: "sku", titulo: "SKU", sql: "v.sku", ancho: 18 },
    { clave: "titulo", titulo: "Título", sql: "coalesce(pu.titulo, titulo_variacion(v.id))", orden: "coalesce(pu.titulo, p.titulo)", ancho: 50 },
    { clave: "titulo_canal", titulo: "Título en el canal", sql: "pu.titulo", ancho: 50 },
    { clave: "canal", titulo: "Canal", sql: "c.nombre" },
    { clave: "externo", titulo: "Id externo", sql: "pu.id_externo", ancho: 16 },
    { clave: "enlace", titulo: "Enlace", sql: "case when pu.id_externo ~ '^MLA[0-9]+$' then 'https://articulo.mercadolibre.com.ar/MLA-' || substr(pu.id_externo, 4) end", orden: false, ancho: 40 },
    { clave: "categoria", titulo: "Categoría", sql: "pu.categoria_externa" },
    { clave: "tipo", titulo: "Tipo de publicación", sql: "pu.tipo_publicacion" },
    { clave: "estado", titulo: "Estado", sql: "pu.estado", valor: (f) => TEXTO_ESTADO_PUBLICACION[f.estado] ?? f.estado },
    { clave: "plan", titulo: "Plan", sql: "coalesce(mi.tipo, pu.tipo_publicacion)", valor: (f) => (f.plan ? PLAN_ML[f.plan] ?? f.plan : null) },
    { clave: "precio", titulo: "Precio $", sql: PRECIO_PUBLICACION, orden: PRECIO_PUBLICACION, formato: "pesos" },
    { clave: "tachado", titulo: "Precio tachado $", sql: TACHADO_PUBLICACION, orden: false, formato: "pesos" },
    { clave: "campana", titulo: "Campaña activa", sql: CAMPANA_PUBLICACION, orden: false, ancho: 30 },
    { clave: "precio_campana", titulo: "Precio con campaña $", sql: PRECIO_CAMPANA_PUBLICACION, orden: false, formato: "pesos" },
    { clave: "pausada_manual", titulo: "Pausada por el usuario", sql: "case when pu.pausada_manual then 'Sí' end" },
    { clave: "stock_ml", titulo: "Stock en ML", sql: "mi.stock", formato: "entero" },
    { clave: "estado_ml", titulo: "Estado en ML", sql: "mi.estado", valor: (f) => textoEstadoMl(f.estado_ml) },
    { clave: "disponible", titulo: "Disponible", sql: `${DISPONIBLE_PUBLICACION}::int`, orden: DISPONIBLE_PUBLICACION, formato: "entero" },
    { clave: "umbral", titulo: "Umbral de pausa", sql: `${UMBRAL}::int`, orden: UMBRAL, formato: "entero" },
    { clave: "umbral_propio", titulo: "Umbral propio", sql: "pu.umbral_pausa", formato: "entero" },
    { clave: "codigo_barras", titulo: "Código de barras", sql: "v.codigo_barras" },
    { clave: "producto_estado", titulo: "Estado del producto", sql: "p.estado" },
    campoFecha("sincronizada", "Última sincronización", "pu.ultima_sincronizacion_ts", { hora: true }),
    { clave: "atributos", titulo: "Atributos externos", sql: "case when pu.atributos_externos = '{}'::jsonb then null else pu.atributos_externos::text end", orden: false, ancho: 50 },
  ],
  enPantalla: ["titulo", "canal", "externo", "categoria", "plan", "precio", "tachado", "campana", "precio_campana", "estado", "estado_ml", "disponible", "stock_ml", "umbral"],
  consulta: async (ctx, sp) => {
    const f = filtrosPublicaciones(sp);
    return {
      desde: `publicacion pu
        join variacion v on v.id = pu.variacion_id
        join producto p on p.id = v.producto_id
        join canal c on c.id = pu.canal_id
        ${UNIR_MELI_ITEM}`,
      donde: `pu.organizacion_id = $1
         and ($6 or p.estado <> 'archivado')
         and ($2::bigint is null or pu.canal_id = $2)
         and ($3::text is null or pu.estado = $3)
         and ($4::text is null or v.sku ilike $4 or pu.id_externo ilike $4 or v.codigo_barras = $5)`,
      valores: [ctx.org, f.canal, f.estado, patronBusqueda(f.q, f.comienza), f.q, f.inactivos],
      orden: "c.nombre, v.sku, pu.id",
    };
  },
};
