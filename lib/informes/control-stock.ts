// Informe del control de stock (Fer, 29/10; el control en lib/deposito/control.ts): la situación de hoy por cantidad
// de stock (cuántos productos, cuántos lugares, cuántos al día y cuántos pendientes) y lo que pasó en un período (por
// día, por persona y cada control). Los montos van a precio de venta: el del momento del control para lo que se
// controló, el de hoy para el stock.

import { consulta, una } from "@/lib/erp/base";
import { rangoDeAtajo } from "@/lib/rango-fechas";
import { SQL_LUGARES, type FiltroCola, type Resultado } from "@/lib/deposito/control";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ZONA = "America/Argentina/Buenos_Aires";

export type FiltroControl = FiltroCola & { desde: string; hasta: string; resultado: Resultado | null; persona: string | null };

export function leerFiltroControl(sp: Record<string, string | undefined>): FiltroControl {
  const def = rangoDeAtajo("7dias");
  const desde = FECHA.test(sp.desde ?? "") ? sp.desde! : def.desde;
  const hasta = FECHA.test(sp.hasta ?? "") ? sp.hasta! : def.hasta;
  const [d, h] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  const resultado = (["ok", "faltante", "a_buscar", "sobrante"] as const).find((r) => r === sp.resultado) ?? null;
  return { desde: d, hasta: h, resultado, persona: sp.persona || null, sinLugar: sp.lugar !== "0", soloMl: sp.ml !== "0" };
}

export type Banda = { banda: string; orden: number; productos: number; lugares: number; al_dia: number; pendientes: number; por_ingreso: number; valor: number };

/** Hoy, por cantidad de stock del producto: 1, 2, 3, 4 a 5, 6 a 10, más de 10. */
export async function situacionActual(org: string, f: FiltroCola): Promise<Banda[]> {
  return consulta<Banda>(`${SQL_LUGARES}
    , l as (select * from lugares l where not ($2 and l.sin_lugar) and (not $3 or l.con_ml))
    , pre as (select x.variacion_id, (select venta_ars from precio_de($1, x.variacion_id, lista_por_defecto($1))) precio
                from (select distinct variacion_id from l) x)
    , b as (select l.*, pre.precio,
                   case when l.total <= 3 then l.total when l.total <= 5 then 4 when l.total <= 10 then 6 else 11 end orden
              from l join pre using (variacion_id))
    select case orden when 4 then '4 a 5' when 6 then '6 a 10' when 11 then 'Más de 10' else orden::text end banda, orden::int,
           count(distinct variacion_id)::int productos, count(*)::int lugares,
           count(*) filter (where not pendiente)::int al_dia, count(*) filter (where pendiente)::int pendientes,
           count(*) filter (where por_ingreso)::int por_ingreso,
           coalesce(sum(cantidad * precio), 0)::float8 valor
      from b group by orden order by orden`, [org, f.sinLugar, f.soloMl]);
}

export type EnBusqueda = { controles: number; unidades: number; valor: number };

export async function enBusquedaAhora(org: string): Promise<EnBusqueda> {
  return (await una<EnBusqueda>(`
    select count(*)::int controles, coalesce(sum(diferencia), 0)::int unidades, coalesce(sum(diferencia * precio_ars), 0)::float8 valor
      from control_stock where organizacion_id = $1 and buscando`, [org])) ?? { controles: 0, unidades: 0, valor: 0 };
}

export type Resumen = {
  clave: string; nombre: string;
  controles: number; ok: number; faltantes: number; faltantes_u: number; faltantes_valor: number;
  a_buscar: number; a_buscar_u: number; a_buscar_valor: number; sobrantes: number; sobrantes_u: number;
  aparecieron_u: number; perdidas_u: number; perdidas_valor: number;
};

/** Lo que pasó en el período, agrupado por día o por persona. Los «A buscar» resueltos cuentan el día que se resolvieron. */
export async function resumenPeriodo(org: string, f: FiltroControl, por: "dia" | "persona"): Promise<Resumen[]> {
  const clave = por === "dia" ? `to_char(x.ts at time zone '${ZONA}', 'YYYY-MM-DD')` : "coalesce(x.usuario_id, '')";
  return consulta<Resumen>(`
    with c as (
      select k.ts, k.usuario_id, k.resultado, k.diferencia, k.precio_ars, null::int aparecieron, false resolucion
        from control_stock k where k.organizacion_id = $1 and (k.ts at time zone '${ZONA}')::date between $2 and $3
      union all
      select k.resuelto_ts, k.resuelto_por, k.resultado, k.diferencia, k.precio_ars, k.aparecieron, true
        from control_stock k where k.organizacion_id = $1 and k.resuelto_ts is not null and (k.resuelto_ts at time zone '${ZONA}')::date between $2 and $3
    ), x as (select * from c)
    select ${clave} clave,
           ${por === "dia" ? `to_char(min(x.ts) at time zone '${ZONA}', 'DD/MM/YY')` : "coalesce(min(us.nombre), min(us.email), 'Sin persona')"} nombre,
           count(*) filter (where not resolucion)::int controles,
           count(*) filter (where not resolucion and resultado = 'ok')::int ok,
           count(*) filter (where not resolucion and resultado = 'faltante')::int faltantes,
           coalesce(sum(diferencia) filter (where not resolucion and resultado = 'faltante'), 0)::int faltantes_u,
           coalesce(sum(diferencia * precio_ars) filter (where not resolucion and resultado = 'faltante'), 0)::float8 faltantes_valor,
           count(*) filter (where not resolucion and resultado = 'a_buscar')::int a_buscar,
           coalesce(sum(diferencia) filter (where not resolucion and resultado = 'a_buscar'), 0)::int a_buscar_u,
           coalesce(sum(diferencia * precio_ars) filter (where not resolucion and resultado = 'a_buscar'), 0)::float8 a_buscar_valor,
           count(*) filter (where not resolucion and resultado = 'sobrante')::int sobrantes,
           coalesce(sum(diferencia) filter (where not resolucion and resultado = 'sobrante'), 0)::int sobrantes_u,
           coalesce(sum(aparecieron) filter (where resolucion), 0)::int aparecieron_u,
           coalesce(sum(diferencia - aparecieron) filter (where resolucion), 0)::int perdidas_u,
           coalesce(sum((diferencia - aparecieron) * precio_ars) filter (where resolucion), 0)::float8 perdidas_valor
      from x left join usuarios us on us.id = x.usuario_id
     group by 1 order by 1 ${por === "dia" ? "desc" : ""}`, [org, f.desde, f.hasta]);
}

export type Control = {
  id: number; fecha: string; producto_id: number; sku: string; titulo: string; fotos: string[] | null; deposito: string; codigo: string;
  sistema: number; contado: number; resultado: Resultado; diferencia: number; valor: number | null; persona: string | null;
  buscando: boolean; aparecieron: number | null; resuelto: string | null;
};

/** Condición sobre `k` (control_stock) con los filtros del período; $1..$3 org, desde, hasta. */
const DONDE = `k.organizacion_id = $1 and (k.ts at time zone '${ZONA}')::date between $2 and $3`;

/** Cuántos controles de cada resultado hay en el período (para las pestañas). */
export async function cuentasPorResultado(org: string, f: FiltroControl): Promise<Record<Resultado | "todos", number>> {
  const filas = await consulta<{ resultado: Resultado; n: number }>(
    `select resultado, count(*)::int n from control_stock k where ${DONDE} and ($4::text is null or k.usuario_id = $4) group by 1`,
    [org, f.desde, f.hasta, f.persona]);
  const r = { todos: 0, ok: 0, faltante: 0, a_buscar: 0, sobrante: 0 };
  for (const x of filas) { r[x.resultado] = x.n; r.todos += x.n; }
  return r;
}

/** Los controles del período, del más nuevo al más viejo, de a una página. */
export async function controlesDelPeriodo(org: string, f: FiltroControl, pagina: { desde: number; cuantos: number }): Promise<Control[]> {
  return consulta<Control>(`
    select k.id::int, to_char(k.ts at time zone '${ZONA}', 'DD/MM/YY HH24:MI') fecha, v.producto_id::int, v.sku, titulo_variacion(v.id) titulo,
           coalesce((select array_agg(x.url order by x.orden) from variacion_foto x where x.variacion_id = v.id),
                    (select array_agg(x.url order by x.orden) from producto_foto x where x.producto_id = v.producto_id)) fotos,
           d.nombre deposito, case when u.es_default then 'General' else u.codigo end codigo,
           k.sistema, k.contado, k.resultado, k.diferencia, (k.diferencia * k.precio_ars)::float8 valor,
           coalesce(us.nombre, us.email) persona, k.buscando, k.aparecieron,
           to_char(k.resuelto_ts at time zone '${ZONA}', 'DD/MM/YY') resuelto
      from control_stock k join variacion v on v.id = k.variacion_id
      join ubicacion u on u.id = k.ubicacion_id join deposito d on d.id = u.deposito_id
      left join usuarios us on us.id = k.usuario_id
     where ${DONDE} and ($4::text is null or k.resultado = $4) and ($5::text is null or k.usuario_id = $5)
     order by k.ts desc, k.id desc limit ${pagina.cuantos} offset ${pagina.desde}`, [org, f.desde, f.hasta, f.resultado, f.persona]);
}
