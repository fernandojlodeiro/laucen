// Catálogo › Seguimientos (Fer, 13/10): cada producto con el estado de su precio de mercado (confirmado, monitoreado
// sin confirmar o sin seguimiento; lib/seguimiento/estado-mercado.ts), la Clásica de hoy, cuántas publicaciones sigue
// y cuántas faltan revisar, la más barata que sigue y el precio de mercado de la última búsqueda.

import { consulta } from "@/lib/erp/base";
import { sqlEstadoMercado, type EstadoMercado } from "@/lib/seguimiento/estado-mercado";

export type FilaSeguimientos = {
  producto_id: number; sku: string; titulo: string; fotos: string[] | null; estado: EstadoMercado; clasica: number | null;
  seguidas: number; sin_revisar: number; barata: number | null; barata_vendedor: string | null; barata_confirmada: boolean | null;
  mercado: number | null; mercado_n: number | null;
};

/** Los productos activos y todos los que siguen algo (aunque estén archivados); con `soloConSeguimiento`, sólo éstos. */
export async function listaSeguimientos(org: string, o: { soloConSeguimiento: boolean }): Promise<FilaSeguimientos[]> {
  return consulta<FilaSeguimientos>(`
    with lista as (select id from lista_precios where organizacion_id = $1
                    order by lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, orden, id limit 1)
    select p.id::int producto_id, coalesce(va.sku, p.sku_base) sku, p.titulo,
           (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = p.id) fotos,
           ${sqlEstadoMercado("p.id")} estado,
           (select pd.lista_ars from lista, precio_de($1, va.id, lista.id) pd)::float8 clasica,
           (select count(*)::int from seguimiento_pub sg where sg.producto_id = p.id and not sg.excluido) seguidas,
           (select count(*)::int from seguimiento_pub sg where sg.producto_id = p.id and not sg.confirmada) sin_revisar,
           b.precio::float8 barata, b.vendedor barata_vendedor, b.confirmada barata_confirmada,
           pm.p25::float8 mercado, pm.encontradas mercado_n
      from producto p
      left join variacion va on va.producto_id = p.id and va.es_default
      left join lateral (select sg.precio, sg.vendedor, sg.confirmada from seguimiento_pub sg
                          where sg.producto_id = p.id and sg.estado = 'activa' and sg.precio is not null and coalesce(sg.moneda, 'ARS') = 'ARS'
                            and not sg.excluido and not coalesce(sg.internacional, false) order by sg.precio limit 1) b on true
      left join precio_mercado pm on pm.organizacion_id = p.organizacion_id and pm.producto_id = p.id and pm.estado = 'ok'
     where p.organizacion_id = $1
       and (exists (select 1 from seguimiento_pub sg where sg.producto_id = p.id) or (not $2 and p.estado <> 'archivado'))
     order by p.titulo, p.id`, [org, o.soloConSeguimiento]);
}
