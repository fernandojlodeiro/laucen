// La garantía que tenía lo vendido en el momento de la venta (Fer, 13/10): se graba en la línea del
// pedido, congelada, y es de uso interno (no sale en ningún comprobante). Si se vendió por Mercado
// Libre, la de la publicación en ML (la que se leyó al traer la orden; si no se pudo leer, la última
// copia que Laucen guarda de esa publicación); si no, la de la ficha del producto.

import type { PoolClient } from "pg";
import { garantiaDeTerminos, type TerminoVenta } from "@/lib/garantia";

export type GarantiaLinea = { garantia: string | null; origen: "ml" | "ficha" | "sin_dato" };

export async function garantiaDeLinea(c: Pick<PoolClient, "query">, pedidoId: number, variacionId: number | null, datos: Record<string, unknown>): Promise<GarantiaLinea> {
  const ml = (datos.ml ?? null) as { garantia?: unknown; item_id?: unknown } | null;
  if (typeof ml?.garantia === "string" && ml.garantia.trim()) return { garantia: ml.garantia.trim(), origen: "ml" };
  if (typeof ml?.item_id === "string" && ml.item_id) {
    const f = (await c.query<{ terminos: TerminoVenta[] | null }>(`
      select mi.datos_externos -> 'ml' -> 'sale_terms' terminos from meli_item mi join pedido p on p.canal_id = mi.canal_id
       where p.id = $1 and mi.item_id = $2 limit 1`, [pedidoId, ml.item_id])).rows[0];
    const g = garantiaDeTerminos(f?.terminos);
    if (g) return { garantia: g, origen: "ml" };
  }
  if (variacionId) {
    const f = (await c.query<{ garantia: string | null }>(
      "select pr.garantia from variacion v join producto pr on pr.id = v.producto_id where v.id = $1", [variacionId])).rows[0];
    if (f?.garantia?.trim()) return { garantia: f.garantia.trim(), origen: "ficha" };
  }
  return { garantia: null, origen: "sin_dato" };
}
