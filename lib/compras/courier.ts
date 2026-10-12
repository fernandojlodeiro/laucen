// Compras por courier (pedido de Fer, 12/10; tablas en db/compras.sql). El costo de cada producto:
//   costo unitario US$ = (FOB + peso kg × flete US$ por kilo) × (1 + % courier)
// En pesos se muestra al dólar de hoy (costo de reposición) y, al grabar, el último costo en pesos queda al dólar
// del día de ingreso. La compra no mueve stock.

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";

export type Compra = { id: number; nombre: string; proveedor: string | null; ingreso_ts: Date | null; flete_usd_kg: number; courier_pct: number;
  notas: string | null; costos_grabados_ts: Date | null };
export type Linea = { id: number; variacion_id: number | null; producto_id: number | null; sku: string | null; descripcion: string; cantidad: number;
  fob_unit_usd: number; peso_g: number | null; cargado: number | null; nota: string | null; fotos: string[] | null };

/** El costo unitario en dólares de un renglón (función pura). */
export function costoUnitario(fob: number, pesoG: number | null, fleteKg: number, pct: number): number {
  return (fob + ((pesoG ?? 0) / 1000) * fleteKg) * (1 + pct / 100);
}

export async function compras(org: string): Promise<(Compra & { lineas: number; unidades: number; fob: number; kg: number })[]> {
  return consulta(`
    select c.id::int, c.nombre, c.proveedor, c.ingreso_ts, c.flete_usd_kg::float8, c.courier_pct::float8, c.notas, c.costos_grabados_ts,
           count(l.id)::int lineas, coalesce(sum(l.cantidad), 0)::int unidades, coalesce(sum(l.cantidad * l.fob_unit_usd), 0)::float8 fob,
           coalesce(sum(l.cantidad * l.peso_g) / 1000, 0)::float8 kg
      from compra_courier c left join compra_courier_linea l on l.compra_id = c.id
     where c.organizacion_id = $1 group by c.id order by c.ingreso_ts desc nulls first, c.id desc`, [org]);
}

export async function compra(org: string, id: number): Promise<{ compra: Compra; lineas: Linea[] } | null> {
  const c = await una<Compra>(`select id::int, nombre, proveedor, ingreso_ts, flete_usd_kg::float8, courier_pct::float8, notas, costos_grabados_ts
                                 from compra_courier where organizacion_id = $1 and id = $2`, [org, id]);
  if (!c) return null;
  const lineas = await consulta<Linea>(`
    select l.id::int, l.variacion_id::int, v.producto_id::int, coalesce(v.sku, l.sku) sku, l.descripcion, l.cantidad, l.fob_unit_usd::float8, l.peso_g::float8,
           l.cargado, l.nota, (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = v.producto_id) fotos
      from compra_courier_linea l left join variacion v on v.id = l.variacion_id
     where l.compra_id = $1 order by l.orden, l.id`, [id]);
  return { compra: c, lineas };
}

export async function guardarParametros(org: string, id: number, p: { flete_usd_kg: number; courier_pct: number; ingreso_ts: string | null; proveedor: string | null; notas: string | null }) {
  if (!(p.flete_usd_kg >= 0 && p.flete_usd_kg <= 1000)) throw new ErrorErp("El flete por kilo va de US$ 0 a US$ 1.000.");
  if (!(p.courier_pct >= 0 && p.courier_pct <= 100)) throw new ErrorErp("El % courier va de 0 % a 100 %.");
  await consulta(`update compra_courier set flete_usd_kg = $3, courier_pct = $4, ingreso_ts = $5, proveedor = $6, notas = $7 where organizacion_id = $1 and id = $2`,
    [org, id, p.flete_usd_kg, p.courier_pct, p.ingreso_ts, p.proveedor, p.notas]);
}

/** Deja en cada variación de la compra: FOB (US$), último costo (US$ y $ al dólar del ingreso), promedio si no tenía,
 *  y el peso en el producto. Devuelve cuántas actualizó. */
export async function grabarCostos(org: string, id: number): Promise<{ productos: number; sinProducto: string[] }> {
  const d = await compra(org, id);
  if (!d) throw new ErrorErp("No existe esa compra.");
  const { compra: c, lineas } = d;
  const fecha = c.ingreso_ts ?? new Date();
  const tc = await una<{ tc: number | null }>("select tc_del_dia($1, ($2::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date)::float8 tc", [org, fecha]).catch(() => null);
  const sinProducto: string[] = [];
  let n = 0;
  await enTransaccion(async (t) => {
    for (const l of lineas) {
      if (!l.variacion_id) { sinProducto.push(l.sku ?? l.descripcion); continue; }
      const usd = Math.round(costoUnitario(l.fob_unit_usd, l.peso_g, c.flete_usd_kg, c.courier_pct) * 10000) / 10000;
      const ars = tc?.tc ? Math.round(usd * tc.tc * 100) / 100 : null;
      await t.query(`
        update variacion set costo_fob = $3, costo_moneda = 'USD', costo_ultimo_usd = $4, costo_ultimo_ars = coalesce($5, costo_ultimo_ars),
               costo_promedio_usd = coalesce(costo_promedio_usd, $4), costo_promedio_ars = coalesce(costo_promedio_ars, $5), costo_actualizado_ts = now()
         where organizacion_id = $1 and id = $2`, [org, l.variacion_id, l.fob_unit_usd, usd, ars]);
      if (l.peso_g != null) await t.query("update producto set peso_g = $3 where organizacion_id = $1 and id = $2", [org, l.producto_id, Math.round(l.peso_g)]);
      n++;
    }
    await t.query("update compra_courier set costos_grabados_ts = now() where organizacion_id = $1 and id = $2", [org, id]);
  });
  return { productos: n, sinProducto };
}

/** Control de stock de las compras (pedido de Fer, 12/10): por renglón, lo cargado, lo vendido desde que la compra
 *  entró al stock (todos los canales, vista venta_estadistica, sin canceladas; las ventas de un kit cuentan sus
 *  componentes), el saldo esperado, el disponible de hoy y la diferencia valorizada al precio de la Clásica. */
export type FilaControl = {
  compra_id: number; compra: string; ingreso_ts: Date | null; variacion_id: number | null; producto_id: number | null; sku: string | null;
  descripcion: string; fotos: string[] | null; comprado: number; cargado: number; vendido_ml: number; vendido_otros: number; vendido_kits: number;
  vendido: number; saldo: number; disponible: number | null; diferencia: number | null; precio: number | null; monto: number | null;
};

export async function controlStock(org: string, compraId: number | null): Promise<FilaControl[]> {
  return consulta<FilaControl>(`
    with l as (
      select c.id compra_id, c.nombre compra, c.ingreso_ts, l.variacion_id, l.sku, l.descripcion, l.orden, l.id,
             l.cantidad comprado, coalesce(l.cargado, l.cantidad) cargado
        from compra_courier c join compra_courier_linea l on l.compra_id = c.id
       where c.organizacion_id = $1 and ($2::bigint is null or c.id = $2)),
    lista as (select id from lista_precios where organizacion_id = $1
               order by lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, orden, id limit 1),
    v as (
      select l.id,
             coalesce(sum(e.cantidad) filter (where e.variacion_id = l.variacion_id and e.origen = 'ml'), 0) ml,
             coalesce(sum(e.cantidad) filter (where e.variacion_id = l.variacion_id and e.origen <> 'ml'), 0) otros,
             coalesce(sum(e.cantidad * k.cantidad) filter (where k.variacion_componente_id is not null), 0) kits
        from l
        join venta_estadistica e on e.organizacion_id = $1 and l.ingreso_ts is not null and e.fecha >= l.ingreso_ts
                                and e.estado not in ('cancelled', 'cancelado', 'invalid')
        left join kit_componente k on k.variacion_kit_id = e.variacion_id and k.variacion_componente_id = l.variacion_id
       where e.variacion_id = l.variacion_id or k.variacion_componente_id is not null
       group by l.id),
    x as (
      select l.*, va.producto_id, coalesce(va.sku, l.sku) sku_v,
             coalesce(v.ml, 0)::int vendido_ml, coalesce(v.otros, 0)::int vendido_otros, coalesce(v.kits, 0)::int vendido_kits,
             case when l.variacion_id is null then null
                  else (select coalesce(sum(s.cantidad - s.reservado), 0) from stock s where s.variacion_id = l.variacion_id)::int end disponible,
             (select pd.lista_ars from lista, precio_de($1, l.variacion_id, lista.id) pd)::float8 precio
        from l left join v on v.id = l.id left join variacion va on va.id = l.variacion_id)
    select compra_id::int, compra, ingreso_ts, variacion_id::int, producto_id::int, sku_v sku, descripcion,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = x.producto_id) fotos,
           comprado, cargado, vendido_ml, vendido_otros, vendido_kits, vendido_ml + vendido_otros + vendido_kits vendido,
           cargado - (vendido_ml + vendido_otros + vendido_kits) saldo, disponible,
           disponible - (cargado - (vendido_ml + vendido_otros + vendido_kits)) diferencia, precio,
           (disponible - (cargado - (vendido_ml + vendido_otros + vendido_kits))) * precio monto
      -- De la diferencia más grande en plata (falte o sobre) a la más chica (Fer, 12/10).
      from x order by abs((disponible - (cargado - (vendido_ml + vendido_otros + vendido_kits))) * precio) desc nulls last, compra, orden, id`, [org, compraId]);
}
