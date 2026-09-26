// Consultas del panel de Importaciones. Todas arrancan de `base()` (resumen o
// tabla grande, según el filtro) y devuelven filas listas para la tabla.

import { pool } from "@/db";
import { base, dondeItems, Sql, type Filtro } from "./filtro";

// ── Referencias (códigos → nombres) ───────────────────────

export type Refs = {
  pais: Map<string, string>;
  transporte: Map<string, string>;
  aduana: Map<string, string>;
  unidad: Map<string, string>;
};

export async function referencias(): Promise<Refs> {
  const leer = async (t: string) =>
    new Map((await pool.query<{ codigo: string; nombre: string | null }>(`select codigo, nombre from ${t}`)).rows
      .filter((r) => r.nombre).map((r) => [r.codigo, r.nombre!]));
  const [pais, transporte, aduana, unidad] = await Promise.all(
    ["ref_pais", "ref_transporte", "ref_aduana", "ref_unidad"].map(leer));
  return { pais, transporte, aduana, unidad };
}

/** El nombre si se sabe; si no, el código crudo. Nunca se inventa. */
export function nombre(mapa: Map<string, string>, codigo: string | null | undefined): string {
  if (codigo == null || codigo === "") return "(vacío)";
  return mapa.get(codigo) ?? codigo;
}

/** Los códigos que aparecen en los datos, con su nombre si se sabe (para los desplegables). */
export async function codigosVistos(): Promise<{ paises: string[]; transportes: string[] }> {
  const [p, t] = await Promise.all([
    pool.query<{ c: string }>("select distinct pais_origen c from agg_ncm_pais_mes order by 1"),
    pool.query<{ c: string }>("select distinct transporte c from agg_ncm_pais_mes order by 1"),
  ]);
  return { paises: p.rows.map((r) => r.c), transportes: t.rows.map((r) => r.c) };
}

const n = (v: unknown) => (v == null ? null : Number(v));

// ── Rankings y serie ──────────────────────────────────────

export type FilaImportador = { importador: string; fob: number | null; cantidad: number | null; items: number; ncms: number; pct: number | null; via: string | null };

export async function rankingImportadores(f: Filtro, org: string, orden: string, limite: number): Promise<{ filas: FilaImportador[]; total: number }> {
  const sql = new Sql();
  const b = await base(f, sql, org);
  const col = ({ fob: "fob", cantidad: "cantidad", items: "items", ncms: "ncms", importador: "importador" } as Record<string, string>)[orden] ?? "fob";
  const r = await pool.query(`
    with b as (${b}),
    r as (select importador, sum(fob) fob, sum(cantidad) cantidad, sum(items)::int items, count(distinct ncm)::int ncms
            from b group by importador),
    t as (select importador, transporte, sum(fob) fob from b group by 1, 2)
    select r.*, r.fob / nullif(sum(r.fob) over (), 0) pct, count(*) over ()::int total,
           (select t.transporte from t where t.importador = r.importador order by t.fob desc nulls last limit 1) via
      from r order by ${col} ${col === "importador" ? "asc" : "desc nulls last"} limit ${Number(limite)}`, sql.valores);
  return {
    total: r.rows[0]?.total ?? 0,
    filas: r.rows.map((x) => ({ importador: x.importador, fob: n(x.fob), cantidad: n(x.cantidad), items: x.items, ncms: x.ncms, pct: n(x.pct), via: x.via })),
  };
}

export type FilaNcm = { ncm: string; descripcion: string | null; fob: number | null; cantidad: number | null; items: number; importadores: number; pct: number | null };

export async function rankingNcm(f: Filtro, org: string, orden: string, limite: number): Promise<{ filas: FilaNcm[]; total: number }> {
  const sql = new Sql();
  const b = await base(f, sql, org);
  const col = ({ fob: "fob", cantidad: "cantidad", items: "items", importadores: "importadores", ncm: "ncm" } as Record<string, string>)[orden] ?? "fob";
  const r = await pool.query(`
    with b as (${b}),
    r as (select ncm, sum(fob) fob, sum(cantidad) cantidad, sum(items)::int items, count(distinct importador)::int importadores
            from b group by ncm)
    select r.*, r.fob / nullif(sum(r.fob) over (), 0) pct, count(*) over ()::int total, x.descripcion_completa descripcion
      from r left join ref_ncm_vigente x on x.codigo = r.ncm
     order by ${col} ${col === "ncm" ? "asc" : "desc nulls last"} limit ${Number(limite)}`, sql.valores);
  return {
    total: r.rows[0]?.total ?? 0,
    filas: r.rows.map((x) => ({ ncm: x.ncm, descripcion: x.descripcion, fob: n(x.fob), cantidad: n(x.cantidad), items: x.items, importadores: x.importadores, pct: n(x.pct) })),
  };
}

export type FilaPais = { pais: string; fob: number | null; cantidad: number | null; items: number; importadores: number; pct: number | null };

export async function rankingPaises(f: Filtro, org: string): Promise<FilaPais[]> {
  const sql = new Sql();
  const b = await base(f, sql, org);
  const r = await pool.query(`
    with b as (${b})
    select pais_origen pais, sum(fob) fob, sum(cantidad) cantidad, sum(items)::int items, count(distinct importador)::int importadores,
           sum(fob) / nullif(sum(sum(fob)) over (), 0) pct
      from b group by pais_origen order by fob desc nulls last`, sql.valores);
  return r.rows.map((x) => ({ pais: x.pais, fob: n(x.fob), cantidad: n(x.cantidad), items: x.items, importadores: x.importadores, pct: n(x.pct) }));
}

/** Transportes en columnas: los tres confirmados, el vacío y "otros". */
export const VIAS = [
  { clave: "mar", codigo: "8", texto: "Marítimo" },
  { clave: "aer", codigo: "2", texto: "Aéreo" },
  { clave: "ter", codigo: "4", texto: "Terrestre" },
  { clave: "vac", codigo: "", texto: "Vacío" },
] as const;

export type FilaSerie = { periodo: string; fob: number | null; cantidad: number | null; items: number; importadores: number; porVia: Record<string, number | null> };

export async function serieMensual(f: Filtro, org: string): Promise<FilaSerie[]> {
  const sql = new Sql();
  const b = await base(f, sql, org);
  const r = await pool.query(`
    with b as (${b})
    select periodo, sum(fob) fob, sum(cantidad) cantidad, sum(items)::int items, count(distinct importador)::int importadores,
           ${VIAS.map((v) => `sum(fob) filter (where transporte = '${v.codigo}') ${v.clave}`).join(", ")},
           sum(fob) filter (where transporte not in (${VIAS.map((v) => `'${v.codigo}'`).join(", ")})) otros
      from b group by periodo order by periodo`, sql.valores);
  return r.rows.map((x) => ({
    periodo: x.periodo, fob: n(x.fob), cantidad: n(x.cantidad), items: x.items, importadores: x.importadores,
    porVia: Object.fromEntries([...VIAS.map((v) => [v.clave, n(x[v.clave])]), ["otros", n(x.otros)]]),
  }));
}

// ── Detalle ítem por ítem ─────────────────────────────────

export type FilaItem = {
  periodo: string; destinacion: string; num_item: number; aduana: string; importador: string; ncm: string;
  transporte: string | null; unidad: string | null; cantidad: number | null; fob_item: number | null; fob_unit: number | null;
  pais_origen: string | null; pais_procedencia: string | null;
  enriquecido: boolean; fecha: string | null; importador_completo: string | null; kg_netos: number | null; usd_cif: number | null;
  marcas: string[] | null; codigos_articulo: string[] | null;
  ncm_sim: string | null;
  arancel_min: number | null;   // arancel vigente (fuera del Mercosur), del nomenclador
  arancel_max: number | null;   // distinto del mínimo: las aperturas SIM de esa NCM difieren
  iva_pct: number | null;       // deducido de los despachos (ncm_tasas); si no hay, IVA_POR_DEFECTO
  iva_por_defecto: boolean;     // true = no se pudo deducir: 21 % hasta revisarlo
  estadistica_pct: number | null;
};

export async function items(f: Filtro, org: string, limite: number): Promise<{ filas: FilaItem[]; total: number }> {
  const sql = new Sql();
  const w = await dondeItems(f, sql, "a", org);
  // Arancel: el de la apertura SIM exacta si Softrade la trae; si no, el de
  // las aperturas de esa NCM (mínimo y máximo, casi siempre iguales).
  const r = await pool.query(`
    with it as (
      select a.periodo, a.destinacion, a.num_item, a.aduana, a.importador, a.ncm, a.transporte, a.unidad,
             a.cantidad, a.fob_item, a.fob_item / nullif(a.cantidad, 0) fob_unit, a.pais_origen, a.pais_procedencia,
             a.enriquecido, to_char(a.fecha, 'DD/MM/YYYY') fecha, a.importador_completo, a.kg_netos, a.usd_cif,
             a.marcas, a.codigos_articulo, a.ncm_sim, count(*) over ()::int total
        from v_items_enriquecidos a ${w}
       order by a.fob_item desc nulls last limit ${Number(limite)})
    select it.*, coalesce(sim.alic_3, ar.arancel_min) arancel_min, coalesce(sim.alic_3, ar.arancel_max) arancel_max,
           coalesce(t.iva_pct, ${IVA_POR_DEFECTO}) iva_pct, (t.iva_pct is null) iva_por_defecto, t.estadistica_pct
      from it
      left join ref_ncm_vigente sim on sim.codigo = it.ncm_sim
      left join ncm_arancel ar on ar.ncm = it.ncm
      left join ncm_tasas t on t.ncm = it.ncm
     order by it.fob_item desc nulls last`, sql.valores);
  return {
    total: r.rows[0]?.total ?? 0,
    filas: r.rows.map((x) => ({
      ...x, cantidad: n(x.cantidad), fob_item: n(x.fob_item), fob_unit: n(x.fob_unit), kg_netos: n(x.kg_netos), usd_cif: n(x.usd_cif),
      arancel_min: n(x.arancel_min), arancel_max: n(x.arancel_max), iva_pct: n(x.iva_pct), estadistica_pct: n(x.estadistica_pct),
    })),
  };
}

/** % de ítems del filtro que tienen datos de Softrade (null si no hay nada de Softrade cargado). */
export async function cobertura(f: Filtro, org: string): Promise<{ con: number; total: number } | null> {
  const hay = await pool.query("select 1 from softrade_items limit 1");
  if (!hay.rowCount) return null;
  const sql = new Sql();
  const w = await dondeItems(f, sql, "a", org);
  const r = await pool.query(`
    select count(*)::int total,
           count(*) filter (where exists (select 1 from softrade_items s where s.destinacion = a.destinacion and s.num_item = a.num_item))::int con
      from arca_impo_items a ${w}`, sql.valores);
  return r.rows[0];
}

// ── Lo que paga hoy una NCM ───────────────────────────────

/** IVA cuando no se puede deducir de los despachos (NCM con arancel 0 o sin
 *  despachos). Decisión de Fer (25/09): 21 %, que es lo general; el 10,5 % es
 *  para pocas posiciones (bienes de capital, notebooks, impresoras 3D). Se
 *  muestra marcado "por defecto" para revisarlo. */
export const IVA_POR_DEFECTO = 21;

export type Tasas = {
  vigencia: string | null;
  arancelMin: number | null; arancelMax: number | null;   // nomenclador, fuera del Mercosur
  iva: number | null; ivaPorDefecto: boolean; ivaItems: number; ivaTotal: number;  // deducidos de los despachos
  est: number | null; estItems: number; estTotal: number;
  aperturas: { codigo: string; descripcion: string | null; arancel: number | null }[];
};

export async function tasasDeNcm(ncm: string): Promise<Tasas> {
  const [ar, t, ap] = await Promise.all([
    pool.query("select * from ncm_arancel where ncm = $1", [ncm]).then((r) => r.rows[0]),
    pool.query("select * from ncm_tasas where ncm = $1", [ncm]).then((r) => r.rows[0]),
    pool.query(`select codigo, descripcion, alic_3 arancel, to_char(vigencia, 'DD/MM/YYYY') vigencia
                  from ref_ncm_vigente where tipo = 'sim' and alic_3 is not null and codigo like $1
                 order by codigo limit 200`, [`${ncm}.%`]).then((r) => r.rows),
  ]);
  return {
    vigencia: ap[0]?.vigencia ?? null,
    arancelMin: n(ar?.arancel_min), arancelMax: n(ar?.arancel_max),
    iva: n(t?.iva_pct) ?? IVA_POR_DEFECTO, ivaPorDefecto: t?.iva_pct == null, ivaItems: t?.iva_items ?? 0, ivaTotal: t?.iva_total ?? 0,
    est: n(t?.estadistica_pct), estItems: t?.estadistica_items ?? 0, estTotal: t?.estadistica_total ?? 0,
    aperturas: ap.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, arancel: n(x.arancel) })),
  };
}

/** Lo que Softrade agrega para un filtro: CIF y kg. */
export async function resumenSoftrade(f: Filtro, org: string): Promise<{
  items: number; conSoftrade: number; fob: number | null; cif: number | null; kgNetos: number | null; fobSoftrade: number | null;
}> {
  const sql = new Sql();
  const w = await dondeItems(f, sql, "a", org);
  const r = await pool.query(`
    select count(*)::int items, count(s.destinacion)::int con_softrade, sum(a.fob_item) fob,
           sum(s.usd_cif) cif, sum(s.kg_netos) kg_netos, sum(s.usd_fob) filter (where s.usd_cif is not null) fob_softrade
      from arca_impo_items a
      left join softrade_items s on s.destinacion = a.destinacion and s.num_item = a.num_item
      ${w}`, sql.valores);
  const x = r.rows[0];
  return {
    items: x.items, conSoftrade: x.con_softrade, fob: n(x.fob), cif: n(x.cif), kgNetos: n(x.kg_netos),
    fobSoftrade: n(x.fob_softrade),
  };
}

// ── Marcas vistas (Softrade) ──────────────────────────────

export type FilaMarca = { marca: string; subitems: number; items: number; fob_divisa: number | null; monedas: string | null };

export async function marcasVistas(f: Filtro, org: string, limite = 50): Promise<FilaMarca[]> {
  const sql = new Sql();
  const w = await dondeItems(f, sql, "a", org);
  const r = await pool.query(`
    select x.marca, count(*)::int subitems, count(distinct (x.destinacion, x.num_item))::int items,
           sum(x.fob_divisa) fob_divisa, string_agg(distinct x.moneda, ', ') monedas
      from softrade_subitems x
      join arca_impo_items a on a.destinacion = x.destinacion and a.num_item = x.num_item
      ${w}${w ? " and" : " where"} x.marca is not null
     group by x.marca order by subitems desc limit ${Number(limite)}`, sql.valores);
  return r.rows.map((x) => ({ ...x, fob_divisa: n(x.fob_divisa) }));
}
