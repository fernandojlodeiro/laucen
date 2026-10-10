// Marcas (pedido de Fer, 10/10): una tabla, para que no se escriban mal y
// sirvan de filtro. El producto guarda marca_id y su nombre al lado
// (producto.marca), que mantiene la base sola (db/catalogo.sql,
// producto_marca_sync). Cambiarle el nombre a una marca por el de otra que ya
// existe las une: los productos pasan a la que queda.

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import type { Opcion } from "@/app/componentes/ElegirDeLista";

/** Todas las marcas, para elegir (con cuántos productos tiene cada una). */
export async function opcionesMarcas(org: string): Promise<Opcion[]> {
  const r = await consulta<{ id: number; nombre: string; n: number }>(`
    select m.id::int, m.nombre, (select count(*) from producto p where p.marca_id = m.id)::int n
      from marca m where m.organizacion_id = $1 order by lower(m.nombre)`, [org]);
  return r.map((m) => ({ id: m.id, texto: m.nombre, detalle: m.n ? `(${m.n})` : undefined }));
}

export async function marcaValida(org: string, id: number | null): Promise<number | null> {
  if (!id) return null;
  if (!(await una("select 1 from marca where id = $1 and organizacion_id = $2", [id, org]))) throw new ErrorErp("Esa marca no existe.");
  return id;
}

/** Crea una marca. Si ya existe (sin importar mayúsculas), avisa. */
export async function crearMarca(org: string, nombre: string): Promise<{ id: number; nombre: string }> {
  const n = nombre.replace(/\s+/g, " ").trim();
  if (!n) throw new ErrorErp("La marca necesita un nombre.");
  if (n.length > 60) throw new ErrorErp("El nombre de la marca: hasta 60 letras.");
  const ya = await una<{ nombre: string }>("select nombre from marca where organizacion_id = $1 and lower(trim(nombre)) = lower($2)", [org, n]);
  if (ya) throw new ErrorErp(`La marca «${ya.nombre}» ya existe.`);
  const r = await una<{ id: number }>("insert into marca (organizacion_id, nombre) values ($1, $2) returning id::int", [org, n]);
  return { id: r!.id, nombre: n };
}

/** Le cambia el nombre. Si el nombre nuevo es el de otra marca, las une: sus productos pasan a esa y ésta se borra. */
export async function renombrarMarca(org: string, id: number, nombre: string): Promise<{ unida: string | null }> {
  const n = nombre.replace(/\s+/g, " ").trim();
  if (!n) throw new ErrorErp("La marca necesita un nombre.");
  if (n.length > 60) throw new ErrorErp("El nombre de la marca: hasta 60 letras.");
  return enTransaccion(async (c) => {
    const yo = (await c.query("select 1 from marca where id = $1 and organizacion_id = $2", [id, org])).rowCount;
    if (!yo) throw new ErrorErp("Esa marca no existe.");
    const otra = (await c.query<{ id: string; nombre: string }>(
      "select id, nombre from marca where organizacion_id = $1 and lower(trim(nombre)) = lower($2) and id <> $3", [org, n, id])).rows[0];
    if (otra) {
      await c.query("update producto set marca_id = $3 where organizacion_id = $1 and marca_id = $2", [org, id, otra.id]);
      await c.query("delete from marca where id = $1 and organizacion_id = $2", [id, org]);
      return { unida: otra.nombre };
    }
    await c.query("update marca set nombre = $3 where id = $1 and organizacion_id = $2", [id, org, n]);
    // El nombre que leen las pantallas, al día.
    await c.query("update producto set marca = $3 where organizacion_id = $1 and marca_id = $2", [org, id, n]);
    return { unida: null };
  });
}

export async function borrarMarca(org: string, id: number): Promise<void> {
  const n = await una<{ n: number }>("select count(*)::int n from producto where marca_id = $1 and organizacion_id = $2", [id, org]);
  if (n?.n) throw new ErrorErp(`Tiene ${n.n} producto${n.n === 1 ? "" : "s"}: cambiales la marca primero, o cambiale el nombre a ésta por el de otra para unirlas.`);
  await consulta("delete from marca where id = $1 and organizacion_id = $2", [id, org]);
}
