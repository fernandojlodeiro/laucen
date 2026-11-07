// El análisis diario: su configuración (config_org, clave 'analisis_diario'). Qué familias se miran en Mercado Libre,
// cuánto puede bajar una oferta contra el precio del esquema para proponerla, y si se avisa al celular. Se cambia en
// Informes › Análisis diario, pestaña Configuración. Los valores de fábrica: Notebooks e Impresoras 3D (las que se
// revisaban a mano) y el 3 % que puso Fer el 3/11 (bitácora #1061: ninguna notebook ni impresora a una oferta que baje
// más del 3 % de su precio).

import { consulta, una, ErrorErp } from "@/lib/erp/base";

export type ConfigAnalisis = {
  /** Las familias que se miran (con sus subfamilias). */
  familias: number[];
  /** Lo más que puede bajar una oferta (campaña, relámpago o compartida) contra el precio del esquema, en %. */
  maxBajaPct: number;
  /** Mandar un aviso al celular (y el cartel de Para hacer) cuando hay algo para hacer. */
  avisar: boolean;
};

export const CONFIG_DEFECTO: ConfigAnalisis = { familias: [], maxBajaPct: 3, avisar: true };

/** Las familias de fábrica: las que se llaman «Notebooks» e «Impresoras 3D» en la organización. */
async function familiasDefecto(org: string): Promise<number[]> {
  return (await consulta<{ id: number }>(
    "select id::int from familia where organizacion_id = $1 and lower(nombre) in ('notebooks', 'impresoras 3d') order by id", [org]).catch(() => []))
    .map((f) => f.id);
}

export async function configAnalisis(org: string): Promise<ConfigAnalisis> {
  const f = await una<{ valor: Partial<ConfigAnalisis> }>("select valor from config_org where organizacion_id = $1 and clave = 'analisis_diario'", [org]).catch(() => null);
  const v = f?.valor ?? {};
  const familias = Array.isArray(v.familias) ? v.familias.map(Number).filter((x) => Number.isInteger(x) && x > 0) : await familiasDefecto(org);
  const maxBajaPct = typeof v.maxBajaPct === "number" && Number.isFinite(v.maxBajaPct) ? v.maxBajaPct : CONFIG_DEFECTO.maxBajaPct;
  return { familias, maxBajaPct, avisar: typeof v.avisar === "boolean" ? v.avisar : CONFIG_DEFECTO.avisar };
}

export async function guardarConfigAnalisis(org: string, c: ConfigAnalisis): Promise<void> {
  if (!(c.maxBajaPct >= 0 && c.maxBajaPct <= 50)) throw new ErrorErp("Lo más que puede bajar una oferta tiene que estar entre 0 % y 50 %.");
  const familias = [...new Set(c.familias.filter((x) => Number.isInteger(x) && x > 0))];
  await consulta(`insert into config_org (organizacion_id, clave, valor) values ($1, 'analisis_diario', $2::jsonb)
                  on conflict (organizacion_id, clave) do update set valor = excluded.valor`,
    [org, JSON.stringify({ familias, maxBajaPct: Math.round(c.maxBajaPct * 10) / 10, avisar: c.avisar })]);
}

/** Los nombres (con el camino) de las familias elegidas. */
export async function nombresFamilias(org: string, ids: number[]): Promise<{ id: number; nombre: string }[]> {
  if (!ids.length) return [];
  const filas = await consulta<{ id: number; nombre: string }>(`
    with recursive c as (
      select f.id, f.id hoja, f.nombre::text camino, f.padre_id from familia f where f.organizacion_id = $1 and f.id = any($2::bigint[])
      union all
      select p.id, c.hoja, p.nombre || ' › ' || c.camino, p.padre_id from c join familia p on p.id = c.padre_id)
    select hoja::int id, camino nombre from c where padre_id is null`, [org, ids]);
  const por = new Map(filas.map((f) => [f.id, f.nombre]));
  return ids.filter((id) => por.has(id)).map((id) => ({ id, nombre: por.get(id)! }));
}
