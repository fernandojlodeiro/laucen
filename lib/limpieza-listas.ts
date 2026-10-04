// Listas de la pantalla de limpieza: la basura que vino del Excel de Virtual
// Seller y los productos que no tienen ninguna publicación de ML.

import { consulta, enTransaccion } from "@/lib/erp/base";

/** Filas de relleno que se colaron como productos (pie del Excel de VS, el envío por OCA,
 *  el recargo financiero, los "NO USAR"). Sólo cuentan los archivados, sin stock ni publicaciones. */
const BASURA = `
  from producto p
 where p.organizacion_id = $1 and p.estado = 'archivado'
   and (p.titulo ~* '^(copyright \\(c\\)|generado por:|envio provisto por|recargo financiero|no usar|no se usa)'
        or p.titulo ~* '^no usar' or p.sku_base ~* 'no usar')
   and not exists (select 1 from variacion v join stock s on s.variacion_id = v.id where v.producto_id = p.id and s.cantidad > 0)
   and not exists (select 1 from variacion v join publicacion pb on pb.variacion_id = v.id where v.producto_id = p.id)`;

export async function basuraDeVs(org: string) {
  const filas = await consulta<{ sku: string; titulo: string }>(`select p.sku_base sku, left(p.titulo, 70) titulo ${BASURA} order by p.sku_base`, [org]);
  // Los que dicen "no usar" pero tienen stock o están activos: no se borran solos, los decide Fer.
  const conStock = await consulta<{ sku: string; titulo: string; stock: number }>(`
    select p.sku_base sku, left(p.titulo, 70) titulo,
           (select coalesce(sum(s.cantidad), 0) from variacion v join stock s on s.variacion_id = v.id where v.producto_id = p.id)::int stock
      from producto p
     where p.organizacion_id = $1 and (p.sku_base ~* '(no usar|^usar )' or p.titulo ~* '^(no usar|no se usa)')
       and p.sku_base not in (select sku_base ${BASURA})
     order by p.sku_base`, [org]);
  return { filas, conStock };
}

export async function borrarBasuraDeVs(org: string) {
  return enTransaccion(async (c) => (await c.query(`delete from producto where id in (select p.id ${BASURA})`, [org])).rowCount ?? 0);
}

export type SinPublicacion = { id: number; sku: string; titulo: string; estado: string; stock: number; categoria: string | null; familia: string | null };

const SIN_PUBLICACION = `
  from producto p join variacion v on v.producto_id = p.id and v.es_default
  left join familia f on f.id = p.familia_id
 where p.organizacion_id = $1
   and not exists (select 1 from variacion v2 join publicacion pb on pb.variacion_id = v2.id where v2.producto_id = p.id)`;

/** Productos sin ninguna publicación (en ninguna cuenta de ML): primero los activos, después los inactivos. */
export async function productosSinPublicacion(org: string, pagina: number, porPagina = 50) {
  const [t] = await consulta<{ total: string; activos: string }>(
    `select count(*) total, count(*) filter (where p.estado = 'activo') activos ${SIN_PUBLICACION}`, [org]);
  const filas = await consulta<SinPublicacion>(`
    select p.id::int, v.sku, left(p.titulo, 80) titulo, p.estado,
           (select coalesce(sum(s.cantidad), 0) from variacion vv join stock s on s.variacion_id = vv.id where vv.producto_id = p.id)::int stock,
           p.categoria_ml categoria, f.nombre familia
      ${SIN_PUBLICACION}
     order by (p.estado = 'activo') desc, v.sku
     limit ${porPagina} offset ${Math.max(0, pagina - 1) * porPagina}`, [org]);
  return { filas, total: Number(t.total), activos: Number(t.activos) };
}
