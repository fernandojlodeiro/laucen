// Datos de la tienda pública: la tienda del slug, sus familias y los listados
// de productos (con precio de la lista del canal, stock del canal, cucardas y
// planes de cuotas). Sólo lectura; lo que cambia algo está en acciones.ts.

import { cache } from "react";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { hoyAR } from "@/lib/moneda";
import { tiendaPorSlug, type Tienda } from "@/lib/tienda/tienda";
import { planesDe, mejorPlanSinInteres, type Plan } from "@/lib/tienda/cuotas";

export const POR_PAGINA = 24;
export const COLOR_POR_DEFECTO = "#16577F";

/** La tienda del slug (una sola consulta por request); si no existe, 404. */
export const cargarTienda = cache(async (slug: string): Promise<Tienda> => {
  const t = await tiendaPorSlug(decodeURIComponent(slug));
  if (!t) notFound();
  return t;
});

export const abierta = (t: Tienda) => t.estado === "activo";
export const colorDe = (t: Tienda) => (/^#[0-9a-f]{3,8}$/i.test(t.config.color ?? "") ? t.config.color! : COLOR_POR_DEFECTO);
export const ocultaSinStock = (t: Tienda) => t.config.sin_stock === "ocultar";
export const whatsappDe = (t: Tienda) => (t.config.whatsapp ?? "").replace(/\D/g, "") || null;
export const linkWhatsapp = (t: Tienda, texto: string) => {
  const n = whatsappDe(t);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
};

export type Familia = { id: number; nombre: string };

/** Familias de primer nivel que tienen algún producto activo (en ellas o en sus subfamilias). */
export const familiasRaiz = cache(async (org: string): Promise<Familia[]> =>
  consulta<Familia>(`
    with recursive arbol as (
      select id raiz, id, 0 n from familia where organizacion_id = $1 and padre_id is null
      union all select a.raiz, f.id, a.n + 1 from arbol a join familia f on f.padre_id = a.id where a.n < 20
    )
    select f.id::int, f.nombre from familia f
     where f.organizacion_id = $1 and f.padre_id is null
       and exists (select 1 from arbol a join producto p on p.familia_id = a.id and p.estado = 'activo' where a.raiz = f.id)
     order by f.nombre`, [org]));

/** Una familia, su camino desde la raíz y sus subfamilias con productos. */
export async function familiaConCamino(org: string, id: number) {
  const f = await una<{ id: number; nombre: string; descripcion: string | null }>(
    "select id::int, nombre, descripcion from familia where id = $1 and organizacion_id = $2", [id, org]);
  if (!f) return null;
  const camino = await consulta<Familia>(`
    with recursive c as (
      select id, padre_id, nombre, 0 n from familia where id = $1 and organizacion_id = $2
      union all select f.id, f.padre_id, f.nombre, c.n + 1 from familia f join c on f.id = c.padre_id where c.n < 20
    ) select id::int, nombre from c where id <> $1 order by n desc`, [id, org]);
  const hijas = await consulta<Familia>(`
    with recursive arbol as (
      select id raiz, id, 0 n from familia where organizacion_id = $1 and padre_id = $2
      union all select a.raiz, f.id, a.n + 1 from arbol a join familia f on f.padre_id = a.id where a.n < 20
    )
    select f.id::int, f.nombre from familia f
     where f.organizacion_id = $1 and f.padre_id = $2
       and exists (select 1 from arbol a join producto p on p.familia_id = a.id and p.estado = 'activo' where a.raiz = f.id)
     order by f.nombre`, [org, id]);
  return { ...f, camino, hijas };
}

export type Cucarda = { nombre: string; color: string };

/** Cucardas vigentes hoy de cada producto: las propias y las de su familia (y familias de más arriba). */
export async function cucardasDe(org: string, productos: number[]): Promise<Map<number, Cucarda[]>> {
  const m = new Map<number, Cucarda[]>();
  if (!productos.length) return m;
  const filas = await consulta<{ producto_id: number; nombre: string; color: string }>(`
    with recursive cad as (
      select p.id producto_id, p.familia_id fid, 0 n from producto p where p.organizacion_id = $1 and p.id = any($2::bigint[]) and p.familia_id is not null
      union all select cad.producto_id, f.padre_id, cad.n + 1 from cad join familia f on f.id = cad.fid where f.padre_id is not null and cad.n < 20
    ), todas as (
      select producto_id, cucarda_id, desde, hasta from producto_cucarda where organizacion_id = $1 and producto_id = any($2::bigint[])
      union all
      select cad.producto_id, fc.cucarda_id, fc.desde, fc.hasta from cad join familia_cucarda fc on fc.familia_id = cad.fid and fc.organizacion_id = $1
    )
    select producto_id::int, nombre, color from (
      select distinct on (x.producto_id, c.id) x.producto_id, c.nombre, c.color, c.orden
        from todas x join cucarda c on c.id = x.cucarda_id and c.estado = 'activa'
       where (x.desde is null or x.desde <= $3::date) and (x.hasta is null or x.hasta >= $3::date)
       order by x.producto_id, c.id
    ) s order by orden, nombre`, [org, productos, hoyAR()]);
  for (const f of filas) {
    const l = m.get(f.producto_id) ?? [];
    l.push({ nombre: f.nombre, color: /^#[0-9a-f]{3,8}$/i.test(f.color) ? f.color : COLOR_POR_DEFECTO });
    m.set(f.producto_id, l);
  }
  return m;
}

export type Tarjeta = {
  id: number; titulo: string; foto: string | null; variacionId: number; variaciones: number;
  lista: number; venta: number; descuentoPct: number; stock: number;
  cucardas: Cucarda[]; cuotas: Plan | null;
};

export type Orden = "relevancia" | "menor" | "mayor";
export const esOrden = (x: unknown): x is Orden => x === "relevancia" || x === "menor" || x === "mayor";

const comodin = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Listado de productos de la tienda: activos, con alguna variación activa con
 *  precio en la lista del canal. El precio que se muestra es el más bajo de
 *  sus variaciones ("desde" si hay varias). */
export async function listarProductos(t: Tienda, op: {
  q?: string | null; familiaId?: number | null; orden?: Orden; pagina?: number; porPagina?: number; soloConStock?: boolean;
}): Promise<{ productos: Tarjeta[]; total: number }> {
  if (!t.listaId) return { productos: [], total: 0 };
  const palabras = (op.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8).map(comodin);
  const porPagina = op.porPagina ?? POR_PAGINA;
  const pagina = Math.max(1, op.pagina ?? 1);
  const soloConStock = op.soloConStock || ocultaSinStock(t);
  const q = (op.q ?? "").trim();
  // Relevancia: primero los que empiezan con lo buscado, después los que lo contienen entero.
  const porRelevancia = !!q && op.orden !== "menor" && op.orden !== "mayor";
  const orden = op.orden === "menor" ? "a.venta asc, p.id desc"
    : op.orden === "mayor" ? "a.venta desc, p.id desc"
    : porRelevancia ? "(p.titulo ilike $8) desc, (p.titulo ilike $9) desc, p.creado_ts desc, p.id desc"
    : "p.creado_ts desc, p.id desc";
  const filas = await consulta<{
    id: number; titulo: string; foto: string | null; variacion_id: number; variaciones: number;
    lista: string; venta: string; descuento_pct: string; stock: number; total: number;
  }>(`
    with recursive fams as (
      select id, 0 n from familia where organizacion_id = $1 and id = $6
      union all select f.id, fams.n + 1 from familia f join fams on f.padre_id = fams.id where fams.n < 20
    ), v as (
      select p.id producto_id, v.id variacion_id, v.orden,
             case when $4 = 'USD' then pr.lista_usd else pr.lista_ars end lista,
             case when $4 = 'USD' then pr.venta_usd else pr.venta_ars end venta,
             pr.descuento_pct, greatest(stock_disponible_canal($1, v.id, $2), 0) disp
        from producto p
        join variacion v on v.producto_id = p.id and v.estado = 'activa'
        cross join lateral (select * from precio_de($1, v.id, $3)) pr
       where p.organizacion_id = $1 and p.estado = 'activo'
         and ($6::bigint is null or p.familia_id in (select id from fams))
         and not exists (
           select 1 from unnest($5::text[]) w
            where (p.titulo || ' ' || coalesce(p.marca, '') || ' ' || p.sku_base || ' ' || coalesce(v.sku, '')) not ilike w)
    ), a as (
      select producto_id, min(venta) venta, count(*)::int variaciones, sum(disp)::int stock,
             (array_agg(lista order by venta, orden, variacion_id))[1] lista,
             (array_agg(descuento_pct order by venta, orden, variacion_id))[1] descuento_pct,
             (array_agg(variacion_id order by venta, orden, variacion_id))[1] variacion_id
        from v group by producto_id
    )
    select p.id::int, p.titulo, a.variacion_id::int, a.variaciones, a.lista, a.venta, a.descuento_pct, a.stock,
           coalesce((select url from producto_foto where producto_id = p.id order by orden, id limit 1),
                    (select url from variacion_foto where variacion_id = a.variacion_id order by orden, id limit 1)) foto,
           count(*) over ()::int total
      from a join producto p on p.id = a.producto_id
     where (not $7 or a.stock > 0)
     order by ${orden}
     limit ${porPagina} offset ${(pagina - 1) * porPagina}`,
  [t.organizacionId, t.canalId, t.listaId, t.moneda, palabras, op.familiaId ?? null, soloConStock,
    ...(porRelevancia ? [`${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, comodin(q)] : [])]);
  const cucardas = await cucardasDe(t.organizacionId, filas.map((f) => f.id));
  const planes = await Promise.all(filas.map((f) => planesDe(t.organizacionId, f.variacion_id)));
  return {
    total: filas[0]?.total ?? 0,
    productos: filas.map((f, i) => ({
      id: f.id, titulo: f.titulo, foto: f.foto, variacionId: f.variacion_id, variaciones: f.variaciones,
      lista: Number(f.lista), venta: Number(f.venta), descuentoPct: Number(f.descuento_pct), stock: f.stock,
      cucardas: cucardas.get(f.id) ?? [], cuotas: mejorPlanSinInteres(planes[i]),
    })),
  };
}
