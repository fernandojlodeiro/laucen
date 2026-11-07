// El informe de Market Pro de una categoría (Fer, 7/11; /market-pro/informe): los números fijos que se calculan
// siempre igual (este archivo) y el texto que escribe la IA después de explorar los datos (informe-ia.ts).
// Todo con meses CERRADOS. Los montos en dólares se pasan con el promedio del mes del dólar oficial (tipo_cambio),
// así la inflación no hace parecer que todo crece.

import { consulta, una } from "@/lib/erp/base";
import { porCategoria, porProducto, ultimoMes, type Filtro } from "@/lib/marketpro/analisis";

export type MesUsd = { mes: string; unidades: number; gmv: number; gmv_usd: number | null; ticket_usd: number | null; vendedores: number };
export type Franja = { franja: number; desde: number | null; hasta: number | null; unidades: number; parte: number | null; gmv_usd: number | null; vendedores: number; crecimiento: number | null };
export type DatosInforme = {
  mes: string; serie: MesUsd[]; franjas: Franja[];
  kpi: { gmv12: number; gmv12_usd: number; u12: number; crec_anual: number | null; crec_usd_anual: number | null; ticket_usd: number | null; vendedores12: number };
  categorias: Awaited<ReturnType<typeof porCategoria>>; productos: Awaited<ReturnType<typeof porProducto>>;
};

const TC = `tc as (select date_trunc('month', fecha)::date mes, avg(venta)::float8 tc from tipo_cambio
                    where organizacion_id is null and tipo = 'oficial' and fecha >= '2023-09-01' group by 1)`;
const DE_CAT = `($2::int is null or v.cat in (select category_id from mpro_categoria where pais = 'ar' and (category_id = $2 or $2 = any(padres))))`;

export async function serieUsd(org: string, cat: number | null): Promise<MesUsd[]> {
  return consulta<MesUsd>(`
    with ${TC}
    select to_char(v.periodo, 'YYYY-MM') mes, sum(v.vendidas)::int unidades, sum(v.gmv)::float8 gmv,
           (sum(v.gmv) / max(tc.tc))::float8 gmv_usd, (sum(v.gmv) / nullif(sum(v.vendidas), 0) / max(tc.tc))::float8 ticket_usd,
           count(distinct v.vendedor) filter (where v.vendidas > 0)::int vendedores
      from mpro_venta v left join tc on tc.mes = v.periodo
     where v.organizacion_id = $1 and v.grano = 'm' and v.vendidas > 0 and ${DE_CAT}
       and v.periodo < date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date
     group by v.periodo order by v.periodo`, [org, cat]);
}

/** Franjas de precio (en dólares) de los últimos 12 meses: cinco partes con la misma cantidad de publicaciones-mes con
 *  ventas; de cada una, las unidades, qué parte del total son y cómo crecen (3 meses contra los 3 anteriores). */
export async function franjasDePrecio(org: string, cat: number | null, mes: string): Promise<Franja[]> {
  return consulta<Franja>(`
    with ${TC},
    b as (
      select v.periodo, v.vendidas, v.gmv / tc.tc gmv_usd, v.precio / tc.tc precio_usd, v.vendedor
        from mpro_venta v join tc on tc.mes = v.periodo
       where v.organizacion_id = $1 and v.grano = 'm' and v.vendidas > 0 and v.precio > 0 and ${DE_CAT}
         and v.periodo <= $3::date and v.periodo > $3::date - interval '12 months'
    ),
    cortes as (select percentile_cont(array[0.2, 0.4, 0.6, 0.8]) within group (order by precio_usd) c from b),
    f as (select b.*, width_bucket(b.precio_usd, (select c from cortes)) + 1 franja from b)
    select franja, min(precio_usd)::float8 desde, max(precio_usd)::float8 hasta, sum(vendidas)::int unidades,
           (sum(vendidas)::float8 / sum(sum(vendidas)) over ()) parte, sum(gmv_usd)::float8 gmv_usd,
           count(distinct vendedor)::int vendedores,
           (sum(vendidas) filter (where periodo > $3::date - interval '3 months')::float8
             / nullif(sum(vendidas) filter (where periodo <= $3::date - interval '3 months' and periodo > $3::date - interval '6 months'), 0) - 1) crecimiento
      from f group by franja order by franja`, [org, cat, mes]);
}

export async function datosInforme(org: string, cat: number | null): Promise<DatosInforme | null> {
  const mes = await ultimoMes(org);
  if (!mes) return null;
  const f: Filtro = { cat, meses: 12, q: "", vendedor: null, marca: null, producto: null, tuyos: null };
  const [serie, franjas, categorias, productos] = await Promise.all([
    serieUsd(org, cat), franjasDePrecio(org, cat, mes), porCategoria(org, mes, f), porProducto(org, mes, f),
  ]);
  const anio = serie.slice(-12), ant = serie.slice(-24, -12);
  const suma = (xs: MesUsd[], k: "unidades" | "gmv" | "gmv_usd") => xs.reduce((a, m) => a + (m[k] ?? 0), 0);
  const u12 = suma(anio, "unidades"), gmv12 = suma(anio, "gmv"), gmv12_usd = suma(anio, "gmv_usd");
  return {
    mes, serie, franjas, categorias, productos,
    kpi: {
      gmv12, gmv12_usd, u12,
      crec_anual: ant.length === 12 && suma(ant, "unidades") ? u12 / suma(ant, "unidades") - 1 : null,
      crec_usd_anual: ant.length === 12 && suma(ant, "gmv_usd") ? gmv12_usd / suma(ant, "gmv_usd") - 1 : null,
      ticket_usd: u12 ? gmv12_usd / u12 : null,
      vendedores12: Math.max(0, ...anio.map((m) => m.vendedores)),
    },
  };
}

// ---- Lo guardado ----

export type Informe = { cat: number; texto: string | null; estado: "trabajando" | "listo" | "error"; error: string | null; costo_usd: number | null;
  consultas: number | null; datos_hasta: string | null; generado_ts: string | null; empezado_ts: string };
export type Extra = { id: number; pregunta: string | null; texto: string; creado_ts: string; usuario: string | null };

export async function informeGuardado(org: string, cat: number): Promise<Informe | null> {
  return una<Informe>(`
    select cat, texto, estado, error, costo_usd::float8, consultas, to_char(datos_hasta, 'YYYY-MM-DD') datos_hasta,
           to_char(generado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') generado_ts,
           to_char(empezado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') empezado_ts
      from mpro_informe where organizacion_id = $1 and cat = $2`, [org, cat]);
}

export async function extrasDe(org: string, cat: number): Promise<Extra[]> {
  return consulta<Extra>(`
    select e.id::int, e.pregunta, e.texto, to_char(e.creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') creado_ts,
           coalesce(u.nombre, u.email) usuario
      from mpro_informe_extra e left join usuarios u on u.id = e.usuario_id
     where e.organizacion_id = $1 and e.cat = $2 order by e.id`, [org, cat]);
}

export async function agregarExtra(org: string, cat: number, pregunta: string | null, texto: string, usuarioId: string) {
  await consulta("insert into mpro_informe_extra (organizacion_id, cat, pregunta, texto, usuario_id) values ($1, $2, $3, $4, $5)",
    [org, cat, pregunta?.slice(0, 2000) || null, texto.slice(0, 60_000), usuarioId]);
}

export async function borrarExtra(org: string, id: number) {
  await consulta("delete from mpro_informe_extra where organizacion_id = $1 and id = $2", [org, id]);
}
