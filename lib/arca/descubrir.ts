// Consultas de descubrimiento (docs, sección 7.1): las que sólo se pueden
// contestar con todo el universo cargado. Salen del resumen
// agg_ncm_importador_mes (y agg_importador_mes para "nuevos").

import { pool } from "@/db";
import { condNcm, ncmDelRubro, Sql, sumarMeses } from "./filtro";
import { VIAS } from "./consultas";

const n = (v: unknown) => (v == null ? null : Number(v));

/** Prefijo/rubro → condición sobre m.ncm (o nada). */
async function condRubro(sql: Sql, prefijo: string | undefined, rubro: number | undefined, org: string): Promise<string[]> {
  const w: string[] = [];
  if (prefijo) w.push(condNcm("m.ncm", prefijo.split(/[\s,;]+/).filter(Boolean), sql));
  if (rubro !== undefined) w.push(condNcm("m.ncm", await ncmDelRubro(rubro, org), sql));
  return w;
}

// 1. NCM que crecen ────────────────────────────────────────

export type ParamsCrecen = { hasta: string; meses: number; pais?: string; transporte?: string; prefijo?: string; rubro?: number; fobMin?: number; impMin?: number; orden: string };
export type FilaCrece = { ncm: string; descripcion: string | null; fob_act: number | null; fob_ant: number | null; dif_fob: number | null; var_fob: number | null; cant_act: number | null; cant_ant: number | null; var_cant: number | null; imp_act: number; imp_ant: number };

export async function ncmQueCrecen(p: ParamsCrecen, org: string): Promise<FilaCrece[]> {
  const sql = new Sql();
  const desdeAct = sumarMeses(p.hasta, -(p.meses - 1));
  const desdeAnt = sumarMeses(desdeAct, -p.meses);
  const act = `m.periodo >= ${sql.p(desdeAct)}`;
  const w = [`m.periodo between ${sql.p(desdeAnt)} and ${sql.p(p.hasta)}`, ...await condRubro(sql, p.prefijo, p.rubro, org)];
  if (p.pais) w.push(`m.pais_origen = ${sql.p(p.pais)}`);
  if (p.transporte) w.push(`m.transporte = ${sql.p(p.transporte === "-" ? "" : p.transporte)}`);
  const having: string[] = [];
  if (p.fobMin !== undefined) having.push(`coalesce(sum(m.fob) filter (where ${act}), 0) >= ${sql.p(p.fobMin)}`);
  if (p.impMin !== undefined) having.push(`count(distinct m.importador) filter (where ${act}) >= ${sql.p(p.impMin)}`);
  const col = ({ dif_fob: "dif_fob", var_fob: "var_fob", var_cant: "var_cant", fob_act: "fob_act", imp_act: "imp_act" } as Record<string, string>)[p.orden] ?? "dif_fob";
  const r = await pool.query(`
    with r as (
      select m.ncm,
             sum(m.fob) filter (where ${act}) fob_act, sum(m.fob) filter (where not ${act}) fob_ant,
             sum(m.cantidad) filter (where ${act}) cant_act, sum(m.cantidad) filter (where not ${act}) cant_ant,
             count(distinct m.importador) filter (where ${act})::int imp_act,
             count(distinct m.importador) filter (where not ${act})::int imp_ant
        from agg_ncm_importador_mes m
       where ${w.join(" and ")}
       group by m.ncm ${having.length ? `having ${having.join(" and ")}` : ""})
    select r.*, coalesce(fob_act, 0) - coalesce(fob_ant, 0) dif_fob,
           fob_act / nullif(fob_ant, 0) - 1 var_fob, cant_act / nullif(cant_ant, 0) - 1 var_cant,
           x.descripcion_completa descripcion
      from r left join ref_ncm_vigente x on x.codigo = r.ncm
     order by ${col} desc nulls last limit 200`, sql.valores);
  return r.rows.map((x) => ({
    ncm: x.ncm, descripcion: x.descripcion, fob_act: n(x.fob_act), fob_ant: n(x.fob_ant), dif_fob: n(x.dif_fob),
    var_fob: n(x.var_fob), cant_act: n(x.cant_act), cant_ant: n(x.cant_ant), var_cant: n(x.var_cant), imp_act: x.imp_act, imp_ant: x.imp_ant,
  }));
}

// 2. Importadores nuevos ───────────────────────────────────

export type ParamsNuevos = { desde: string; hasta: string; mesesAntes: number; pais?: string; prefijo?: string; rubro?: number };
export type FilaNuevo = { importador: string; primer_periodo: string; fob: number | null; items: number; ncms: string | null };

export async function importadoresNuevos(p: ParamsNuevos, org: string): Promise<FilaNuevo[]> {
  const sql = new Sql();
  const w = [`m.periodo between ${sql.p(p.desde)} and ${sql.p(p.hasta)}`, ...await condRubro(sql, p.prefijo, p.rubro, org)];
  if (p.pais) w.push(`m.pais_origen = ${sql.p(p.pais)}`);
  const antesDesde = sumarMeses(p.desde, -p.mesesAntes);
  const r = await pool.query(`
    with b as (select * from agg_ncm_importador_mes m where ${w.join(" and ")}),
    nuevos as (
      select importador from b group by importador
      except
      select importador from agg_importador_mes where periodo >= ${sql.p(antesDesde)} and periodo < ${sql.p(p.desde)}),
    porNcm as (select b.importador, b.ncm, sum(b.fob) fob from b join nuevos using (importador) group by 1, 2)
    select b.importador, min(b.periodo) primer_periodo, sum(b.fob) fob, sum(b.items)::int items,
           (select string_agg(q.ncm, ' · ' order by q.fob desc nulls last)
              from (select * from porNcm x where x.importador = b.importador order by x.fob desc nulls last limit 5) q) ncms
      from b join nuevos using (importador)
     group by b.importador order by fob desc nulls last limit 300`, sql.valores);
  return r.rows.map((x) => ({ ...x, fob: n(x.fob) }));
}

// 3. Pocos importadores, mucho FOB ─────────────────────────

export type ParamsNicho = { desde: string; hasta: string; fobMin: number; impMax: number; pais?: string; prefijo?: string; rubro?: number };
export type FilaNicho = { ncm: string; descripcion: string | null; fob: number | null; items: number; importadores: number; principal: string | null; pct_principal: number | null };

export async function nichos(p: ParamsNicho, org: string): Promise<FilaNicho[]> {
  const sql = new Sql();
  const w = [`m.periodo between ${sql.p(p.desde)} and ${sql.p(p.hasta)}`, ...await condRubro(sql, p.prefijo, p.rubro, org)];
  if (p.pais) w.push(`m.pais_origen = ${sql.p(p.pais)}`);
  const r = await pool.query(`
    with b as (select * from agg_ncm_importador_mes m where ${w.join(" and ")}),
    r as (select ncm, sum(fob) fob, sum(items)::int items, count(distinct importador)::int importadores
            from b group by ncm
          having sum(fob) >= ${sql.p(p.fobMin)} and count(distinct importador) <= ${sql.p(p.impMax)}),
    imp as (select ncm, importador, sum(fob) fob from b where ncm in (select ncm from r) group by 1, 2)
    select r.*, x.descripcion_completa descripcion, top.importador principal, top.fob / nullif(r.fob, 0) pct_principal
      from r
      left join ref_ncm_vigente x on x.codigo = r.ncm
      left join lateral (select importador, fob from imp where imp.ncm = r.ncm order by fob desc nulls last limit 1) top on true
     order by r.fob desc nulls last limit 300`, sql.valores);
  return r.rows.map((x) => ({ ...x, fob: n(x.fob), pct_principal: n(x.pct_principal) }));
}

// 4. Densidad marítimo / aéreo por NCM ─────────────────────

export type ParamsVias = { desde: string; hasta: string; pais?: string; prefijo?: string; rubro?: number; fobMin?: number; orden: string };
export type FilaVias = { ncm: string; descripcion: string | null; fob: number | null; items: number; porVia: Record<string, { pctItems: number | null; pctFob: number | null; unit: number | null }> };

export async function densidadVias(p: ParamsVias, org: string): Promise<FilaVias[]> {
  const sql = new Sql();
  const w = [`m.periodo between ${sql.p(p.desde)} and ${sql.p(p.hasta)}`, ...await condRubro(sql, p.prefijo, p.rubro, org)];
  if (p.pais) w.push(`m.pais_origen = ${sql.p(p.pais)}`);
  const todas = [...VIAS.map((v) => ({ clave: v.clave, cond: `m.transporte = '${v.codigo}'` })),
    { clave: "otros", cond: `m.transporte not in (${VIAS.map((v) => `'${v.codigo}'`).join(", ")})` }];
  const col = ["mar", "aer", "ter", "vac"].includes(p.orden) ? `${p.orden}_fob / nullif(fob, 0)` : "fob";
  const r = await pool.query(`
    select * from (
      select m.ncm, sum(m.fob) fob, sum(m.items)::int items,
             ${todas.map((v) => `sum(m.items) filter (where ${v.cond}) ${v.clave}_items,
                                 sum(m.fob) filter (where ${v.cond}) ${v.clave}_fob,
                                 sum(m.cantidad) filter (where ${v.cond}) ${v.clave}_cant`).join(",\n")}
        from agg_ncm_importador_mes m where ${w.join(" and ")}
       group by m.ncm
       ${p.fobMin !== undefined ? `having sum(m.fob) >= ${sql.p(p.fobMin)}` : ""}) r
      left join lateral (select descripcion_completa descripcion from ref_ncm_vigente x where x.codigo = r.ncm) x on true
     order by ${col} desc nulls last limit 300`, sql.valores);
  return r.rows.map((x) => ({
    ncm: x.ncm, descripcion: x.descripcion, fob: n(x.fob), items: x.items,
    porVia: Object.fromEntries(todas.map((v) => [v.clave, {
      pctItems: x.items ? (n(x[`${v.clave}_items`]) ?? 0) / x.items : null,
      pctFob: n(x.fob) ? (n(x[`${v.clave}_fob`]) ?? 0) / n(x.fob)! : null,
      unit: n(x[`${v.clave}_cant`]) ? n(x[`${v.clave}_fob`])! / n(x[`${v.clave}_cant`])! : null,
    }])),
  }));
}
