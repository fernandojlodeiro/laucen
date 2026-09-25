// El filtro del panel de Importaciones: se lee de la dirección (así un
// filtro se puede guardar como link o exportar tal cual) y se traduce a SQL.
//
// Dos fuentes posibles para la misma consulta:
// - el resumen agg_ncm_importador_mes (rápido), si el filtro usa sólo
//   período, NCM/rubro, país de origen, transporte e importador;
// - la tabla grande arca_impo_items, si usa algo más fino (procedencia,
//   aduana, FOB unitario, cantidad, marca o código de artículo de Softrade).
// Las dos devuelven las mismas columnas (ver `base`), así cada consulta se
// escribe una sola vez.

import { pool } from "@/db";

export type Filtro = {
  desde?: string;           // AAAAMM
  hasta?: string;           // AAAAMM
  ncm: string[];            // tal como los escribió: '8516.29.00', '85', '9403.2'
  rubro?: number;
  paisOrigen?: string;
  paisProc?: string;
  transporte?: string;      // código; '-' = vacío
  importador?: string;      // búsqueda por texto
  importadorExacto?: string;
  aduana?: string;
  fobUnitMin?: number;
  fobUnitMax?: number;
  cantMin?: number;
  cantMax?: number;
  marca?: string;
  codigo?: string;
};

export type Params = Record<string, string | string[] | undefined>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const num = (v: string | string[] | undefined) => {
  const t = uno(v)?.replace(",", ".");
  const n = t ? Number(t) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const periodo = (v: string | string[] | undefined) => {
  const t = uno(v)?.replace(/\D/g, "");
  return t && /^\d{6}$/.test(t) ? t : undefined;
};

export function leerFiltro(sp: Params): Filtro {
  return {
    desde: periodo(sp.desde),
    hasta: periodo(sp.hasta),
    ncm: (uno(sp.ncm) ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /\d/.test(x)),
    rubro: num(sp.rubro),
    paisOrigen: uno(sp.po),
    paisProc: uno(sp.pp),
    transporte: uno(sp.tr),
    importador: uno(sp.imp),
    importadorExacto: uno(sp.impx),
    aduana: uno(sp.adu),
    fobUnitMin: num(sp.fumin),
    fobUnitMax: num(sp.fumax),
    cantMin: num(sp.cmin),
    cantMax: num(sp.cmax),
    marca: uno(sp.marca),
    codigo: uno(sp.cod),
  };
}

/** El filtro de vuelta a parámetros de la dirección (para links y CSV). */
export function aParams(f: Filtro, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams();
  const poner = (k: string, v: string | number | undefined) => { if (v !== undefined && v !== "") p.set(k, String(v)); };
  poner("desde", f.desde); poner("hasta", f.hasta); poner("ncm", f.ncm.join(" ")); poner("rubro", f.rubro);
  poner("po", f.paisOrigen); poner("pp", f.paisProc); poner("tr", f.transporte); poner("imp", f.importador);
  poner("impx", f.importadorExacto); poner("adu", f.aduana); poner("fumin", f.fobUnitMin); poner("fumax", f.fobUnitMax);
  poner("cmin", f.cantMin); poner("cmax", f.cantMax); poner("marca", f.marca); poner("cod", f.codigo);
  for (const [k, v] of Object.entries(extra)) poner(k, v);
  return p.toString();
}

/** ¿Se puede contestar desde el resumen? */
export function usaResumen(f: Filtro): boolean {
  return !f.paisProc && !f.aduana && f.fobUnitMin === undefined && f.fobUnitMax === undefined
    && f.cantMin === undefined && f.cantMax === undefined && !f.marca && !f.codigo;
}

/** Arma los parámetros $1, $2… de una consulta. */
export class Sql {
  valores: unknown[] = [];
  p(v: unknown): string {
    this.valores.push(v);
    return `$${this.valores.length}`;
  }
}

/** '8516' -> '8516', '851629' -> '8516.29', '85162900' -> '8516.29.00' (lo que se guarda en ncm). */
export function conPuntos(digitos: string): string {
  const d = digitos.slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}

/** Condición sobre una columna ncm para una lista de códigos de cualquier
 *  nivel: 8 dígitos = igual; menos = prefijo (usa el índice, orden "C"). */
export function condNcm(col: string, codigos: string[], sql: Sql): string {
  const partes = [...new Set(codigos.map((c) => c.replace(/\D/g, "")).filter(Boolean).map(conPuntos))]
    .map((c) => (c.length >= 10 ? `${col} = ${sql.p(c)}` : `${col} like ${sql.p(`${c}%`)}`));
  return partes.length ? `(${partes.join(" or ")})` : "false";
}

/** Los NCM de un rubro de la organización (vacío si no es suyo). */
export async function ncmDelRubro(rubroId: number, organizacionId: string): Promise<string[]> {
  const r = await pool.query<{ ncm: string }>(
    `select rn.ncm from rubro_ncm rn join rubros r on r.id = rn.rubro_id
      where r.id = $1 and r.organizacion_id = $2`, [rubroId, organizacionId]);
  return r.rows.map((x) => x.ncm);
}

/** Las condiciones comunes a las dos fuentes. `a` es el alias de la tabla. */
async function condiciones(f: Filtro, sql: Sql, a: string, resumen: boolean, organizacionId: string): Promise<string[]> {
  const w: string[] = [];
  const pais = resumen ? `${a}.pais_origen` : `coalesce(${a}.pais_origen, '')`;
  const via = resumen ? `${a}.transporte` : `coalesce(${a}.transporte, '')`;
  if (f.desde) w.push(`${a}.periodo >= ${sql.p(f.desde)}`);
  if (f.hasta) w.push(`${a}.periodo <= ${sql.p(f.hasta)}`);
  if (f.ncm.length) w.push(condNcm(`${a}.ncm`, f.ncm, sql));
  if (f.rubro !== undefined) w.push(condNcm(`${a}.ncm`, await ncmDelRubro(f.rubro, organizacionId), sql));
  if (f.paisOrigen) w.push(`${pais} = ${sql.p(f.paisOrigen)}`);
  if (f.transporte) w.push(`${via} = ${sql.p(f.transporte === "-" ? "" : f.transporte)}`);
  if (f.importador) w.push(`${a}.importador ilike ${sql.p(`%${f.importador}%`)}`);
  if (f.importadorExacto) w.push(`${a}.importador = ${sql.p(f.importadorExacto)}`);
  if (resumen) return w;
  if (f.paisProc) w.push(`${a}.pais_procedencia = ${sql.p(f.paisProc)}`);
  if (f.aduana) w.push(`${a}.aduana = ${sql.p(f.aduana)}`);
  const unit = `${a}.fob_item / nullif(${a}.cantidad, 0)`;
  if (f.fobUnitMin !== undefined) w.push(`${unit} >= ${sql.p(f.fobUnitMin)}`);
  if (f.fobUnitMax !== undefined) w.push(`${unit} <= ${sql.p(f.fobUnitMax)}`);
  if (f.cantMin !== undefined) w.push(`${a}.cantidad >= ${sql.p(f.cantMin)}`);
  if (f.cantMax !== undefined) w.push(`${a}.cantidad <= ${sql.p(f.cantMax)}`);
  if (f.marca || f.codigo) {
    const s: string[] = [];
    if (f.marca) s.push(`x.marca ilike ${sql.p(`%${f.marca}%`)}`);
    if (f.codigo) s.push(`x.codigo_articulo ilike ${sql.p(`%${f.codigo}%`)}`);
    w.push(`exists (select 1 from softrade_subitems x where x.destinacion = ${a}.destinacion
                     and x.num_item = ${a}.num_item and ${s.join(" and ")})`);
  }
  return w;
}

const donde = (w: string[]) => (w.length ? `where ${w.join(" and ")}` : "");

/** Subconsulta con columnas ncm, importador, pais_origen, transporte,
 *  periodo, items, fob, cantidad — del resumen o de la tabla grande. */
export async function base(f: Filtro, sql: Sql, organizacionId: string): Promise<string> {
  if (usaResumen(f)) {
    const w = await condiciones(f, sql, "m", true, organizacionId);
    return `select m.ncm, m.importador, m.pais_origen, m.transporte, m.periodo, m.items, m.fob, m.cantidad
              from agg_ncm_importador_mes m ${donde(w)}`;
  }
  const w = await condiciones(f, sql, "a", false, organizacionId);
  return `select a.ncm, a.importador, coalesce(a.pais_origen, '') as pais_origen, coalesce(a.transporte, '') as transporte,
                 a.periodo, 1 as items, a.fob_item as fob, a.cantidad
            from arca_impo_items a ${donde(w)}`;
}

/** Condiciones sobre la tabla grande (para el detalle ítem por ítem). */
export async function dondeItems(f: Filtro, sql: Sql, a: string, organizacionId: string): Promise<string> {
  return donde(await condiciones(f, sql, a, false, organizacionId));
}

/** ¿El filtro tiene algo puesto (además del período)? */
export function hayFiltro(f: Filtro): boolean {
  return Object.entries(f).some(([k, v]) => k !== "desde" && k !== "hasta" && (Array.isArray(v) ? v.length > 0 : v !== undefined));
}

// ── Períodos ──────────────────────────────────────────────

export function sumarMeses(p: string, n: number): string {
  const total = Number(p.slice(0, 4)) * 12 + Number(p.slice(4)) - 1 + n;
  return `${Math.floor(total / 12)}${String((total % 12) + 1).padStart(2, "0")}`;
}

export const periodoLindo = (p: string) => `${p.slice(4)}/${p.slice(0, 4)}`;

export async function periodosCargados(): Promise<string[]> {
  const r = await pool.query<{ periodo: string }>("select periodo from arca_cargas order by periodo");
  return r.rows.map((x) => x.periodo);
}
