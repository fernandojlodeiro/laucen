// Planes de cuotas: se cargan en el producto o en su familia (y se heredan de
// la familia padre). Forma de planes_cuotas (jsonb):
//   [{ "cuotas": 3, "interes_pct": 0 }, { "cuotas": 6, "interes_pct": 0 }, { "cuotas": 12, "interes_pct": 15 }]
// interes_pct 0 = "sin interés" (el costo lo absorbe el vendedor). La ficha
// muestra el mejor plan sin interés y el checkout los respeta (Payway manda
// las cuotas; en Mercado Pago se limita la cantidad máxima).

import { consulta, una } from "@/lib/erp/base";

export type Plan = { cuotas: number; interes_pct: number };

const limpiar = (x: unknown): Plan[] =>
  Array.isArray(x) ? x.map((p) => ({ cuotas: Math.trunc(Number(p?.cuotas)), interes_pct: Number(p?.interes_pct ?? 0) }))
    .filter((p) => p.cuotas >= 1 && p.cuotas <= 24 && Number.isFinite(p.interes_pct)).sort((a, b) => a.cuotas - b.cuotas) : [];

/** Los planes que valen para una variación (producto → familia → familias de más arriba). */
export async function planesDe(org: string, variacionId: number): Promise<Plan[]> {
  const r = await una<{ planes: unknown }>(`
    with recursive v as (
      select p.planes_cuotas pp, p.familia_id from variacion va join producto p on p.id = va.producto_id where va.id = $2 and va.organizacion_id = $1
    ), cadena as (
      select f.id, f.padre_id, f.planes_cuotas, 0 nivel from familia f join v on f.id = v.familia_id
      union all
      select f.id, f.padre_id, f.planes_cuotas, c.nivel + 1 from familia f join cadena c on f.id = c.padre_id where c.nivel < 20
    )
    select coalesce((select pp from v), (select planes_cuotas from cadena where planes_cuotas is not null order by nivel limit 1)) planes`, [org, variacionId]);
  return limpiar(r?.planes);
}

/** Los planes que valen para todo el carrito: los que comparten todas sus
 *  variaciones (con el peor interés de cada cantidad de cuotas). */
export async function planesDelCarrito(org: string, variaciones: number[]): Promise<Plan[]> {
  if (!variaciones.length) return [];
  const listas = await Promise.all(variaciones.map((v) => planesDe(org, v)));
  const comunes = new Map<number, number>();
  for (const p of listas[0]) comunes.set(p.cuotas, p.interes_pct);
  for (const l of listas.slice(1)) {
    for (const c of [...comunes.keys()]) {
      const x = l.find((p) => p.cuotas === c);
      if (!x) comunes.delete(c); else comunes.set(c, Math.max(comunes.get(c)!, x.interes_pct));
    }
  }
  return [...comunes.entries()].map(([cuotas, interes_pct]) => ({ cuotas, interes_pct })).sort((a, b) => a.cuotas - b.cuotas);
}

/** "6 cuotas sin interés de $ 1.234" (el mejor plan sin interés), o null. */
export function mejorPlanSinInteres(planes: Plan[]): Plan | null {
  const sin = planes.filter((p) => p.interes_pct === 0 && p.cuotas > 1);
  return sin.length ? sin[sin.length - 1] : null;
}

/** planesDe() de muchas variaciones en una sola consulta (para los listados). */
export async function planesDeVariaciones(org: string, variaciones: number[]): Promise<Map<number, Plan[]>> {
  const m = new Map<number, Plan[]>();
  if (!variaciones.length) return m;
  const filas = await consulta<{ vid: number; planes: unknown }>(`
    with recursive v as (
      select va.id vid, p.planes_cuotas pp, p.familia_id from variacion va join producto p on p.id = va.producto_id
       where va.id = any($2::bigint[]) and va.organizacion_id = $1
    ), cadena as (
      select v.vid, f.id, f.padre_id, f.planes_cuotas, 0 nivel from v join familia f on f.id = v.familia_id
      union all
      select c.vid, f.id, f.padre_id, f.planes_cuotas, c.nivel + 1 from familia f join cadena c on f.id = c.padre_id where c.nivel < 20
    )
    select v.vid::int, coalesce(v.pp, (select c.planes_cuotas from cadena c where c.vid = v.vid and c.planes_cuotas is not null order by c.nivel limit 1)) planes
      from v`, [org, variaciones]);
  for (const f of filas) m.set(f.vid, limpiar(f.planes));
  return m;
}

/** El plan que se muestra en una tarjeta: el mejor sin interés o, si no hay, el de más cuotas. */
export function planParaMostrar(planes: Plan[]): Plan | null {
  const sin = mejorPlanSinInteres(planes);
  if (sin) return sin;
  const con = planes.filter((p) => p.cuotas > 1);
  return con.length ? con[con.length - 1] : null;
}
