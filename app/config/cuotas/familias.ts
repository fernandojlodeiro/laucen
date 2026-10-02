// Las familias de la organización en orden de árbol (cada una debajo de su
// padre, con su nivel), para selectores y para el editor de cuotas.

import { consulta } from "@/lib/erp/base";

export type FamiliaArbol = { id: number; padre_id: number | null; nombre: string; nivel: number; planes: unknown };

export async function arbolFamilias(org: string): Promise<FamiliaArbol[]> {
  return consulta<FamiliaArbol>(`
    with recursive a as (
      select id, padre_id, nombre, planes_cuotas, 0 nivel, array[lower(nombre) || '#' || id] camino
        from familia where organizacion_id = $1 and padre_id is null
      union all
      select f.id, f.padre_id, f.nombre, f.planes_cuotas, a.nivel + 1, a.camino || (lower(f.nombre) || '#' || f.id)
        from familia f join a on f.padre_id = a.id where f.organizacion_id = $1 and a.nivel < 20
    )
    select id::int, padre_id::int, nombre, nivel, planes_cuotas planes from a order by camino`, [org]);
}
