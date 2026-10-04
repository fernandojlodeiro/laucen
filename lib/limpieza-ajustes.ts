// Revisión de la carga de stock (3/10): qué unidades se sacaron de ubicaciones
// reales (no GENERAL ni A UBICAR) para llevar cada producto a su neto.

import { consulta } from "@/lib/erp/base";

export type AjusteUbicacion = { sku: string; productoId: number; titulo: string; ubicacion: string; sacadas: number; quedan: number; anterior: number };

export async function ajustesEnUbicacionesReales(org: string): Promise<AjusteUbicacion[]> {
  const f = await consulta<{ sku: string; producto_id: string; titulo: string; ubicacion: string; sacadas: number; quedan: number }>(`
    select v.sku, v.producto_id::text, p.titulo, u.codigo ubicacion, m.cantidad sacadas, coalesce(s.cantidad, 0)::int quedan
      from movimiento_stock m
      join variacion v on v.id = m.variacion_id
      join producto p on p.id = v.producto_id
      join ubicacion u on u.id = m.ubicacion_origen_id
      left join stock s on s.variacion_id = m.variacion_id and s.ubicacion_id = m.ubicacion_origen_id
     where m.organizacion_id = $1 and m.referencia_tipo = 'carga_inicial' and not u.es_default and u.codigo <> 'A UBICAR'
     order by v.sku, u.codigo`, [org]);
  return f.map((x) => ({ sku: x.sku, productoId: Number(x.producto_id), titulo: x.titulo, ubicacion: x.ubicacion, sacadas: x.sacadas, quedan: x.quedan, anterior: x.quedan + x.sacadas }));
}
