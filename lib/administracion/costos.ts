// Costo de cada variación: último costo y promedio ponderado (en pesos y en
// dólares). Se actualiza SÓLO al ingresar mercadería comprada (factura de
// compra o despacho de importación).

import type { Consultor } from "@/lib/erp/base";

/** Antes de sumar `cantidad` al stock, recalcula el promedio ponderado con
 *  lo que había (si había 0 o negativo, el promedio pasa a ser este costo). */
export async function registrarCosto(c: Consultor, org: string, variacionId: number, cantidad: number, costoArs: number, costoUsd: number) {
  await c.query(`
    with antes as (select coalesce(sum(cantidad), 0)::numeric n from stock where organizacion_id = $1 and variacion_id = $2)
    update variacion v set
      costo_ultimo_ars = $4::numeric, costo_ultimo_usd = $5::numeric, costo_actualizado_ts = now(),
      costo_promedio_ars = case when (select n from antes) <= 0 or v.costo_promedio_ars is null then $4::numeric
                                else round(((select n from antes) * v.costo_promedio_ars + $3::numeric * $4::numeric) / ((select n from antes) + $3::numeric), 2) end,
      costo_promedio_usd = case when (select n from antes) <= 0 or v.costo_promedio_usd is null then $5::numeric
                                else round(((select n from antes) * v.costo_promedio_usd + $3::numeric * $5::numeric) / ((select n from antes) + $3::numeric), 4) end
     where v.id = $2 and v.organizacion_id = $1`, [org, variacionId, cantidad, costoArs, costoUsd]);
}
