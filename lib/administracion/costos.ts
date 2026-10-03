// Costo de cada variación: último costo y promedio ponderado (en pesos y en
// dólares). Se actualiza SÓLO al ingresar mercadería comprada (factura de
// compra o despacho de importación).

import type { Consultor } from "@/lib/erp/base";

/** Promedio ponderado (función pura, sin base): (stock anterior × promedio
 *  anterior + cantidad × costo nuevo) / (stock anterior + cantidad). Si el
 *  stock anterior era 0 o negativo, o no había promedio, pasa a ser el costo
 *  nuevo. `decimales`: 2 para pesos, 4 para dólares. */
export function promedioPonderado(d: { stockAnterior: number; promedioAnterior: number | null; cantidad: number; costoNuevo: number; decimales: number }): number {
  const f = 10 ** d.decimales;
  if (d.stockAnterior <= 0 || d.promedioAnterior == null || !(d.stockAnterior + d.cantidad > 0)) return Math.round(d.costoNuevo * f) / f;
  return Math.round(((d.stockAnterior * d.promedioAnterior + d.cantidad * d.costoNuevo) / (d.stockAnterior + d.cantidad)) * f) / f;
}

/** Cuántas unidades descontar del "stock que había" en cada línea de una
 *  factura vinculada a una recepción (función pura). Lo recibido por esa
 *  recepción ya está en el stock; si otra factura registrada antes ya costeó
 *  parte (la misma recepción repartida en dos facturas), eso ya es stock que
 *  había. Dentro de esta factura, lo que costeó una línea anterior del mismo
 *  producto también pasa a ser stock que había. Nunca negativo: si se facturó
 *  más de lo recibido, lo que falta no está en el stock y no se descuenta. */
export function excluirPorRecepcion(
  lineas: { variacionId: number; cantidad: number }[],
  recibido: Map<number, number>,
  yaFacturado: Map<number, number> = new Map(),
): number[] {
  const costeado = new Map<number, number>();
  return lineas.map((l) => {
    const pendiente = Math.max(0, (recibido.get(l.variacionId) ?? 0) - (yaFacturado.get(l.variacionId) ?? 0));
    const antes = costeado.get(l.variacionId) ?? 0;
    costeado.set(l.variacionId, antes + l.cantidad);
    return Math.max(0, pendiente - antes);
  });
}

/** Recalcula último costo y promedio ponderado ANTES de sumar `cantidad` al
 *  stock. Si parte de esas unidades (u otras de la misma compra) ya están en
 *  el stock —entraron por una recepción—, `excluir` las descuenta del "stock
 *  que había" para no contarlas dos veces. */
export async function registrarCosto(c: Consultor, org: string, variacionId: number, cantidad: number, costoArs: number, costoUsd: number, excluir = 0) {
  const r = (await c.query<{ n: string; ars: string | null; usd: string | null }>(`
    select coalesce((select sum(cantidad) from stock where organizacion_id = $1 and variacion_id = $2), 0)::numeric n,
           costo_promedio_ars ars, costo_promedio_usd usd
      from variacion where id = $2 and organizacion_id = $1 for update`, [org, variacionId])).rows[0];
  if (!r) return;
  const antes = Number(r.n) - excluir;
  const ars = promedioPonderado({ stockAnterior: antes, promedioAnterior: r.ars == null ? null : Number(r.ars), cantidad, costoNuevo: costoArs, decimales: 2 });
  const usd = promedioPonderado({ stockAnterior: antes, promedioAnterior: r.usd == null ? null : Number(r.usd), cantidad, costoNuevo: costoUsd, decimales: 4 });
  await c.query(`
    update variacion set costo_ultimo_ars = $3::numeric, costo_ultimo_usd = $4::numeric, costo_actualizado_ts = now(),
           costo_promedio_ars = $5::numeric, costo_promedio_usd = $6::numeric
     where id = $2 and organizacion_id = $1`, [org, variacionId, costoArs, costoUsd, ars, usd]);
}
