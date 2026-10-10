// Planes de cuotas por grupo (Fer, 8/10): Precios en ML › Planes de cuotas.
// Por grupo de categorías (hoy «Notebooks» y «Resto»): qué planes se crean,
// cuántas cuotas ve el comprador en cada uno (a mano: ML no lo informa) y el
// % extra sobre lo que deja la Clásica. Vale para todas las cuentas de ML;
// por cuenta queda sólo «¿gana?» (ml_plan_config.ajuste_pct). Los planes van
// desde la Clásica que se elige por plan («Desde $»; vacío = desde la Clásica en
// que ML empieza a dar envío gratis, la barrera, 33.000). Ningún plan se crea si
// su precio cae en la franja de 10 % abajo del envío gratis (Fer, 10/10).

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { PLANES, comisionesDe, type Comisiones, type FilaComision, type Lugar, type Plan, type PlanOClasica, type ReglasPlan } from "@/lib/precios-ml/motor";

/** Quién gana una publicación en el grupo: una cuenta fija (id del canal) o «rota». */
export type Gana = number | "rota";
export const PUBLICACIONES_GANA = ["clasica", ...PLANES] as const;

export type PlanGrupo = { usar: boolean; cuotasVisibles: number | null; margenPct: number | null;
  /** Desde qué Clásica va el plan: null = desde el envío gratis; 0 = siempre. */
  desdePrecio?: number | null };
export type GrupoPlanes = {
  id: number; nombre: string; familias: number[]; nombresFamilias: string[]; orden: number;
  planes: Record<Plan, PlanGrupo>;
  /** Quién gana la Clásica y cada plan, y cuánto más caras van las cuentas que no ganan. */
  gana: Record<PlanOClasica, Gana>; ajusteNoGana: number;
};

const VACIO: PlanGrupo = { usar: false, cuotasVisibles: null, margenPct: null, desdePrecio: null };

/** Los grupos de la organización con sus planes (el grupo sin familias es «el resto»). */
export async function gruposPlanes(org: string): Promise<GrupoPlanes[]> {
  const filas = await consulta<{ id: number; nombre: string; familias: number[]; orden: number; nombres: string[] | null; gana: Record<string, unknown> | null; ajuste_no_gana: number;
    planes: Record<string, { usar: boolean; cuotas: number | null; margen: number | null; desde: number | null }> | null }>(`
    select g.id::int, g.nombre, g.familias::int[] familias, g.orden, g.gana, g.ajuste_no_gana::float8,
           (select array_agg(f.nombre order by f.nombre) from familia f where f.id = any(g.familias)) nombres,
           (select jsonb_object_agg(p.plan, jsonb_build_object('usar', p.usar, 'cuotas', p.cuotas_visibles, 'margen', p.margen_pct::float8, 'desde', p.desde_precio::float8))
              from ml_plan_grupo_plan p where p.grupo_id = g.id) planes
      from ml_plan_grupo g where g.organizacion_id = $1
     order by g.familias = '{}', g.orden, g.id`, [org]);
  return filas.map((f) => ({
    id: f.id, nombre: f.nombre, familias: f.familias ?? [], nombresFamilias: f.nombres ?? [], orden: f.orden,
    planes: Object.fromEntries(PLANES.map((p) => {
      const x = f.planes?.[p];
      return [p, x ? { usar: !!x.usar, cuotasVisibles: x.cuotas ?? null, margenPct: x.margen ?? null, desdePrecio: x.desde ?? null } : VACIO];
    })) as Record<Plan, PlanGrupo>,
    gana: Object.fromEntries(PUBLICACIONES_GANA.map((p) => {
      const x = f.gana?.[p];
      return [p, Number(x) > 0 ? Number(x) : "rota"];
    })) as Record<PlanOClasica, Gana>,
    ajusteNoGana: Number(f.ajuste_no_gana ?? 3),
  }));
}

/** El grupo de un producto: el primero cuyas categorías contienen la suya (o una de arriba); si no, el resto. */
export function grupoDeLugar(grupos: GrupoPlanes[], familias: number[]): GrupoPlanes | null {
  return grupos.find((g) => g.familias.length && g.familias.some((f) => familias.includes(f))) ?? grupos.find((g) => !g.familias.length) ?? null;
}

/** La cuenta que gana una publicación de un producto: la fija del grupo o, con «rota», una de las cuentas que no
 *  ganan nada fijo en el grupo, repartidas parejo por número de producto (siempre la misma para cada producto). */
export function ganadorDe(g: GrupoPlanes, plan: PlanOClasica, productoId: number, canales: number[]): number | null {
  const x = g.gana[plan];
  if (x !== "rota") return canales.includes(x) ? x : null;
  const fijas = new Set(Object.values(g.gana).filter((v): v is number => v !== "rota"));
  const libres = canales.filter((c) => !fijas.has(c)).sort((a, b) => a - b);
  const lista = libres.length ? libres : [...canales].sort((a, b) => a - b);
  return lista.length ? lista[productoId % lista.length] : null;
}

/** «¿Gana?» por grupo para un canal, en el formato del motor: 0 si gana, +% si no. */
export function ajustesDeGrupos(grupos: GrupoPlanes[], canal: number, canales: number[]): (lugar: Lugar) => Partial<Record<PlanOClasica, number>> {
  return (lugar) => {
    const g = grupoDeLugar(grupos, lugar.familias);
    if (!g) return {};
    return Object.fromEntries(PUBLICACIONES_GANA.map((p) => {
      const ganador = ganadorDe(g, p, lugar.productoId, canales);
      return [p, ganador == null || ganador === canal ? 0 : g.ajusteNoGana];
    }));
  };
}

/** Desde qué Clásica van planes: el precio en que ML empieza a dar envío gratis
 *  (lo que releva Costos ML todos los días). Si ML lo cambia, se toma solo. */
export async function barreraPlanes(): Promise<number> {
  const hay = await una<{ ok: boolean }>("select to_regclass('public.ml_costos_envio_gratis_vigente') is not null ok");
  if (!hay?.ok) return 33_000;
  const r = await una<{ min: number | null }>("select min(precio)::float8 min from ml_costos_envio_gratis_vigente");
  return r?.min && r.min > 0 ? r.min : 33_000;
}

/** Las reglas de planes que salen de los grupos, en el formato del motor: el
 *  grupo sin familias como lo general; cada familia de un grupo, como una
 *  excepción de categoría (vale para sus subcategorías). */
export function reglasDeGrupos(grupos: GrupoPlanes[], barrera: number): ReglasPlan[] {
  const salida: ReglasPlan[] = [];
  for (const g of grupos) {
    const donde = g.familias.length ? g.familias.map((f) => ({ nivel: "familia" as const, familia_id: f, producto_id: null })) : [{ nivel: "general" as const, familia_id: null, producto_id: null }];
    for (const d of donde) {
      for (const plan of PLANES) {
        const p = g.planes[plan];
        salida.push({ ...d, plan, activo: p.usar, precio_minimo: p.desdePrecio ?? barrera, margen_pct: p.margenPct ?? 0, cuotas_visibles: p.cuotasVisibles, ajuste_pct: null });
      }
    }
  }
  return salida;
}

/** La comisión de referencia de cada grupo: la de la categoría de ML con más
 *  productos publicados del grupo. */
export async function comisionReferencia(org: string): Promise<Map<number, { categoria: string; ruta: string | null; productos: number; comisiones: Comisiones }>> {
  const hay = await una<{ ok: boolean }>("select to_regclass('public.ml_costos_comisiones_vigente') is not null ok");
  if (!hay?.ok) return new Map();
  const filas = await consulta<FilaComision & { grupo: number; categoria: string; ruta: string | null; productos: number }>(`
    with pubs as (
      select ml_grupo_de_producto($1, v.producto_id) grupo, p.categoria_externa categoria, count(distinct v.producto_id)::int productos
        from publicacion p join variacion v on v.id = p.variacion_id join canal c on c.id = p.canal_id
       where p.organizacion_id = $1 and c.tipo = 'mercadolibre' and p.estado <> 'cerrada' and p.categoria_externa is not null
       group by 1, 2),
    top as (select distinct on (grupo) * from pubs where grupo is not null order by grupo, productos desc)
    select t.grupo::int, t.categoria, t.productos, k.ruta, k.clasica_pct::float8, k.premium_pct::float8, k.premium_3x_pct::float8, k.premium_9x_pct::float8, k.premium_12x_pct::float8
      from top t join ml_costos_comisiones_vigente k on k.categoria_id = t.categoria`, [org]);
  return new Map(filas.map((f) => [f.grupo, { categoria: f.categoria, ruta: f.ruta, productos: f.productos, comisiones: comisionesDe(f).valores }]));
}

export type ValoresGrupo = Record<Plan, { usar: boolean; cuotasVisibles: number | null; margenPct: number | null; desdePrecio?: number | null }> & { gana?: Record<PlanOClasica, Gana>; ajusteNoGana?: number | null };

/** Graba los planes de un grupo. */
export async function guardarGrupo(org: string, grupoId: number, v: ValoresGrupo): Promise<void> {
  const g = await una("select 1 from ml_plan_grupo where id = $1 and organizacion_id = $2", [grupoId, org]);
  if (!g) throw new ErrorErp("Ese grupo ya no existe.");
  for (const plan of PLANES) {
    const x = v[plan];
    if (x.cuotasVisibles != null && !(Number.isInteger(x.cuotasVisibles) && x.cuotasVisibles >= 1 && x.cuotasVisibles <= 36)) throw new ErrorErp("Las cuotas que ve el comprador van de 1 a 36.");
    if (x.margenPct != null && !(x.margenPct >= -50 && x.margenPct <= 300)) throw new ErrorErp("El % extra tiene que estar entre -50 % y 300 %.");
    if (x.desdePrecio != null && !(x.desdePrecio >= 0)) throw new ErrorErp("El «desde» tiene que ser un precio de 0 o más (vacío = desde el envío gratis).");
    if (x.usar && x.margenPct == null) throw new ErrorErp("Un plan tildado necesita su % extra sobre la Clásica (0 si no querés extra).");
  }
  for (const plan of PLANES) {
    const x = v[plan];
    await consulta(`
      insert into ml_plan_grupo_plan (organizacion_id, grupo_id, plan, usar, cuotas_visibles, margen_pct, desde_precio) values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (grupo_id, plan) do update set usar = excluded.usar, cuotas_visibles = excluded.cuotas_visibles, margen_pct = excluded.margen_pct,
        desde_precio = excluded.desde_precio, actualizado_ts = now()`,
      [org, grupoId, plan, x.usar, x.cuotasVisibles, x.margenPct, x.desdePrecio ?? null]);
  }
  if (v.ajusteNoGana != null && !(v.ajusteNoGana >= 0 && v.ajusteNoGana <= 50)) throw new ErrorErp("Lo que van más caras las cuentas que no ganan tiene que estar entre 0 % y 50 %.");
  await consulta(`update ml_plan_grupo set actualizado_ts = now(), gana = coalesce($2::jsonb, gana), ajuste_no_gana = coalesce($3, ajuste_no_gana) where id = $1`,
    [grupoId, v.gana ? JSON.stringify(v.gana) : null, v.ajusteNoGana ?? null]);
}

/** Cuántas cuotas ve el comprador en una publicación (SQL para las listas): el
 *  plan del grupo del producto. `producto` y `plan` son expresiones SQL. */
export const sqlCuotasVisibles = (org: string, producto: string, plan: string) =>
  `(select gp.cuotas_visibles from ml_plan_grupo_plan gp where gp.grupo_id = ml_grupo_de_producto(${org}, ${producto}) and gp.plan = ${plan})`;
