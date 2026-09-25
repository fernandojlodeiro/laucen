#!/usr/bin/env node
// Carga a Supabase lo que dejan los scripts de Python (y los Excel de
// Softrade). Se corre desde la PC donde están los archivos, con la
// contraseña de la base en .env.local (DATABASE_URL, igual que en Vercel).
//
//   node scripts/arca/cargar.mjs esquema
//   node scripts/arca/cargar.mjs arca     C:\Laucen\arca\out [202608 ...] [--forzar] [--con-impuestos]
//   node scripts/arca/cargar.mjs arancel  C:\Laucen\arca\out
//   node scripts/arca/cargar.mjs softrade C:\Laucen\softrade
//   node scripts/arca/cargar.mjs resumen  [202608 ...]
//   node scripts/arca/cargar.mjs verificar
//
// Cada carga va en una transacción: si falla, no queda nada a medias.
// Detalle en docs/orden-arca-importaciones.md y scripts/arca/LEEME.md.

import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { leerSoftrade } from "./softrade.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");

// ── Conexión ────────────────────────────────────────────────

function cargarEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(RAIZ, f);
    if (existsSync(p)) try { process.loadEnvFile(p); } catch { /* formato raro: se sigue */ }
  }
}

// Igual que lib/database-url.ts, pero contra el puerto 5432 (modo sesión del
// pooler): COPY y las transacciones largas andan mejor ahí que en el 6543.
function urlDeLaBase() {
  const cruda = process.env.DATABASE_URL?.trim();
  if (!cruda) throw new Error("Falta DATABASE_URL (en .env.local): la contraseña de la base o la dirección completa.");
  const m = cruda.match(/postgres(?:ql)?:\/\/[^\s"'`]+/);
  if (m) return m[0].replace("pooler.supabase.com:6543", "pooler.supabase.com:5432");
  const pass = cruda.replace(/^["'`]|["'`]$/g, "");
  return `postgresql://postgres.pcltuzztybiovhuaheek:${encodeURIComponent(pass)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
}

async function conectar() {
  cargarEnv();
  const url = urlDeLaBase();
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes("host=/");
  const c = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  await c.connect();
  await c.query("set statement_timeout = 0");
  return c;
}

async function enTransaccion(c, fn) {
  await c.query("begin");
  try {
    const r = await fn();
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  }
}

async function copiarCsv(c, sql, archivo) {
  const destino = c.query(copyFrom(sql));
  const origen = createReadStream(archivo);
  if (archivo.endsWith(".gz")) await pipeline(origen, createGunzip(), destino);
  else await pipeline(origen, destino);
  return destino.rowCount;
}

async function esquema(c) {
  await c.query(readFileSync(path.join(RAIZ, "db", "arca.sql"), "utf8"));
}

// ── ARCA ────────────────────────────────────────────────────

const COLS_ITEM = "periodo, aduana, destinacion, num_item, importador, transporte, unidad, cantidad, fob_item, fob_total, divisa, pais_origen, pais_procedencia, ncm";
// Texto vacío queda como '' (no null): el transporte vacío es un grupo propio.
const TEXTO_ITEM = "aduana, destinacion, importador, transporte, unidad, divisa, pais_origen, pais_procedencia, ncm";

async function recalcularResumen(c, periodo) {
  for (const t of ["agg_ncm_pais_mes", "agg_ncm_importador_mes", "agg_importador_mes"]) {
    await c.query(`delete from ${t} where periodo = $1`, [periodo]);
  }
  await c.query(`
    insert into agg_ncm_pais_mes (ncm, pais_origen, transporte, periodo, items, fob, cantidad, importadores_distintos)
    select ncm, coalesce(pais_origen, ''), coalesce(transporte, ''), periodo,
           count(*), sum(fob_item), sum(cantidad), count(distinct importador)
      from arca_impo_items where periodo = $1
     group by 1, 2, 3, 4`, [periodo]);
  await c.query(`
    insert into agg_ncm_importador_mes (ncm, importador, pais_origen, transporte, periodo, items, fob, cantidad)
    select ncm, importador, coalesce(pais_origen, ''), coalesce(transporte, ''), periodo,
           count(*), sum(fob_item), sum(cantidad)
      from arca_impo_items where periodo = $1
     group by 1, 2, 3, 4, 5`, [periodo]);
  await c.query(`
    insert into agg_importador_mes (importador, periodo, items, fob, ncm_distintas)
    select importador, periodo, count(*), sum(fob_item), count(distinct ncm)
      from arca_impo_items where periodo = $1
     group by 1, 2`, [periodo]);
}

async function cargarMes(c, carpeta, periodo, { conImpuestos }) {
  const items = path.join(carpeta, `impo_items_${periodo}.csv.gz`);
  const impuestos = path.join(carpeta, `impo_impuestos_${periodo}.csv.gz`);
  const resumenJson = path.join(carpeta, `impo_resumen_${periodo}.json`);
  const resumen = existsSync(resumenJson) ? JSON.parse(readFileSync(resumenJson, "utf8")) : {};
  const t0 = Date.now();

  return enTransaccion(c, async () => {
    await c.query("select pg_advisory_xact_lock(7212002)");
    await c.query("create temp table t_items (like arca_impo_items) on commit drop");
    const leidos = await copiarCsv(c,
      `copy t_items (${COLS_ITEM}) from stdin with (format csv, header true, force_not_null (${TEXTO_ITEM}))`, items);

    // Recarga limpia del mes: lo viejo de ese período se va, entra lo nuevo.
    await c.query(`delete from arca_impo_impuestos i using arca_impo_items a
                    where a.periodo = $1 and i.destinacion = a.destinacion and i.num_item = a.num_item`, [periodo]);
    await c.query("delete from arca_impo_items where periodo = $1", [periodo]);
    const ins = await c.query(`
      insert into arca_impo_items (${COLS_ITEM}) select ${COLS_ITEM} from t_items
      on conflict (destinacion, num_item) do update set
        ${COLS_ITEM.split(", ").filter((x) => x !== "destinacion" && x !== "num_item").map((x) => `${x} = excluded.${x}`).join(", ")}`);

    let filasImpuestos = null;
    if (conImpuestos) {
      await c.query("create temp table t_imp (periodo char(6), destinacion text, num_item int, concepto text, monto numeric) on commit drop");
      await copiarCsv(c, "copy t_imp from stdin with (format csv, header true)", impuestos);
      const r = await c.query(`
        insert into arca_impo_impuestos (destinacion, num_item, concepto, monto)
        select destinacion, num_item, concepto, sum(monto) from t_imp group by 1, 2, 3
        on conflict (destinacion, num_item, concepto) do update set monto = excluded.monto`);
      filasImpuestos = r.rowCount;
    }

    await recalcularResumen(c, periodo);
    await c.query(`
      insert into arca_cargas (periodo, cargado_en, filas_crudas, items, filas_impuestos)
      values ($1, now(), $2, $3, $4)
      on conflict (periodo) do update set cargado_en = now(), filas_crudas = excluded.filas_crudas,
        items = excluded.items, filas_impuestos = excluded.filas_impuestos`,
      [periodo, resumen.filas_crudas ?? null, ins.rowCount, filasImpuestos]);
    console.log(`${periodo}: items=${ins.rowCount} (csv ${leidos})` +
      (conImpuestos ? ` impuestos=${filasImpuestos}` : " impuestos=no cargados") +
      ` (${Math.round((Date.now() - t0) / 1000)} s)`);
  });
}

async function arca(c, args) {
  const carpeta = args.find((a) => !a.startsWith("--") && !/^\d{6}$/.test(a));
  if (!carpeta) throw new Error("Falta la carpeta con los impo_items_AAAAMM.csv.gz");
  const forzar = args.includes("--forzar");
  const conImpuestos = args.includes("--con-impuestos");
  let periodos = args.filter((a) => /^\d{6}$/.test(a));
  if (!periodos.length) {
    periodos = readdirSync(carpeta).map((f) => f.match(/^impo_items_(\d{6})\.csv\.gz$/)?.[1]).filter(Boolean).sort();
  }
  const ya = new Set((await c.query("select periodo from arca_cargas")).rows.map((r) => r.periodo));
  for (const p of periodos) {
    if (ya.has(p) && !forzar) { console.log(`${p}: ya estaba cargado (--forzar para recargar)`); continue; }
    await cargarMes(c, carpeta, p, { conImpuestos });
  }
}

// ── Nomenclador ─────────────────────────────────────────────

async function arancel(c, [carpeta]) {
  if (!carpeta) throw new Error("Falta la carpeta con ref_ncm.csv y ref_sufijo.csv");
  await enTransaccion(c, async () => {
    const cols = "codigo, tipo, nivel, padre, descripcion, descripcion_completa, unidad, alic_1, alic_2, alic_3, alic_4, alic_5";
    await c.query("create temp table t_ncm (like ref_ncm) on commit drop");
    await copiarCsv(c, `copy t_ncm (${cols}) from stdin with (format csv, header true)`, path.join(carpeta, "ref_ncm.csv"));
    // Se pisan sólo las columnas que vienen del arancel: uso_economico y
    // rubro_ml (futuras, cargadas a mano o por otro proceso) se conservan.
    const n = await c.query(`
      insert into ref_ncm (${cols}) select ${cols} from t_ncm
      on conflict (codigo) do update set
        ${cols.split(", ").slice(1).map((x) => `${x} = excluded.${x}`).join(", ")}`);
    await c.query("create temp table t_suf (like ref_sufijo) on commit drop");
    await copiarCsv(c, "copy t_suf (posicion, codigo, norma, descripcion) from stdin with (format csv, header true)",
      path.join(carpeta, "ref_sufijo.csv"));
    const s = await c.query(`
      insert into ref_sufijo select * from t_suf
      on conflict (posicion, codigo) do update set norma = excluded.norma, descripcion = excluded.descripcion`);
    console.log(`arancel: ref_ncm=${n.rowCount} ref_sufijo=${s.rowCount}`);
  });
}

// ── Softrade ────────────────────────────────────────────────

const COLS_SOFT_ITEM = ["destinacion", "num_item", "fecha", "tipo_dato", "ncm_sim", "importador", "localidad",
  "destinacion_tipo", "aduana", "via", "pais_origen", "pais_procedencia", "usd_unitario", "usd_fob", "flete_usd",
  "seguro_usd", "usd_cif", "cant_estad", "un_estad", "cantidad", "unidad", "kg_netos", "kg_brutos", "derecho_usd",
  "derecho_pct", "acuerdo_aladi", "cargado_de"];
const COLS_SOFT_SUB = ["destinacion", "num_item", "num_subitem", "marca_texto", "cantidad", "unitario_divisa",
  "fob_divisa", "moneda", "incoterm", "sufijos_raw", "marca", "codigo_articulo", "atributos",
  "descripcion_arancelaria", "modelo"];

async function upsertJson(c, tabla, cols, clave, filas) {
  if (!filas.length) return 0;
  const lista = cols.join(", ");
  const r = await c.query(`
    insert into ${tabla} (${lista})
    select ${lista} from jsonb_populate_recordset(null::${tabla}, $1::jsonb)
    on conflict (${clave.join(", ")}) do update set
      ${cols.filter((x) => !clave.includes(x)).map((x) => `${x} = excluded.${x}`).join(", ")}`,
  [JSON.stringify(filas)]);
  return r.rowCount;
}

async function cargarSoftrade(c, archivo) {
  const nombre = path.basename(archivo);
  const d = await leerSoftrade(archivo);
  for (const i of d.items) i.cargado_de = nombre;
  return enTransaccion(c, async () => {
    const items = await upsertJson(c, "softrade_items", COLS_SOFT_ITEM, ["destinacion", "num_item"], d.items);
    const subitems = await upsertJson(c, "softrade_subitems", COLS_SOFT_SUB, ["destinacion", "num_item", "num_subitem"], d.subitems);
    await c.query(`
      insert into softrade_cargas (archivo, cargado_en, parametros, filas, items, subitems)
      values ($1, now(), $2, $3, $4, $5)
      on conflict (archivo) do update set cargado_en = now(), parametros = excluded.parametros,
        filas = excluded.filas, items = excluded.items, subitems = excluded.subitems`,
    [nombre, d.parametros, d.filas, items, subitems]);
    return { filas: d.filas, items, subitems, importadores: new Set(d.items.map((i) => i.importador)).size };
  });
}

async function softrade(c, [base = "C:\\Laucen\\softrade"]) {
  const dir = (x) => { const p = path.join(base, x); mkdirSync(p, { recursive: true }); return p; };
  const entrada = dir("in"), hechos = dir("done"), errores = dir("error");
  const ya = new Set((await c.query("select archivo from softrade_cargas")).rows.map((r) => r.archivo));
  const archivos = readdirSync(entrada).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$")).sort();
  if (!archivos.length) console.log(`softrade: no hay Excel nuevos en ${entrada}`);
  for (const f of archivos) {
    const origen = path.join(entrada, f);
    if (ya.has(f)) {
      console.log(`${f}: ya estaba cargado, se mueve a done`);
      renameSync(origen, path.join(hechos, f));
      continue;
    }
    try {
      const r = await cargarSoftrade(c, origen);
      renameSync(origen, path.join(hechos, f));
      console.log(`${f}: filas=${r.filas} items=${r.items} subitems=${r.subitems} importadores=${r.importadores}`);
    } catch (e) {
      renameSync(origen, path.join(errores, f));
      writeFileSync(path.join(errores, `${f}.log`), `${new Date().toISOString()}\n${e?.stack ?? e}\n`);
      console.log(`${f}: FALLÓ, movido a error\\ (ver ${f}.log): ${e?.message ?? e}`);
    }
  }
}

// ── Verificación (docs, sección 8, pasos 4 y 6) ─────────────

async function verificar(c) {
  const uno = async (sql, p = []) => (await c.query(sql, p)).rows[0];
  const chequeo = (texto, real, esperado) =>
    console.log(`${String(real) === String(esperado) ? "OK   " : "MAL  "} ${texto}: ${real} (esperado ${esperado})`);

  const a = await uno(`select count(*) items, count(distinct destinacion) despachos, count(distinct importador) importadores
                         from arca_impo_items where periodo = '202608'`);
  chequeo("202608 ítems", a.items, 530186);
  chequeo("202608 despachos", a.despachos, 64863);
  chequeo("202608 importadores", a.importadores, 12089);
  const b = await uno(`select count(*) items, count(distinct importador) importadores from arca_impo_items
                        where periodo = '202608' and ncm = '8516.29.00' and pais_origen = '310'`);
  chequeo("8516.29.00 China ítems", b.items, 10);
  chequeo("8516.29.00 China importadores", b.importadores, 7);
  const d = await uno(`select importador, cantidad::float8 cantidad, fob_item::float8 fob from arca_impo_items
                        where destinacion = '26001IC04154138R' and num_item = 1`);
  console.log(`     26001IC04154138R/1: ${d ? `${d.importador} · ${d.cantidad} u · FOB ${d.fob}` : "no está"} (esperado Importadora MCA · 230 · 8178.75)`);
  const r = await uno(`select coalesce(sum(items), 0) items from agg_ncm_pais_mes where periodo = '202608'`);
  chequeo("resumen agg_ncm_pais_mes = ítems", r.items, a.items);

  const s = await uno(`select count(*) items, count(distinct importador) importadores from softrade_items
                        where cargado_de = 'detalle_ARimportDetalladas_2026-8-5-131045.xlsx'`);
  const sf = await uno(`select filas from softrade_cargas where archivo = 'detalle_ARimportDetalladas_2026-8-5-131045.xlsx'`);
  chequeo("Softrade filas", sf?.filas ?? 0, 158);
  chequeo("Softrade ítems", s.items, 93);
  chequeo("Softrade importadores", s.importadores, 31);
  const i54 = (await c.query(`select marca, codigo_articulo from softrade_subitems
                               where destinacion = '26001IC03000924J' and num_item = 54 order by num_subitem`)).rows;
  console.log(`     26001IC03000924J/54: ${i54.map((x) => `${x.marca} ${x.codigo_articulo}`).join(" | ") || "no está"}` +
    " (esperado 2 subítems INTELBRAS: 4770537 MRM 537 | 4770029 COC 4038P)");
  const i11 = await uno(`select count(*) n, string_agg(distinct marca, ',') marcas from softrade_subitems
                          where destinacion = '26008IC03000411H' and num_item = 11`);
  chequeo("26008IC03000411H/11 subítems", i11.n, 15);
  chequeo("26008IC03000411H/11 marca", i11.marcas, "SACCARO");
  const cruce = await uno(`select count(*) filter (where a.destinacion is null) faltan,
                                  count(*) filter (where a.ncm is distinct from '9403.20.90' and a.destinacion is not null) otra_ncm
                             from softrade_items s left join arca_impo_items a using (destinacion, num_item)
                            where s.cargado_de = 'detalle_ARimportDetalladas_2026-8-5-131045.xlsx'`);
  chequeo("Softrade sin par en ARCA", cruce.faltan, 0);
  chequeo("Softrade con otra NCM en ARCA", cruce.otra_ncm, 0);
}

// ── Principal ───────────────────────────────────────────────

const [comando, ...args] = process.argv.slice(2);
const COMANDOS = {
  esquema: async () => {},
  arca,
  arancel,
  softrade,
  resumen: async (c, periodos) => {
    const lista = periodos.length ? periodos : (await c.query("select periodo from arca_cargas order by 1")).rows.map((r) => r.periodo);
    for (const p of lista) { await enTransaccion(c, () => recalcularResumen(c, p)); console.log(`${p}: resumen recalculado`); }
  },
  verificar,
};

if (!COMANDOS[comando]) {
  console.log("Comandos: esquema | arca <carpeta> [AAAAMM ...] [--forzar] [--con-impuestos] | arancel <carpeta> | softrade [carpeta] | resumen [AAAAMM ...] | verificar");
  process.exit(1);
}
const c = await conectar();
try {
  await esquema(c); // idempotente: las tablas siempre existen antes de cargar
  await COMANDOS[comando](c, args);
} catch (e) {
  console.error(`Error: ${e?.message ?? e}`);
  process.exitCode = 1;
} finally {
  await c.end();
}
