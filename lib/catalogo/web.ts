// La tienda web como un canal más (Fer, 4/10): un producto se ve en la Web
// minorista (o mayorista) sólo si está publicado en ese canal, o sea si tiene
// una publicación propia (sin id externo) activa en él. El interruptor de la
// ficha (pestaña Publicaciones) la crea o la pausa para todas sus variaciones.

import { consulta, enTransaccion, ErrorErp } from "@/lib/erp/base";

export type CanalWeb = { id: number; nombre: string; tipo: string; publicado: boolean };

/** SQL: el producto `alias` está publicado en el canal web `canalSql` (uno "No publicable" nunca). */
export const sqlPublicadoEnWeb = (alias: string, canalSql: string) => `(not ${alias}.no_publicable and exists (
  select 1 from publicacion pw join variacion vw on vw.id = pw.variacion_id
   where vw.producto_id = ${alias}.id and pw.canal_id = ${canalSql} and pw.estado = 'activa'))`;

/** Los canales web de la organización y si el producto está publicado en cada uno. */
export async function canalesWebDe(org: string, productoId: number): Promise<CanalWeb[]> {
  return consulta<CanalWeb>(`
    select c.id::int, c.nombre, c.tipo, ${sqlPublicadoEnWeb("p", "c.id")} publicado
      from canal c join producto p on p.id = $2 and p.organizacion_id = c.organizacion_id
     where c.organizacion_id = $1 and c.tipo in ('web_minorista', 'web_mayorista') and c.estado <> 'archivado'
     order by c.tipo desc, c.nombre`, [org, productoId]);
}

/** Marca o desmarca el producto como "No publicable" (insumo o parte de otro: no va a
 *  Mercado Libre ni a la web y no cuenta en las alertas de "sin publicar"). Al marcarlo
 *  sale de las tiendas web. Sus publicaciones de ML, si tiene, no se tocan. */
export async function marcarNoPublicable(org: string, productoId: number, valor: boolean): Promise<void> {
  await enTransaccion(async (c) => {
    const r = await c.query("update producto set no_publicable = $3, actualizado_ts = now() where id = $1 and organizacion_id = $2", [productoId, org, valor]);
    if (!r.rowCount) throw new ErrorErp("Ese producto no existe.");
    if (valor) {
      await c.query(`
        update publicacion pu set estado = 'pausada' from variacion v, canal ca
         where v.id = pu.variacion_id and ca.id = pu.canal_id and v.producto_id = $2 and pu.organizacion_id = $1
           and ca.tipo in ('web_minorista', 'web_mayorista') and pu.id_externo is null and pu.estado = 'activa'`, [org, productoId]);
    }
  });
}

/** Publica (todas sus variaciones activas) o saca de la web el producto. */
export async function publicarEnWeb(org: string, productoId: number, canalId: number, publicar: boolean): Promise<void> {
  await enTransaccion(async (c) => {
    const ok = await c.query("select 1 from canal where id = $1 and organizacion_id = $2 and tipo in ('web_minorista', 'web_mayorista')", [canalId, org]);
    if (!ok.rowCount) throw new ErrorErp("Ese canal no es una web.");
    if (publicar && (await c.query("select 1 from producto where id = $1 and organizacion_id = $2 and no_publicable", [productoId, org])).rowCount)
      throw new ErrorErp("El producto está marcado como No publicable: no va a la web. Apagá esa marca primero.");
    if (publicar) {
      await c.query(`
        insert into publicacion (organizacion_id, variacion_id, canal_id, estado, titulo)
        select v.organizacion_id, v.id, $3, 'activa', titulo_variacion(v.id) from variacion v
         where v.producto_id = $2 and v.organizacion_id = $1 and v.estado = 'activa'
        on conflict (canal_id, variacion_id) where id_externo is null do update set estado = 'activa'`, [org, productoId, canalId]);
    } else {
      await c.query(`
        update publicacion pu set estado = 'pausada' from variacion v
         where v.id = pu.variacion_id and v.producto_id = $2 and pu.organizacion_id = $1 and pu.canal_id = $3 and pu.id_externo is null`,
        [org, productoId, canalId]);
    }
  });
}
