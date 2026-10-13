// Packing lists: peso y volumen por unidad de cada producto (pedido de Fer, 13/10). Tablas en db/compras.sql.
// Por SKU y packing list se guarda cuántas unidades vinieron y qué parte del peso y del CBM de sus cajas les toca:
//   · exacto: cajas con un solo SKU (peso y CBM de la caja ÷ unidades);
//   · aproximado: cajas mezcladas, repartidas entre todas sus unidades por partes iguales.
// No pisa el peso de la ficha. Por variación rige el exacto antes que el aproximado y, entre iguales, el más nuevo.
// Peso volumétrico por avión = CBM × FACTOR_AEREO (el flete aéreo cobra el mayor entre el real y el volumétrico).

import { consulta } from "@/lib/erp/base";

/** Kilos por metro cúbico con que las aerolíneas calculan el peso volumétrico (divisor 6000). */
export const FACTOR_AEREO = 167;

export type PackingProducto = {
  variacion_id: number; sku_variacion: string; packing_list_id: number; archivo: string; numero: string | null; fecha: string | null;
  via: string | null; cajas: string | null; cantidad: number; exacto: boolean; peso_g: number; cbm: number; rige: boolean;
};

/** Todos los datos de packing list de las variaciones de un producto; `rige` marca el que vale para cada variación. */
export async function packingDeProducto(org: string, productoId: number): Promise<PackingProducto[]> {
  return consulta<PackingProducto>(`
    select x.*, row_number() over (partition by x.variacion_id order by x.exacto desc, x.fecha desc nulls last, x.packing_list_id desc) = 1 rige
      from (select va.id::int variacion_id, va.sku sku_variacion, pl.id::int packing_list_id, pl.archivo, pl.numero, pl.fecha::text fecha, pl.via,
                   pi.cajas, pi.cantidad::float8, pi.exacto,
                   (pi.peso_kg * 1000 / pi.cantidad)::float8 peso_g, (pi.cbm / pi.cantidad)::float8 cbm
              from packing_item pi join packing_list pl on pl.id = pi.packing_list_id join variacion va on va.id = pi.variacion_id
             where pi.organizacion_id = $1 and va.producto_id = $2) x
     order by x.sku_variacion, rige desc, x.exacto desc, x.fecha desc nulls last`, [org, productoId]);
}

/** El dato que rige de cada variación (para listas e informes): peso por unidad en gramos, CBM por unidad y si es exacto. */
export const SQL_PACKING_RIGE = `
  select distinct on (pi.variacion_id) pi.variacion_id, (pi.peso_kg * 1000 / pi.cantidad)::float8 peso_g, (pi.cbm / pi.cantidad)::float8 cbm, pi.exacto
    from packing_item pi join packing_list pl on pl.id = pi.packing_list_id
   where pi.organizacion_id = $1 and pi.variacion_id is not null
   order by pi.variacion_id, pi.exacto desc, pl.fecha desc nulls last, pl.id desc`;
