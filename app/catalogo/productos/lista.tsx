// Productos como lista configurable (lib/listas/tipos.ts): el catálogo de
// campos (los de la pantalla y muchos más para el Excel) y la consulta con los
// filtros de la pantalla, que comparten la pantalla y "Descargar Excel".

import Link from "next/link";
import FotosProducto from "@/app/componentes/FotosProducto";
import { SUAVE } from "@/app/botones";
import { Estado, url } from "@/app/componentes/erp";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { camposProductoConVariaciones } from "@/app/catalogo/busqueda";
import { verInactivos } from "@/app/componentes/Inactivos";
import { consulta, una } from "@/lib/erp/base";
import { campoFecha, traducido, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import { SQL_SIN_PUBLICAR, SQL_SIN_FOTOS, SQL_DISPONIBLE, sqlSinPublicarEnCanal } from "@/lib/catalogo-alertas";
import { sqlPublicadoEnWeb } from "@/lib/catalogo/web";
import { EstadoProducto, TIPOS_PRODUCTO, ESTADOS_PRODUCTO } from "./comun";

const ENLACE = "hover:text-[#16577F] hover:underline";
/** La variación principal (la default; si no hay, la primera). */
const VDEF = "(select v0.id from variacion v0 where v0.producto_id = p.id order by v0.es_default desc, v0.orden, v0.id limit 1)";
const deVdef = (col: string) => `(select v0.${col} from variacion v0 where v0.producto_id = p.id order by v0.es_default desc, v0.orden, v0.id limit 1)`;
// Stock disponible total = suma, por variación y depósito activo, de
// stock_disponible_deposito (un kit se calcula desde sus componentes).
const DISPONIBLE = `(select coalesce(sum(stock_disponible_deposito(p.organizacion_id, v.id, d.id)), 0)
            from variacion v cross join deposito d
           where v.producto_id = p.id and d.organizacion_id = p.organizacion_id and d.estado = 'activo')`;
const VARIACIONES = "(select count(*) from variacion v where v.producto_id = p.id)";
// En cuántas cuentas de Mercado Libre (canales distintos, activos) tiene publicado el producto (Fer, 5/10): una
// publicación activa o pausada de cualquiera de sus variaciones; no cuenta las cerradas, ni cuántas publicaciones
// tiene en una misma cuenta (cuotas, variaciones), ni la web.
const PUBLICADO_ML = `(select count(distinct pu.canal_id) from publicacion pu join variacion v on v.id = pu.variacion_id join canal c on c.id = pu.canal_id
            where v.producto_id = p.id and c.tipo = 'mercadolibre' and c.estado = 'activo' and pu.estado <> 'cerrada')`;
// Ventas en Mercado Libre (Fer, 5/10): lo vendido que informa ML de cada publicación vinculada al
// producto (todas las cuentas y estados; en una con variaciones, lo de cada variación). Sin ventas, 0.
const VENDIDOS_ML = `(select coalesce(sum(mi.vendidos), 0) from meli_item mi join publicacion pu on pu.id = mi.publicacion_id
            join variacion v on v.id = pu.variacion_id where v.producto_id = p.id)`;
const CUENTAS_ML = "(select count(*) from canal c where c.organizacion_id = p.organizacion_id and c.tipo = 'mercadolibre' and c.estado = 'activo')";

/** "ML 3/5": en cuántas de las cuentas de Mercado Libre está publicado. */
function MarcaMl({ n, total }: { n: number; total: number }) {
  if (!total) return null;
  return <Estado texto={`ML ${n}/${total}`} tono={n === 0 ? "gris" : n >= total ? "verde" : "amarillo"} />;
}

/** Los filtros de la pantalla, leídos de la dirección. */
export function filtrosProductos(sp: SP) {
  const estado = sp.estado && Object.hasOwn(ESTADOS_PRODUCTO, sp.estado) ? sp.estado : "";
  return {
    q: sp.q?.trim() ?? "",
    comienza: sp.contiene !== "1",
    estado,
    tipo: sp.tipo && Object.hasOwn(TIPOS_PRODUCTO, sp.tipo) ? sp.tipo : "",
    // La familia elegida y todas las que cuelgan de ella.
    familia: Number(sp.familia) || 0,
    // Los inactivos (archivados) sólo con la caja tildada, o si se los pide por estado.
    inactivos: verInactivos(sp) || estado === "archivado",
    kitVs: sp.kitvs === "1",
    // Desde el tablero de Mercado Libre: con stock y sin publicación activa / sin fotos.
    sinPublicar: sp.sinpublicar === "1",
    sinFotos: sp.sinfotos === "1",
    // Con stock y sin publicación activa en UNA cuenta de ML (el id de su canal).
    sinPublicarEn: Number(sp.sinpubcanal) || 0,
    // Desde el tablero: los productos de una tienda web según su interruptor "Publicado en Web".
    webCanal: Number(sp.webcanal) || 0,
    webVer: sp.webver === "activa" || sp.webver === "apagado" || sp.webver === "apagado_stock" ? sp.webver : "",
    // Sin ninguna publicación activa en ningún canal (ML ni web).
    sinCanal: sp.sincanal === "1",
    // Los marcados "No publicable" (insumos, unidades que sólo se venden en pack).
    noPublicable: sp.nopub === "1",
    // Sólo los publicables (sin los "No publicable").
    publicables: sp.pub === "1",
    // En cuántas cuentas de ML está publicado (0 = en ninguna), como la columna Publicaciones.
    enCuentas: /^[0-9]$/.test(sp.encuentas ?? "") ? Number(sp.encuentas) : null,
  };
}

const CAMPOS: Campo[] = [
  {
    clave: "sku", titulo: "SKU base", sql: "p.sku_base", ancho: 18,
    celda: (f) => (
      <span className="font-mono whitespace-nowrap">
        <Link href={`/catalogo/productos/${f.id}`} className="text-[#16577F] font-semibold">{f.sku}</Link>{" "}
        <FotosProducto fotos={f.fotos} titulo={f.sku} />
      </span>
    ),
  },
  {
    clave: "titulo", titulo: "Título", sql: "p.titulo", ancho: 50,
    celda: (f, ctx) => (
      <span className="flex items-center justify-between gap-2">
        <span><Link href={`/catalogo/productos/${f.id}`} className="hover:underline">{f.titulo}</Link>
          {f.kit_vs && <span className="ml-1.5"><Estado texto="Kit VS" tono="azul" /></span>}
          {f.no_publicable ? <span className="ml-1.5"><Estado texto="No publicable" tono="gris" /></span>
            : <span className="ml-1.5" title="En cuántas cuentas de Mercado Libre está publicado (activa o pausada)"><MarcaMl n={f.ml_n} total={f.ml_total} /></span>}</span>
        {/* Con el filtro de "sin publicación activa en ML": publicarlo copiando una publicación parecida. */}
        {(ctx.sp.sinpublicar === "1" || Number(ctx.sp.sinpubcanal) > 0) && (
          <Link href={`/catalogo/productos/${f.id}/publicar-ml`} className={`${SUAVE} !py-1 whitespace-nowrap`} title="Buscar publicaciones parecidas en tus cuentas de Mercado Libre y copiar una">Buscar en ML</Link>
        )}
      </span>
    ),
  },
  { clave: "marca", titulo: "Marca", sql: "p.marca", celda: (f) => f.marca ? <Link href={url("/catalogo/productos", { q: f.marca, contiene: null })} className={ENLACE}>{f.marca}</Link> : "—" },
  { clave: "modelo", titulo: "Modelo", sql: "p.modelo" },
  { clave: "linea", titulo: "Línea", sql: "p.linea" },
  {
    clave: "familia", titulo: "Familia", sql: "f.nombre", ancho: 24,
    celda: (f) => f.familia_id ? <Link href={url("/catalogo/productos", { familia: f.familia_id })} className={`${ENLACE} text-[#5C6B76]`}>{f.familia}</Link> : "—",
  },
  {
    clave: "tipo", titulo: "Tipo", sql: "p.tipo", valor: traducido("tipo", TIPOS_PRODUCTO),
    celda: (f) => <Link href={url("/catalogo/productos", { tipo: f.tipo })} className={ENLACE}>{TIPOS_PRODUCTO[f.tipo] ?? f.tipo}</Link>,
  },
  {
    clave: "variaciones", titulo: "Variaciones", sql: `${VARIACIONES}::int`, orden: VARIACIONES, formato: "entero",
    celda: (f) => <Link href={`/catalogo/productos/${f.id}`} className="text-[#16577F] hover:underline">{f.variaciones}</Link>,
  },
  {
    clave: "publicaciones", titulo: "Publicaciones", sql: `${PUBLICADO_ML}::int`, orden: PUBLICADO_ML, formato: "entero", usa: ["sku"],
    celda: (f) => <Link href={url("/catalogo/publicaciones", { q: f.sku })} className="text-[#16577F] hover:underline" title="Cuentas de Mercado Libre donde está publicado (activa o pausada)">{f.publicaciones}</Link>,
  },
  {
    clave: "vendidos_ml", titulo: "Vendidos ML", sql: `${VENDIDOS_ML}::int`, orden: VENDIDOS_ML, formato: "entero",
    celda: (f) => <Link href={`/catalogo/productos/${f.id}?seccion=publicaciones`} className="hover:underline" title="Unidades vendidas en Mercado Libre (lo que informa ML, sumando todas sus publicaciones)">{Number(f.vendidos_ml).toLocaleString("es-AR")}</Link>,
  },
  {
    clave: "disponible", titulo: "Disponible", sql: `${DISPONIBLE}::int`, orden: DISPONIBLE, formato: "entero", usa: ["sku"],
    celda: (f) => <Link href={url("/stock/consulta", { q: f.sku })} className={`hover:underline ${f.disponible < 0 ? "text-[#C03420]" : ""}`}>{Number(f.disponible).toLocaleString("es-AR")}</Link>,
  },
  { clave: "estado", titulo: "Estado", sql: "p.estado", valor: traducido("estado", ESTADOS_PRODUCTO), celda: (f) => <EstadoProducto estado={f.estado} /> },
  { clave: "costo_fob", titulo: "Costo FOB", sql: `${deVdef("costo_fob")}::float`, formato: "decimal" },
  { clave: "costo_moneda", titulo: "Moneda del costo", sql: deVdef("costo_moneda") },
  { clave: "costo_promedio_ars", titulo: "Costo promedio $", sql: `${deVdef("costo_promedio_ars")}::float`, sqlUsd: `${deVdef("costo_promedio_usd")}::float`, formato: "pesos" },
  { clave: "costo_ultimo_ars", titulo: "Último costo $", sql: `${deVdef("costo_ultimo_ars")}::float`, sqlUsd: `${deVdef("costo_ultimo_usd")}::float`, formato: "pesos" },
  { clave: "codigo_barras", titulo: "Código de barras", sql: "coalesce(p.codigo_barras, " + deVdef("codigo_barras") + ")", ancho: 16 },
  { clave: "iva", titulo: "IVA %", sql: "p.iva_pct::float", formato: "pct" },
  { clave: "descuento", titulo: "Descuento %", sql: "p.descuento_pct::float", formato: "pct" },
  { clave: "peso", titulo: "Peso (g)", sql: "p.peso_g", formato: "entero" },
  { clave: "largo", titulo: "Largo (cm)", sql: "p.largo_cm::float", formato: "decimal" },
  { clave: "ancho", titulo: "Ancho (cm)", sql: "p.ancho_cm::float", formato: "decimal" },
  { clave: "alto", titulo: "Alto (cm)", sql: "p.alto_cm::float", formato: "decimal" },
  {
    clave: "medidas", titulo: "Medidas (cm)", orden: false,
    sql: "nullif(concat_ws(' × ', p.largo_cm::float::text, p.ancho_cm::float::text, p.alto_cm::float::text), '')",
  },
  { clave: "garantia", titulo: "Garantía", sql: "p.garantia" },
  { clave: "condicion", titulo: "Condición", sql: "p.condicion" },
  { clave: "categoria_ml", titulo: "Categoría ML", sql: "p.categoria_ml" },
  { clave: "stock_minimo", titulo: "Stock mínimo", sql: "p.stock_minimo", formato: "entero" },
  { clave: "umbral_pausa", titulo: "Umbral de pausa", sql: "p.umbral_pausa", formato: "entero" },
  { clave: "kit_vs", titulo: "Kit de Virtual Seller", sql: "p.kit_vs", formato: "sino" },
  { clave: "no_publicable", titulo: "No publicable", sql: "p.no_publicable", formato: "sino" },
  { clave: "fotos_n", titulo: "Fotos", sql: "(select count(*) from producto_foto pf where pf.producto_id = p.id)::int", formato: "entero" },
  { clave: "foto", titulo: "Foto principal (dirección)", sql: "(select pf.url from producto_foto pf where pf.producto_id = p.id order by pf.orden, pf.id limit 1)", orden: false, ancho: 40 },
  { clave: "descripcion", titulo: "Descripción", sql: "p.descripcion", orden: false, ancho: 60 },
  campoFecha("creado", "Creado", "p.creado_ts"),
  campoFecha("actualizado", "Actualizado", "p.actualizado_ts"),
];

export const LISTA_PRODUCTOS: Lista = {
  pantalla: "productos",
  titulo: "Productos",
  ruta: "/catalogo/productos",
  permiso: "productos_ver",
  vistas: true,
  porDefecto: "titulo",
  enPantalla: ["sku", "titulo", "familia", "tipo", "variaciones", "publicaciones", "vendidos_ml", "disponible", "estado"],
  siempre: `p.id::int id, p.familia_id::int familia_id, p.kit_vs, p.no_publicable, p.estado _estado,
            ${PUBLICADO_ML}::int ml_n, ${CUENTAS_ML}::int ml_total,
            (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = p.id) fotos`,
  // Un precio por cada lista de precios (el de lista, de la variación principal, hoy).
  campos: async (ctx) => {
    const listas = await consulta<{ id: number; nombre: string }>(
      "select id::int, nombre from lista_precios where organizacion_id = $1 order by estado, orden, nombre", [ctx.org]);
    const precios: Campo[] = listas.map((l) => ({
      clave: `precio_${l.id}`, titulo: `Precio ${l.nombre}`, formato: "pesos",
      sql: `(select pr.lista_ars::float from precio_de(p.organizacion_id, ${VDEF}, ${Math.trunc(l.id)}, (now() at time zone 'America/Argentina/Buenos_Aires')::date) pr)`,
      sqlUsd: `(select pr.lista_usd::float from precio_de(p.organizacion_id, ${VDEF}, ${Math.trunc(l.id)}, (now() at time zone 'America/Argentina/Buenos_Aires')::date) pr)`,
    }));
    const i = CAMPOS.findIndex((c) => c.clave === "costo_ultimo_ars") + 1;
    return [...CAMPOS.slice(0, i), ...precios, ...CAMPOS.slice(i)];
  },
  consulta: async (ctx, sp) => {
    const f = filtrosProductos(sp);
    const desde = "producto p left join familia f on f.id = p.familia_id";
    // Lo escrito, con la regla de lib/busqueda.ts: en todos los datos de texto del producto y de sus variaciones.
    const donde = `p.organizacion_id = $1
         and ${sqlBusqueda("$2", camposProductoConVariaciones())}
         and ($3 = '' or p.estado = $3)
         and ($4 = '' or p.tipo = $4)
         and ($5 = 0 or p.familia_id in (
              with recursive d as (select $5::bigint id union select f.id from familia f join d on f.padre_id = d.id where f.organizacion_id = $1)
              select id from d))
         and ($6 or p.estado <> 'archivado')
         and (not $7 or p.kit_vs)
         and (not $8 or ${SQL_SIN_PUBLICAR})
         and (not $9 or ${SQL_SIN_FOTOS})
         and ($10::bigint = 0 or ${sqlSinPublicarEnCanal("$10::bigint")})
         and (not $11 or (not p.no_publicable and not exists (select 1 from publicacion pu join variacion v on v.id = pu.variacion_id
                                      where v.producto_id = p.id and pu.estado = 'activa')))
         and (not $12 or p.no_publicable)
         and (not $13 or not p.no_publicable)
         and ($14::int is null or ${PUBLICADO_ML} = $14::int)`;
    const valores: unknown[] = [ctx.org, parametroBusqueda(f.q, f.comienza), f.estado, f.tipo, f.familia, f.inactivos, f.kitVs, f.sinPublicar, f.sinFotos, f.sinPublicarEn, f.sinCanal, f.noPublicable, f.publicables, f.enCuentas];
    // Con algo escrito y la caja "Mostrar inactivos" apagada: si ningún activo coincide pero sí algún inactivo, se muestran igual (Fer).
    if (f.q && !f.inactivos) {
      const hay = await una<{ activos: boolean; todos: boolean }>(
        `select exists (select 1 from ${desde} where ${donde}) activos,
                exists (select 1 from ${desde} where ${donde.replace("($6 or p.estado <> 'archivado')", "($6 or true)")}) todos`, valores);
      if (hay && !hay.activos && hay.todos) valores[5] = true;
    }
    return { desde, donde, valores, orden: "p.titulo, p.id" };
  },
};
