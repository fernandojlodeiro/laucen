"use server";

// Búsquedas en vivo de la pantalla de ajustes: el producto por SKU, código de barras o descripción
// (todas las palabras, en cualquier parte; primero los que empiezan igual) y las ubicaciones
// donde está. Sólo lectura.

import { entrarErp } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";

export type VariacionHallada = { id: number; sku: string; titulo: string; estado: string; foto: string | null };
export type UbicacionConStock = { id: number; texto: string; cantidad: number };

const escapar = (t: string) => t.replace(/[\\%_]/g, (x) => `\\${x}`);

export async function buscarVariaciones(q: string): Promise<VariacionHallada[]> {
  const s = await entrarErp("stock_ajustar");
  const t = q.trim().slice(0, 80);
  if (t.length < 2) return [];
  const palabras = t.split(/\s+/).filter(Boolean).slice(0, 6).map((w) => `%${escapar(w)}%`);
  return consulta<VariacionHallada>(`
    select v.id::int, v.sku, coalesce(v.titulo, p.titulo) titulo, p.estado,
           coalesce((select url from variacion_foto f where f.variacion_id = v.id order by orden, id limit 1),
                    (select url from producto_foto f where f.producto_id = p.id order by orden, id limit 1)) foto
      from variacion v join producto p on p.id = v.producto_id
     where v.organizacion_id = $1 and not es_kit(v.id)
       and (v.codigo_barras = $2 or v.sku ilike $3
            or not exists (select 1 from unnest($4::text[]) w
                            where not (v.sku ilike w or coalesce(v.titulo, '') ilike w or p.titulo ilike w or p.sku_base ilike w or coalesce(v.codigo_barras, '') ilike w)))
     order by (v.sku ilike $2) desc, (v.codigo_barras = $2) desc, (p.estado = 'archivado'),
              (v.sku ilike $5) desc, (coalesce(v.titulo, p.titulo) ilike $5) desc, v.sku
     limit 15`, [s.org.id, t, `%${escapar(t)}%`, palabras, `${escapar(t)}%`]);
}

export async function ubicacionesDe(variacionId: number): Promise<UbicacionConStock[]> {
  const s = await entrarErp("stock_ajustar");
  return consulta<UbicacionConStock>(`
    select u.id::int, d.nombre || ' · ' || case when u.es_default then 'General' else u.codigo end texto, sum(st.cantidad)::int cantidad
      from stock st join ubicacion u on u.id = st.ubicacion_id join deposito d on d.id = u.deposito_id
     where st.organizacion_id = $1 and st.variacion_id = $2 and u.estado = 'activa' and d.estado = 'activo'
     group by u.id, d.nombre, u.codigo, u.es_default
    having sum(st.cantidad) <> 0
     order by sum(st.cantidad) desc, d.nombre, u.codigo`, [s.org.id, Number(variacionId) || 0]);
}
