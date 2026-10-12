// Informe: qué precios subirían o bajarían con la regla de cada producto (pedido de Fer, 12/10). Por cada producto con
// regla de seguimiento prendida (lib/seguimiento/regla.ts): la Clásica de hoy, la referencia (la publicación elegida o
// la más barata de las seguidas, con lo último leído), el objetivo y lo que haría la regla, con las mismas cuentas
// puras que usa la regla (objetivoDe / decidir). Sólo muestra: el cambio se aplica desde la pestaña Seguimiento del
// producto («Aplicar»), y de la lista de precios lo lleva el esquema de precios a Mercado Libre.

import { consulta } from "@/lib/erp/base";
import { decidir, objetivoDe, type ComoRegla } from "@/lib/seguimiento/regla-calculo";

export type FilaPrecioSeguimiento = {
  producto_id: number; sku: string; titulo: string; fotos: string[] | null; modo: string;
  costo: number | null; piso: number; techo: number | null; clasica: number | null;
  referencia: number | null; vendedor: string | null; item_id: string | null; permalink: string | null; leido_ts: Date | null; estado_ref: string | null;
  objetivo: number | null; nuevo: number | null; motivo: string; cambio_pct: number | null; que: "sube" | "baja" | "queda" | "sin_dato";
};

export async function preciosSeguimiento(org: string): Promise<FilaPrecioSeguimiento[]> {
  const filas = await consulta<{
    producto_id: number; sku: string; titulo: string; fotos: string[] | null; modo: string; como: ComoRegla; diferencia: number;
    costo: number | null; piso: number; techo: number | null; subir: boolean; clasica: number | null;
    referencia: number | null; vendedor: string | null; item_id: string | null; permalink: string | null; leido_ts: Date | null; estado_ref: string | null;
  }>(`
    with lista as (select id from lista_precios where organizacion_id = $1
                    order by lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') desc, orden, id limit 1),
    tc as (select tc_del_dia($1, current_date)::float8 tc)
    select p.id::int producto_id, va.sku, p.titulo, r.modo, r.como, r.diferencia::float8, r.piso::float8, r.techo::float8, r.subir,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = p.id) fotos,
           round(va.costo_ultimo_usd * tc.tc)::float8 costo,
           (select pd.lista_ars from lista, precio_de($1, va.id, lista.id) pd)::float8 clasica,
           ref.precio::float8 referencia, ref.vendedor, ref.item_id, ref.permalink, ref.leido_ts, ref.estado estado_ref
      from seguimiento_regla r
      join producto p on p.id = r.producto_id
      join variacion va on va.producto_id = p.id and va.es_default
      cross join tc
      left join lateral (
        select s.precio, s.vendedor, s.item_id, s.permalink, s.leido_ts, s.estado from seguimiento_pub s
         where s.organizacion_id = $1 and s.producto_id = p.id
           and (case when r.contra = 'una' then s.id = r.seguimiento_id
                     else s.estado = 'activa' and s.precio is not null and coalesce(s.moneda, 'ARS') = 'ARS' and not s.excluido and not coalesce(s.internacional, false) end)
         order by s.precio nulls last limit 1) ref on true
     where r.organizacion_id = $1 and r.modo <> 'apagada'
     order by va.sku`, [org]);
  return filas.map((f) => {
    const conRef = f.referencia != null && f.estado_ref === "activa";
    const objetivo = conRef ? objetivoDe(f.referencia!, f.como, f.como === "igual" ? 0 : f.diferencia) : null;
    const d = conRef && f.clasica != null ? decidir(f.clasica, objetivo!, f.piso, f.subir ? f.techo : null) : { nuevo: null, motivo: f.clasica == null ? "sin precio en la Clásica" : "sin precio leído del competidor" };
    const que = !conRef || f.clasica == null ? "sin_dato" : d.nuevo == null ? "queda" : d.nuevo > f.clasica ? "sube" : "baja";
    return {
      producto_id: f.producto_id, sku: f.sku, titulo: f.titulo, fotos: f.fotos, modo: f.modo, costo: f.costo, piso: f.piso, techo: f.techo, clasica: f.clasica,
      referencia: f.referencia, vendedor: f.vendedor, item_id: f.item_id, permalink: f.permalink, leido_ts: f.leido_ts, estado_ref: f.estado_ref,
      objetivo, nuevo: d.nuevo, motivo: d.motivo, cambio_pct: d.nuevo != null && f.clasica ? Math.round((d.nuevo / f.clasica - 1) * 1000) / 10 : null, que,
    };
  });
}
