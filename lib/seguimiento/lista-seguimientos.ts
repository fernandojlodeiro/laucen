// Catálogo › Seguimientos (Fer, 13/10): cada producto con el estado de su precio de mercado (confirmado, monitoreado
// sin confirmar o sin seguimiento; lib/seguimiento/estado-mercado.ts), la Clásica de hoy, cuántas publicaciones sigue
// y cuántas faltan revisar, la más barata que sigue y el precio de mercado de la última búsqueda.

import { unstable_cache } from "next/cache";
import { consulta } from "@/lib/erp/base";
import { sqlEstadoMercado, type EstadoMercado } from "@/lib/seguimiento/estado-mercado";
import { SQL_DISPONIBLE } from "@/lib/catalogo-alertas";
import { SQL_ES_NOTEBOOK } from "@/lib/seguimiento/a-la-venta";

export type FilaSeguimientos = {
  producto_id: number; sku: string; titulo: string; fotos: string[] | null; estado: EstadoMercado; clasica: number | null;
  seguidas: number; sin_revisar: number; barata: number | null; barata_vendedor: string | null; barata_confirmada: boolean | null;
  mercado: number | null; mercado_n: number | null;
  /** Stock disponible, y su valor a la Clásica (Fer, 22/10: ordenar por la plata que hay en stock). */
  disponible: number; valor_stock: number | null; notebook: boolean;
};

type Valores = { clasica: number | null; disponible: number; notebook: boolean };

/** La Clásica, el stock disponible y si es notebook de cada producto con algo seguido. Es lo lento (la Clásica sale de la
 *  función de precios, producto por producto): se guarda 15 minutos (Fer, 22/10: «la pantalla de seguimientos está lenta»). */
function valores(org: string): Promise<Record<number, Valores>> {
  return unstable_cache(async () => {
    const r = await consulta<{ id: number } & Valores>(`
      with lista as (select id from lista_precios where organizacion_id = $1
                      order by lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, orden, id limit 1)
      select p.id::int, (select pd.lista_ars from lista, precio_de($1, va.id, lista.id) pd)::float8 clasica,
             ${SQL_DISPONIBLE}::float8 disponible, ${SQL_ES_NOTEBOOK} notebook
        from producto p left join variacion va on va.producto_id = p.id and va.es_default
       where p.organizacion_id = $1 and exists (select 1 from seguimiento_pub sg where sg.producto_id = p.id)`, [org]);
    return Object.fromEntries(r.map((x) => [x.id, { clasica: x.clasica, disponible: Number(x.disponible) || 0, notebook: x.notebook }]));
  }, ["seguimientos-valores-1", org], { revalidate: 900, tags: [`seguimientos-valores-${org}`] })();
}

/** Los productos activos y todos los que siguen algo (aunque estén archivados); con `soloConSeguimiento`, sólo éstos. */
export async function listaSeguimientos(org: string, o: { soloConSeguimiento: boolean }): Promise<FilaSeguimientos[]> {
  // La Clásica de lo que no está en lo guardado (productos sin seguimiento, o con uno recién agregado) se calcula acá.
  const v = await valores(org);
  const guardados = Object.keys(v).map(Number);
  const filas = await consulta<FilaSeguimientos>(`
    with lista as (select id from lista_precios where organizacion_id = $1
                    order by lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, orden, id limit 1)
    select p.id::int producto_id, coalesce(va.sku, p.sku_base) sku, p.titulo,
           (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = p.id) fotos,
           ${sqlEstadoMercado("p.id")} estado,
           (case when not (p.id = any($3::bigint[]))
                 then (select pd.lista_ars from lista, precio_de($1, va.id, lista.id) pd) end)::float8 clasica,
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
     order by p.titulo, p.id`, [org, o.soloConSeguimiento, guardados]);
  return filas.map((f) => {
    const x = v[f.producto_id];
    const clasica = x ? x.clasica : f.clasica;
    const disponible = x?.disponible ?? 0;
    return { ...f, clasica, disponible, valor_stock: clasica != null ? clasica * disponible : null, notebook: x?.notebook ?? /^\s*notebook/i.test(f.titulo) };
  });
}
