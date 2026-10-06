// Buscar familias (categorías) por nombre o por su camino entero
// ("Electrónica › Componentes › …"). El árbol tiene miles (las categorías de
// Mercado Libre), así que nunca se manda entero a un desplegable: el buscador
// (app/componentes/ElegirFamilia.tsx) pide de a poco lo que coincide.

import { consulta } from "@/lib/erp/base";
import { parametroBusqueda, sqlBusqueda, terminosBusqueda } from "@/lib/busqueda";

export type FamiliaEncontrada = { id: number; nombre: string; camino: string };

/** El árbol con el camino de cada una y si es propia (ella y todas las de
 *  arriba sin ml_categoria). Una familia cuyo padre no existe queda arriba. */
const ARBOL = `
  with recursive arbol as (
    select f.id, f.nombre, f.nombre::text camino, f.descripcion, f.ml_categoria, (f.ml_categoria is null) propia, array[f.id] ids, 0 nivel
      from familia f
     where f.organizacion_id = $1
       and (f.padre_id is null or not exists (select 1 from familia x where x.id = f.padre_id and x.organizacion_id = $1))
    union all
    select f.id, f.nombre, a.camino || ' › ' || f.nombre, f.descripcion, f.ml_categoria, a.propia and f.ml_categoria is null, a.ids || f.id, a.nivel + 1
      from familia f join arbol a on f.padre_id = a.id
     where f.organizacion_id = $1 and a.nivel < 30 and not f.id = any(a.ids)
  )`;

/** Hasta `limite` familias con lo escrito en su camino (que termina en su nombre), su descripción, su
 *  categoría de Mercado Libre o su número, con la regla de lib/busqueda.ts.
 *  Primero las que empiezan con lo escrito (la primera condición).
 *  `propias`: sólo las propias. `excluir`: saca esa familia y todo lo que
 *  cuelga de ella (para elegir padre sin armar un círculo). */
export async function buscarFamilias(org: string, texto: string, opciones: { propias?: boolean; excluir?: number; limite?: number } = {}): Promise<FamiliaEncontrada[]> {
  const primera = terminosBusqueda(texto)[0];
  const inicio = primera ? `${primera.replace(/[\\%_]/g, "\\$&")}%` : "%";
  const limite = Math.min(Math.max(Math.trunc(opciones.limite ?? 50), 1), 200);
  return consulta<FamiliaEncontrada>(`${ARBOL}
    select id::int, nombre, camino from arbol
     where (not $3 or propia)
       and ($4::bigint is null or not ($4::bigint = any(ids)))
       and ${sqlBusqueda("$2", ["id::text", "camino", "descripcion", "ml_categoria"])}
     order by (nombre ilike $5) desc, (camino ilike $5) desc, nivel, camino
     limit ${limite}`,
    [org, parametroBusqueda(texto), !!opciones.propias, opciones.excluir || null, inicio]);
}

/** El camino de una familia ("Padre › Hija"), o null si no existe. */
export async function caminoDeFamilia(org: string, id: number | null | undefined): Promise<string | null> {
  if (!id) return null;
  const filas = await consulta<{ camino: string | null }>(`
    with recursive arriba as (
      select id, padre_id, nombre, 0 n from familia where id = $2 and organizacion_id = $1
      union all
      select f.id, f.padre_id, f.nombre, a.n + 1 from familia f join arriba a on f.id = a.padre_id
       where f.organizacion_id = $1 and a.n < 30
    )
    select string_agg(nombre, ' › ' order by n desc) camino from arriba`, [org, id]);
  return filas[0]?.camino ?? null;
}
