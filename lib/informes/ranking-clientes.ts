// Informe: ranking de clientes (pedido de Fer, 12/10). Los 40 que más compraron en un período, por cantidad de
// compras, por productos distintos o por monto, sobre TODAS las ventas (vista venta_estadistica: Mercado Libre,
// pedidos de los demás canales e historial de Virtual Seller), sin canceladas.
//
// Quién es "el cliente":
//   · el cliente del sistema, si se lo reconoce (el del pedido, el de VS enganchado por CUIT/DNI, o el comprador
//     de ML ya conocido en esa cuenta);
//   · si no, el comprador de Mercado Libre (por su usuario en esa cuenta) o el nombre de Virtual Seller.
// Una "compra" es un pedido, un carrito de ML (o la venta si no tiene carrito) o un pedido de Virtual Seller.
// Los nombres genéricos ("Consumidor final", "CF"…) no son un cliente: no entran al ranking.

import { consulta } from "@/lib/erp/base";

export const TOPE_RANKING = 40;
export const ORDENES_RANKING = { compras: "Cantidad de compras", productos: "Productos distintos", monto: "Monto" } as const;
export type OrdenRanking = keyof typeof ORDENES_RANKING;

export type FiltroRanking = { desde: string; hasta: string; sinNotebooks: boolean; orden: OrdenRanking };
export type FilaRanking = {
  puesto: number; cliente_id: number | null; nombre: string; ml_comprador: string | null; canal: string | null;
  compras: number; productos: number; unidades: number; monto: number; primera: Date; ultima: Date;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function leerFiltroRanking(sp: Record<string, string | undefined>): FiltroRanking {
  const orden = sp.orden && Object.hasOwn(ORDENES_RANKING, sp.orden) ? (sp.orden as OrdenRanking) : "monto";
  return { desde: FECHA.test(sp.desde ?? "") ? sp.desde! : "", hasta: FECHA.test(sp.hasta ?? "") ? sp.hasta! : "", sinNotebooks: sp.sin_notebooks === "1", orden };
}

/** Nombres que no identifican a nadie (ventas de mostrador sin datos). */
export const GENERICO = "^\\W*(consumidor( final)?|c\\.?\\s?f\\.?|cliente|varios|mostrador|sin nombre|virtualseller, maria)\\W*$";

export async function rankingClientes(org: string, f: FiltroRanking): Promise<FilaRanking[]> {
  const valores: unknown[] = [org];
  const p = (v: unknown) => { valores.push(v); return `$${valores.length}`; };
  const donde = ["e.organizacion_id = $1", "e.estado not in ('cancelled', 'cancelado', 'invalid')"];
  if (f.desde) donde.push(`e.fecha >= (${p(f.desde)}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'`);
  if (f.hasta) donde.push(`e.fecha < (${p(f.hasta)}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`);
  if (f.sinNotebooks) {
    donde.push(`not es_notebook(e.titulo) and not exists (select 1 from producto pr join familia fa on fa.id = pr.familia_id
      where pr.id = va.producto_id and fa.nombre ~* '^notebook')`);
  }
  const orden = { compras: "compras desc, monto desc", productos: "productos desc, monto desc", monto: "monto desc" }[f.orden];
  return consulta<FilaRanking>(`
    with v as (
      select coalesce(e.cliente_id, ci.cliente_id) cid,
             case when e.ml_comprador_id is not null then e.canal_id || ':' || e.ml_comprador_id end ml,
             coalesce(mv.comprador, vh.cliente_nombre) nombre_otro,
             coalesce(e.pedido_vs, 'p' || e.pedido_id, 'm' || coalesce(mv.pack_id, e.order_id)) compra,
             coalesce(va.producto_id::text, upper(e.sku)) prod, e.total, e.cantidad, e.fecha, coalesce(ca.nombre, e.canal_nombre) canal
        from venta_estadistica e
        left join canal ca on ca.id = e.canal_id
        left join ml_venta mv on mv.id = e.ml_venta_id
        left join venta_historica vh on vh.id = e.venta_historica_id
        left join variacion va on va.id = e.variacion_id
        left join lateral (select ci.cliente_id from cliente_identidad ci
                            where e.ml_comprador_id is not null and ci.canal_id = e.canal_id and ci.id_externo = e.ml_comprador_id::text limit 1) ci on true
       where ${donde.join(" and ")}),
    k as (
      select v.*, cl.nombre cliente_nombre,
             coalesce('c' || v.cid, case when v.ml is not null then 'm' || v.ml end, 'v' || lower(trim(v.nombre_otro))) clave
        from v left join cliente cl on cl.id = v.cid),
    g as (
      select clave, max(cid)::int cliente_id, coalesce(max(cliente_nombre), max(nombre_otro)) nombre,
             case when max(cid) is null then max(split_part(ml, ':', 2)) end ml_comprador,
             count(distinct compra)::int compras, count(distinct prod)::int productos, sum(cantidad)::int unidades,
             sum(total)::float8 monto, min(fecha) primera, max(fecha) ultima,
             (array_agg(canal order by fecha desc))[1] canal
        from k
       where clave is not null and coalesce(cliente_nombre, nombre_otro, '') !~* '${GENERICO}'
       group by clave)
    select (row_number() over (order by ${orden}))::int puesto, cliente_id, nombre, ml_comprador, canal, compras, productos, unidades, monto, primera, ultima
      from g order by ${orden} limit ${TOPE_RANKING}`, valores);
}
