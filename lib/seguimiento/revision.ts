// «✓ Producto revisado» (pedido de Fer, 23/10): una persona miró los seguimientos de un producto y los dejó bien
// (revisó las 🤖, excluyó o borró lo que no sirve). Sirve para ver el avance de la revisión antes de prender reglas.
// Si después entra una publicación seguida nueva, el producto vuelve a «por revisar» (hay algo que no se miró).

import { consulta, una } from "@/lib/erp/base";

export type Revision = { ts: Date; por: string | null; nuevas: number } | null;

/** SQL del estado de revisión de un producto (alias del id: `prod`): 'revisado', 'cambios' (entró algo después) o null. */
export const sqlRevision = (prod: string) => `(select case when exists (select 1 from seguimiento_pub sg where sg.producto_id = ${prod} and sg.creado_ts > r.revisado_ts)
    then 'cambios' else 'revisado' end from seguimiento_revision r where r.producto_id = ${prod})`;

export async function revisionDe(org: string, productoId: number): Promise<Revision> {
  const r = await una<{ ts: Date; por: string | null; nuevas: number }>(`
    select r.revisado_ts ts, r.revisado_por por,
           (select count(*)::int from seguimiento_pub sg where sg.producto_id = r.producto_id and sg.creado_ts > r.revisado_ts) nuevas
      from seguimiento_revision r where r.organizacion_id = $1 and r.producto_id = $2`, [org, productoId]);
  return r ?? null;
}

/** Marca (o vuelve a marcar, con la fecha de hoy) el producto como revisado; `false` lo desmarca. */
export async function marcarRevisado(org: string, productoId: number, si: boolean, usuario: string | null): Promise<void> {
  if (si) await consulta(`insert into seguimiento_revision (organizacion_id, producto_id, revisado_por) values ($1, $2, $3)
                          on conflict (organizacion_id, producto_id) do update set revisado_ts = now(), revisado_por = excluded.revisado_por`, [org, productoId, usuario]);
  else await consulta("delete from seguimiento_revision where organizacion_id = $1 and producto_id = $2", [org, productoId]);
}
