// Las filas de la portada de la tienda que se arman a mano: "Destacados" y
// "Novedades" (tienda_portada_producto). Se cargan en Configuración › Portada
// de la tienda; la portada (app/tienda/[slug]/page.tsx) las lee con idsDe().

import type { QueryResultRow } from "pg";
import { consulta, una, ErrorErp, enTransaccion } from "@/lib/erp/base";

export type ListaPortada = "destacados" | "novedades";
export const LISTAS_PORTADA: Record<ListaPortada, { titulo: string; ayuda: string; vacia: string }> = {
  destacados: { titulo: "Destacados", ayuda: "Los primeros que se ven en la portada, en el orden que les pongas.", vacia: "Sin productos elegidos: la fila Destacados no se muestra." },
  novedades: { titulo: "Novedades", ayuda: "Si elegís productos, salen estos en este orden; si no, salen solos los últimos cargados.", vacia: "Sin productos elegidos: salen solos los últimos cargados." },
};
/** Cuántos entran por fila (el carrusel muestra ~5 por pantalla en la PC y 2 en el celular). */
export const MAX_PORTADA = 24;

export const esLista = (x: unknown): x is ListaPortada => x === "destacados" || x === "novedades";

export type ProductoPortada = { id: number; sku: string; titulo: string; orden: number; foto: string | null; stock: number; archivado: boolean };

export async function productosDe(org: string, canalId: number, lista: ListaPortada): Promise<ProductoPortada[]> {
  return consulta<ProductoPortada>(`
    select p.id::int, p.sku_base sku, p.titulo, t.orden::int, p.estado = 'archivado' archivado,
           (select url from producto_foto f where f.producto_id = p.id order by f.orden, f.id limit 1) foto,
           coalesce((select sum(stock_disponible_canal($1, v.id, $2)) from variacion v where v.producto_id = p.id), 0)::int stock
      from tienda_portada_producto t join producto p on p.id = t.producto_id
     where t.organizacion_id = $1 and t.canal_id = $2 and t.lista = $3 order by t.orden, t.id`, [org, canalId, lista]);
}

/** Los ids elegidos, en orden (para la portada). */
export async function idsDe(canalId: number, lista: ListaPortada): Promise<number[]> {
  const f = await consulta<{ producto_id: number }>("select producto_id::int from tienda_portada_producto where canal_id = $1 and lista = $2 order by orden, id", [canalId, lista]);
  return f.map((x) => x.producto_id);
}

async function canalDeLaOrg(org: string, canalId: number) {
  if (!(await una("select 1 from canal where id = $1 and organizacion_id = $2 and tipo = 'web_minorista'", [canalId, org]))) throw new ErrorErp("La tienda no existe.");
}

export async function agregar(org: string, canalId: number, lista: ListaPortada, productoId: number) {
  await canalDeLaOrg(org, canalId);
  if (!(await una("select 1 from producto where id = $1 and organizacion_id = $2 and estado <> 'archivado'", [productoId, org]))) throw new ErrorErp("El producto no existe.");
  await enTransaccion(async (c) => {
    const q = <T extends QueryResultRow>(sql: string, v?: unknown[]) => c.query<T>(sql, v);
    const [n] = (await q<{ n: number; max: number }>("select count(*)::int n, coalesce(max(orden), 0)::int max from tienda_portada_producto where canal_id = $1 and lista = $2", [canalId, lista])).rows;
    if (n.n >= MAX_PORTADA) throw new ErrorErp(`Entran hasta ${MAX_PORTADA} productos por fila. Sacá alguno para agregar otro.`);
    await q("insert into tienda_portada_producto (organizacion_id, canal_id, lista, producto_id, orden) values ($1, $2, $3, $4, $5) on conflict do nothing", [org, canalId, lista, productoId, n.max + 1]);
  });
}

export async function quitar(org: string, canalId: number, lista: ListaPortada, productoId: number) {
  await consulta("delete from tienda_portada_producto where organizacion_id = $1 and canal_id = $2 and lista = $3 and producto_id = $4", [org, canalId, lista, productoId]);
}

/** Sube (-1) o baja (+1) un producto un lugar; deja los órdenes parejos (1, 2, 3…). */
export async function mover(org: string, canalId: number, lista: ListaPortada, productoId: number, paso: -1 | 1) {
  await enTransaccion(async (c) => {
    const q = <T extends QueryResultRow>(sql: string, v?: unknown[]) => c.query<T>(sql, v);
    const ids = (await q<{ producto_id: number }>("select producto_id::int from tienda_portada_producto where organizacion_id = $1 and canal_id = $2 and lista = $3 order by orden, id", [org, canalId, lista])).rows.map((x) => x.producto_id);
    const i = ids.indexOf(productoId), j = i + paso;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [k, id] of ids.entries()) await q("update tienda_portada_producto set orden = $5 where organizacion_id = $1 and canal_id = $2 and lista = $3 and producto_id = $4", [org, canalId, lista, id, k + 1]);
  });
}

export type ProductoHallado = { id: number; sku: string; titulo: string; foto: string | null };
/** Productos activos por SKU, título o marca que todavía no están en esa fila. Hasta 20. */
export async function buscarParaPortada(org: string, canalId: number, lista: ListaPortada, patron: string): Promise<ProductoHallado[]> {
  return consulta<ProductoHallado>(`
    select p.id::int, p.sku_base sku, p.titulo,
           (select url from producto_foto f where f.producto_id = p.id order by f.orden, f.id limit 1) foto
      from producto p
     where p.organizacion_id = $1 and p.estado = 'activo'
       and (p.sku_base ilike $4 or p.titulo ilike $4 or p.marca ilike $4)
       and not exists (select 1 from tienda_portada_producto t where t.canal_id = $2 and t.lista = $3 and t.producto_id = p.id)
     order by p.titulo limit 20`, [org, canalId, lista, patron]);
}
