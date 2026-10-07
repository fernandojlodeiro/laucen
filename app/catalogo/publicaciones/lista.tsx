// Publicaciones como lista configurable (lib/listas/tipos.ts): "Descargar
// Excel" con los mismos filtros que la pantalla.

import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { una } from "@/lib/erp/base";
import { verInactivos } from "@/app/componentes/Inactivos";
import { campoFecha, type Lista, type SP } from "@/lib/listas/tipos";
import { UNIR_MODERACION } from "@/lib/mercadolibre/moderaciones";

export const TEXTO_ESTADO_PUBLICACION: Record<string, string> = { activa: "Activa", pausada: "Pausada", cerrada: "Cerrada" };

export function filtrosPublicaciones(sp: SP) {
  return {
    canal: Number(sp.canal) || null,
    estado: sp.estado && TEXTO_ESTADO_PUBLICACION[sp.estado] ? sp.estado : null,
    q: sp.q?.trim() || "",
    comienza: sp.contiene !== "1",
    inactivos: verInactivos(sp),
    // En revisión en ML (Fer, 5/10): todas, sólo las que son por el precio, o por otro motivo.
    revision: sp.revision === "todas" || sp.revision === "precio" || sp.revision === "otro" ? sp.revision : null,
    // De catálogo o no (Fer, 7/10): dos casillas; con una sola tildada filtra, con las dos (o ninguna) van todas.
    catalogo: sp.catalogo === "1",
    comunes: sp.comunes === "1",
  };
}

/** Si la publicación de ML es de catálogo (la que compite en la página del producto de ML). */
export const ES_CATALOGO = "coalesce((mi.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false)";

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

// El plan de cuotas de la publicación (Fer, 7/10): la Premium puede ser la
// común o una de las campañas de cuotas de ML (3x/9x/12x_campaign), que vienen
// en las marcas (tags) o en sale_terms (INSTALLMENTS_CAMPAIGN). Mismos códigos
// que lib/precios-ml/motor.ts: clasica, premium, 3x_campaign…
export const PLAN_PUBLICACION = `(case coalesce(mi.tipo, pu.tipo_publicacion)
   when 'gold_special' then 'clasica'
   when 'gold_pro' then coalesce((select t from unnest(array['12x_campaign', '9x_campaign', '3x_campaign']) t
        where coalesce(mi.datos_externos -> 'ml' -> 'tags', '[]'::jsonb) ? t
           or exists (select 1 from jsonb_array_elements(coalesce(mi.datos_externos -> 'ml' -> 'sale_terms', '[]'::jsonb)) st
                       where st ->> 'id' = 'INSTALLMENTS_CAMPAIGN' and st ->> 'value_name' = t)
        limit 1), 'premium')
   else coalesce(mi.tipo, pu.tipo_publicacion) end)`;
// Cuántas cuotas ve el comprador en ese plan, si la cuenta lo tiene cargado en Precios en ML (no siempre coincide con el nombre).
export const CUOTAS_VISIBLES_PUBLICACION = `(select k.cuotas_visibles from ml_plan_config k
   where k.canal_id = pu.canal_id and k.nivel = 'general' and k.plan = ${PLAN_PUBLICACION})`;
const NOMBRE_PLAN: Record<string, string> = { clasica: "Clásica", premium: "Premium", "3x_campaign": "Premium 3x", "9x_campaign": "Premium 9x", "12x_campaign": "Premium 12x" };
/** «Premium 3x» (el nombre interno de ML, para empatarlo con lo que se ve en ML) y, si se sabe, «ve 6 cuotas». */
export function textoPlan(plan: string | null | undefined, cuotasVisibles?: number | null) {
  if (!plan) return null;
  const nombre = NOMBRE_PLAN[plan] ?? PLAN_ML[plan] ?? plan;
  return cuotasVisibles ? `${nombre} · ve ${cuotasVisibles} cuotas` : nombre;
}
export function PlanPublicacion({ plan, cuotas }: { plan: string | null | undefined; cuotas?: number | null }) {
  if (!plan) return <>—</>;
  const tag = plan.endsWith("_campaign") ? plan : plan === "premium" ? "sin campaña de cuotas" : null;
  return (
    <span title={tag ? `En Mercado Libre: ${tag}` : undefined}>
      {NOMBRE_PLAN[plan] ?? PLAN_ML[plan] ?? plan}
      {cuotas ? <span className="block text-[10px] text-[#5C6B76]">el comprador ve {cuotas} cuotas</span> : null}
    </span>
  );
}
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
    { clave: "catalogo", titulo: "De catálogo", sql: `case when ${ES_CATALOGO} then 'Sí' end` },
    { clave: "plan", titulo: "Plan", sql: PLAN_PUBLICACION, valor: (f) => textoPlan(f.plan) },
    { clave: "cuotas_visibles", titulo: "Cuotas que ve el comprador", sql: CUOTAS_VISIBLES_PUBLICACION, orden: false, formato: "entero" },
    { clave: "precio", titulo: "Precio $", sql: PRECIO_PUBLICACION, orden: PRECIO_PUBLICACION, formato: "pesos" },
    { clave: "tachado", titulo: "Precio tachado $", sql: TACHADO_PUBLICACION, orden: false, formato: "pesos" },
    { clave: "campana", titulo: "Campaña activa", sql: CAMPANA_PUBLICACION, orden: false, ancho: 30 },
    { clave: "precio_campana", titulo: "Precio con campaña $", sql: PRECIO_CAMPANA_PUBLICACION, orden: false, formato: "pesos" },
    { clave: "pausada_manual", titulo: "Pausada por el usuario", sql: "case when pu.pausada_manual then 'Sí' end" },
    { clave: "stock_ml", titulo: "Stock en ML", sql: "mi.stock", formato: "entero" },
    { clave: "motivo_revision", titulo: "Motivo de la revisión en ML", sql: "mm.motivo", orden: false, ancho: 60 },
    { clave: "solucion_revision", titulo: "Solución que sugiere ML", sql: "mm.solucion", orden: false, ancho: 60 },
    { clave: "revision_precio", titulo: "En revisión por precio", sql: "case when mm.por_precio then 'Sí' end" },
    { clave: "vendidos_ml", titulo: "Vendidos ML", sql: "case when c.tipo = 'mercadolibre' then coalesce(mi.vendidos, 0) end", orden: "coalesce(mi.vendidos, 0)", formato: "entero" },
    { clave: "estado_ml", titulo: "Estado en ML", sql: "mi.estado", valor: (f) => textoEstadoMl(f.estado_ml) },
    { clave: "disponible", titulo: "Disponible", sql: `${DISPONIBLE_PUBLICACION}::int`, orden: DISPONIBLE_PUBLICACION, formato: "entero" },
    { clave: "umbral", titulo: "Umbral de pausa", sql: `${UMBRAL}::int`, orden: UMBRAL, formato: "entero" },
    { clave: "umbral_propio", titulo: "Umbral propio", sql: "pu.umbral_pausa", formato: "entero" },
    { clave: "codigo_barras", titulo: "Código de barras", sql: "v.codigo_barras" },
    { clave: "producto_estado", titulo: "Estado del producto", sql: "p.estado" },
    campoFecha("sincronizada", "Última sincronización", "pu.ultima_sincronizacion_ts", { hora: true }),
    { clave: "atributos", titulo: "Atributos externos", sql: "case when pu.atributos_externos = '{}'::jsonb then null else pu.atributos_externos::text end", orden: false, ancho: 50 },
  ],
  enPantalla: ["sku", "titulo", "canal", "externo", "categoria", "plan", "precio", "tachado", "campana", "precio_campana", "estado", "estado_ml", "disponible", "stock_ml", "umbral"],
  consulta: async (ctx, sp) => {
    const f = filtrosPublicaciones(sp);
    const desde = `publicacion pu
        join variacion v on v.id = pu.variacion_id
        join producto p on p.id = v.producto_id
        join canal c on c.id = pu.canal_id
        ${UNIR_MELI_ITEM}
        ${UNIR_MODERACION}`;
    const INACTIVOS = "($5 or p.estado <> 'archivado')";
    // Lo escrito, con la regla de lib/busqueda.ts ($4): los datos de la publicación, y SKU, código de barras y título de su producto.
    const donde = `pu.organizacion_id = $1
         and ${INACTIVOS}
         and ($2::bigint is null or pu.canal_id = $2)
         and ($3::text is null or pu.estado = $3)
         and ${sqlBusqueda("$4", ["pu.id::text", "pu.id_externo", "pu.variacion_externa", "coalesce(pu.titulo, titulo_variacion(v.id))", "pu.categoria_externa", "pu.tipo_publicacion",
              "v.sku", "v.codigo_barras", "p.sku_base", "p.titulo"])}
         and ($6::text is null or (mi.estado = 'under_review' and ($6 = 'todas' or ($6 = 'precio') = coalesce(mm.por_precio, false))))
         and ($7::text is null or ($7 = 'catalogo') = ${ES_CATALOGO})`;
    const tipoCatalogo = f.catalogo === f.comunes ? null : f.catalogo ? "catalogo" : "comunes";
    const valores: unknown[] = [ctx.org, f.canal, f.estado, parametroBusqueda(f.q, f.comienza), f.inactivos, f.revision, tipoCatalogo];
    // Con algo escrito y la caja "Mostrar inactivos" apagada: si ninguna de un producto activo coincide pero sí
    // alguna de uno inactivo, se muestran igual (Fer).
    if (f.q && !f.inactivos) {
      const hay = await una<{ activos: boolean; todos: boolean }>(
        `select exists (select 1 from ${desde} where ${donde}) activos,
                exists (select 1 from ${desde} where ${donde.replace(INACTIVOS, "($5 or true)")}) todos`, valores);
      if (hay && !hay.activos && hay.todos) valores[4] = true;
    }
    return { desde, donde, valores, orden: "c.nombre, v.sku, pu.id" };
  },
};
