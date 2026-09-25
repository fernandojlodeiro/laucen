#!/usr/bin/env node
// Carga a Supabase lo que dejan los scripts de Python (y los Excel de
// Softrade). Se corre desde la PC donde están los archivos, con la
// contraseña de la base en .env.local (DATABASE_URL, igual que en Vercel).
//
//   node scripts/arca/cargar.mjs esquema
//   node scripts/arca/cargar.mjs arca     C:\Laucen\arca\out [202608 ...] [--forzar]
//   node scripts/arca/cargar.mjs tasas    C:\Laucen\arca\out (recalcula IVA y estadística por NCM)
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
import { Readable, Transform } from "node:stream";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { leerSoftrade } from "./softrade.mjs";
import { CONCEPTO_DERECHOS, CONCEPTO_ESTADISTICA, CONCEPTO_IVA } from "./parametros.mjs";

// Anda de dos maneras: dentro del repo (scripts/arca/) o suelto en una
// carpeta de la PC de Fer (C:\Laucen\carga\, con arca.sql y .env.local al lado).
const AQUI = import.meta.dirname;
const RAIZ = path.resolve(AQUI, "..", "..");
const primero = (...rutas) => rutas.find((r) => existsSync(r));

// ── Conexión ────────────────────────────────────────────────

function cargarEnv() {
  for (const p of [AQUI, RAIZ].flatMap((d) => [path.join(d, ".env.local"), path.join(d, ".env")])) {
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
  const sql = primero(path.join(AQUI, "arca.sql"), path.join(RAIZ, "db", "arca.sql"));
  if (!sql) throw new Error("No encuentro arca.sql (tiene que estar al lado de cargar.mjs, o en db/ del repo)");
  await c.query(readFileSync(sql, "utf8"));
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

// IVA y estadística por NCM. El CSV de impuestos se lee en la PC, en
// streaming; por ítem se juntan derechos, estadística e IVA y a la base sube
// una fila por ítem (no las 7,8 millones). Ningún monto queda guardado: sólo
// cuántos ítems pagaron cada tasa, por NCM y mes (agg_tasas_mes).
async function calcularTasas(c, periodo, archivoImpuestos) {
  let filasCrudas = 0, conceptos = 0;
  const porItem = new Map();   // "destinacion|item" → [derechos, estadística, iva]
  const col = { [CONCEPTO_DERECHOS]: 0, [CONCEPTO_ESTADISTICA]: 1, [CONCEPTO_IVA]: 2 };
  const lector = readline.createInterface({ input: createReadStream(archivoImpuestos).pipe(createGunzip()), crlfDelay: Infinity });
  let primera = true;
  for await (const linea of lector) {
    if (primera) { primera = false; continue; }          // encabezado del CSV
    if (!linea) continue;
    filasCrudas++;
    const [, destinacion, numItem, concepto, monto] = linea.split(",").map((x) => x.trim());
    if (!/^[0-9]+$/.test(numItem ?? "")) continue;       // encabezado repetido del .lst
    if (concepto) conceptos++;
    const k = col[concepto];
    if (k === undefined || !monto) continue;
    const clave = `${destinacion}|${numItem}`;
    const v = porItem.get(clave) ?? [0, 0, 0];
    v[k] += Number(monto);
    porItem.set(clave, v);
  }
  await c.query("create temp table if not exists t_tasas (destinacion text, num_item int, der numeric, est numeric, iva numeric) on commit drop");
  await c.query("truncate t_tasas");
  const filas = [];
  for (const [clave, [der, est, iva]] of porItem) {
    if (der > 0 && iva > 0) { const [d, i] = clave.split("|"); filas.push(`${d},${i},${der},${est},${iva}\n`); }
  }
  await pipeline(Readable.from(filas), c.query(copyFrom("copy t_tasas from stdin with (format csv)")));
  await c.query("delete from agg_tasas_mes where periodo = $1", [periodo]);
  // CIF = derechos / arancel (sólo NCM con un único arancel > 0 en todas sus
  // aperturas); se descartan CIF no creíbles (fuera de 1 a 1,6 veces el FOB:
  // acuerdos, derechos específicos, errores).
  const r = await c.query(`
    with x as (
      select a.ncm, t.der, t.est, t.iva, a.fob_item, t.der / (ar.arancel_min / 100) cif
        from t_tasas t
        join arca_impo_items a on a.periodo = $1 and a.destinacion = t.destinacion and a.num_item = t.num_item
        join ncm_arancel ar on ar.ncm = a.ncm and ar.arancel_min = ar.arancel_max and ar.arancel_min > 0),
    z as (
      select ncm, (round(iva / (cif + der + est) * 200) / 2)::numeric(6, 1) iva_pct,
             (round(est / cif * 200) / 2)::numeric(6, 1) est_pct
        from x where fob_item > 0 and cif between fob_item and fob_item * 1.6)
    insert into agg_tasas_mes (ncm, periodo, tipo, pct, items)
    select ncm, $1, 'iva', iva_pct, count(*) from z group by ncm, iva_pct
    union all
    select ncm, $1, 'estadistica', est_pct, count(*) from z group by ncm, est_pct`, [periodo]);
  const usados = (await c.query("select coalesce(sum(items), 0)::int n from agg_tasas_mes where periodo = $1 and tipo = 'iva'", [periodo])).rows[0].n;
  return { filasCrudas, conceptos, itemsTasas: usados };
}

async function cargarMes(c, carpeta, periodo) {
  const items = path.join(carpeta, `impo_items_${periodo}.csv.gz`);
  const impuestos = path.join(carpeta, `impo_impuestos_${periodo}.csv.gz`);
  if (!existsSync(impuestos)) throw new Error(`Falta ${impuestos}`);
  const t0 = Date.now();

  return enTransaccion(c, async () => {
    const paso = (t) => console.log(`${periodo}: ${t}… (${Math.round((Date.now() - t0) / 1000)} s)`);
    await c.query("select pg_advisory_xact_lock(7212002)");
    await c.query("set local work_mem = '256MB'");
    paso("subiendo los ítems");
    // Las filas de encabezado repetidas del .lst ("NUM_ITEM" en vez de un
    // número) se descartan en la PC, antes de subir: el 4º campo del CSV
    // (num_item) tiene que ser un número. Los 3 primeros nunca traen comas.
    await c.query("create temp table t_items (like arca_impo_items) on commit drop");
    let leidos = 0, descartados = 0, cabecera = true;
    const filtro = new Transform({
      transform(trozo, _enc, listo) {
        this.resto = (this.resto ?? "") + trozo.toString("utf8");
        const lineas = this.resto.split("\n");
        this.resto = lineas.pop();
        const salen = [];
        for (const l of lineas) {
          if (cabecera) { cabecera = false; continue; }
          if (!l.trim()) continue;
          leidos++;
          if (/^[0-9]+$/.test((l.split(",", 4)[3] ?? "").trim())) salen.push(l);
          else descartados++;
        }
        listo(null, salen.length ? salen.join("\n") + "\n" : "");
      },
      flush(listo) {
        const l = this.resto ?? "";
        if (l.trim() && !cabecera) {
          leidos++;
          if (/^[0-9]+$/.test((l.split(",", 4)[3] ?? "").trim())) return listo(null, l + "\n");
          descartados++;
        }
        listo(null, "");
      },
    });
    const destino = c.query(copyFrom(
      `copy t_items (${COLS_ITEM}) from stdin with (format csv, force_not_null (${TEXTO_ITEM}))`));
    await pipeline(createReadStream(items), createGunzip(), filtro, destino);

    // Recarga limpia del mes: lo viejo de ese período se va, entra lo nuevo.
    paso(`guardando ${leidos - descartados} ítems`);
    await c.query("delete from arca_impo_items where periodo = $1", [periodo]);
    const ins = await c.query(`
      insert into arca_impo_items (${COLS_ITEM}) select ${COLS_ITEM} from t_items
      on conflict (destinacion, num_item) do update set
        ${COLS_ITEM.split(", ").filter((x) => x !== "destinacion" && x !== "num_item").map((x) => `${x} = excluded.${x}`).join(", ")}`);

    paso("leyendo impuestos y deduciendo IVA y estadística por NCM");
    const d = await calcularTasas(c, periodo, impuestos);

    paso("armando los resúmenes (lo más largo)");
    await recalcularResumen(c, periodo);
    paso("confirmando");
    await c.query(`
      insert into arca_cargas (periodo, cargado_en, filas_crudas, items, filas_impuestos, items_descartados)
      values ($1, now(), $2, $3, $4, $5)
      on conflict (periodo) do update set cargado_en = now(), filas_crudas = excluded.filas_crudas,
        items = excluded.items, filas_impuestos = excluded.filas_impuestos, items_descartados = excluded.items_descartados`,
      [periodo, d.filasCrudas, ins.rowCount, d.conceptos, descartados]);
    console.log(`${periodo}: filas_crudas=${d.filasCrudas} items=${ins.rowCount} (csv ${leidos}` +
      (descartados ? `, ${descartados} fila(s) de encabezado descartada(s)` : "") + ") " +
      `items_para_tasas=${d.itemsTasas}` +
      ` (${Math.round((Date.now() - t0) / 1000)} s)`);
  });
}

/** Recalcula IVA y estadística por NCM en todos los meses cargados, releyendo
 *  los impo_impuestos_AAAAMM.csv.gz (en la base no quedan montos). */
async function recalcularTasas(c, [carpeta]) {
  if (!carpeta) throw new Error("Falta la carpeta con los impo_impuestos_AAAAMM.csv.gz");
  const periodos = (await c.query("select periodo from arca_cargas order by 1")).rows.map((r) => r.periodo);
  for (const p of periodos) {
    const archivo = path.join(carpeta, `impo_impuestos_${p}.csv.gz`);
    if (!existsSync(archivo)) { console.log(`${p}: FALTA ${archivo}, no se recalculó`); continue; }
    const d = await enTransaccion(c, () => calcularTasas(c, p, archivo));
    console.log(`${p}: IVA y estadística recalculados (${d.itemsTasas} ítems usados)`);
  }
}

async function arca(c, args) {
  const carpeta = args.find((a) => !a.startsWith("--") && !/^\d{6}$/.test(a));
  if (!carpeta) throw new Error("Falta la carpeta con los impo_items_AAAAMM.csv.gz");
  const forzar = args.includes("--forzar");
  let periodos = args.filter((a) => /^\d{6}$/.test(a));
  if (!periodos.length) {
    periodos = readdirSync(carpeta).map((f) => f.match(/^impo_items_(\d{6})\.csv\.gz$/)?.[1]).filter(Boolean).sort();
  }
  const ya = new Set((await c.query("select periodo from arca_cargas")).rows.map((r) => r.periodo));
  for (const p of periodos) {
    if (ya.has(p) && !forzar) { console.log(`${p}: ya estaba cargado (--forzar para recargar)`); continue; }
    await cargarMes(c, carpeta, p);
  }
}

// ── Nomenclador ─────────────────────────────────────────────

async function arancel(c, [carpeta]) {
  if (!carpeta) throw new Error("Falta la carpeta con ref_ncm.csv y ref_sufijo.csv");
  await enTransaccion(c, async () => {
    const cols = "codigo, vigencia, tipo, nivel, padre, descripcion, descripcion_completa, unidad, alic_1, alic_2, alic_3, alic_4, alic_5, alic_6, unidad_derecho_especifico";
    await c.query("create temp table t_ncm (like ref_ncm) on commit drop");
    await copiarCsv(c, `copy t_ncm (${cols}) from stdin with (format csv, header true)`, path.join(carpeta, "ref_ncm.csv"));
    // Cada vigencia es una versión: una carga nueva no pisa las anteriores.
    // Recargar la MISMA vigencia la reemplaza. uso_economico y rubro_ml
    // (futuras, no vienen del arancel) se copian de la versión anterior.
    const vig = (await c.query("select distinct vigencia::text v from t_ncm")).rows.map((r) => r.v);
    if (vig.length !== 1) throw new Error(`ref_ncm.csv trae ${vig.length} vigencias; tiene que traer una`);
    await c.query(`update t_ncm t set uso_economico = p.uso_economico, rubro_ml = p.rubro_ml
                     from (select distinct on (codigo) codigo, uso_economico, rubro_ml from ref_ncm
                            where vigencia < $1 order by codigo, vigencia desc) p
                    where p.codigo = t.codigo`, [vig[0]]);
    await c.query("delete from ref_ncm where vigencia = $1", [vig[0]]);
    const n = await c.query(`insert into ref_ncm (${cols}, uso_economico, rubro_ml) select ${cols}, uso_economico, rubro_ml from t_ncm`);
    const versiones = (await c.query("select string_agg(distinct vigencia::text, ', ' order by vigencia::text) v from ref_ncm")).rows[0].v;
    await c.query("create temp table t_suf (like ref_sufijo) on commit drop");
    await copiarCsv(c, "copy t_suf (posicion, codigo, norma, descripcion) from stdin with (format csv, header true)",
      path.join(carpeta, "ref_sufijo.csv"));
    const s = await c.query(`
      insert into ref_sufijo select * from t_suf
      on conflict (posicion, codigo) do update set norma = excluded.norma, descripcion = excluded.descripcion`);
    console.log(`arancel: vigencia=${vig[0]} ref_ncm=${n.rowCount} ref_sufijo=${s.rowCount} | versiones en la base: ${versiones}`);
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
  // La orden contó con el script de Cowork, que dejaba pasar la fila de
  // encabezado repetida del .lst ("DESTINACION", "NUM_ITEM", "NOMBRE_IMPORTADOR")
  // como si fuera un ítem, un despacho y un importador más. La carga la
  // descarta: exactamente uno menos es lo esperable.
  const desc = Number((await uno("select coalesce(items_descartados, 0) n from arca_cargas where periodo = '202608'"))?.n ?? 0);
  const conEncabezado = (texto, real, esperado) => {
    if (desc > 0 && Number(real) === esperado - desc) {
      console.log(`OK*  ${texto}: ${real} (la orden dice ${esperado}; la diferencia son las ${desc} fila(s) de encabezado del .lst que la carga descartó)`);
    } else chequeo(texto, real, esperado);
  };
  conEncabezado("202608 ítems", a.items, 530186);
  conEncabezado("202608 despachos", a.despachos, 64863);
  conEncabezado("202608 importadores", a.importadores, 12089);
  const b = await uno(`select count(*) items, count(distinct importador) importadores from arca_impo_items
                        where periodo = '202608' and ncm = '8516.29.00' and pais_origen = '310'`);
  chequeo("8516.29.00 China ítems", b.items, 10);
  chequeo("8516.29.00 China importadores", b.importadores, 7);
  const d = await uno(`select importador, cantidad::float8 cantidad, fob_item::float8 fob from arca_impo_items
                        where destinacion = '26001IC04154138R' and num_item = 1`);
  console.log(`     26001IC04154138R/1: ${d ? `${d.importador} · ${d.cantidad} u · FOB ${d.fob}` : "no está"} (esperado Importadora MCA · 230 · 8178.75)`);
  chequeo("26001IC04154138R/1 cantidad", d?.cantidad, 230);
  chequeo("26001IC04154138R/1 FOB", d?.fob, 8178.75);
  // IVA y estadística deducidos (informativo): muebles (9403.20.90) y la NCM de control.
  for (const ncm of ["9403.20.90", "8516.29.00"]) {
    const t = await uno("select * from ncm_tasas where ncm = $1", [ncm]);
    console.log(`     ${ncm}: IVA ${t?.iva_pct ?? "—"}% (${t?.iva_items ?? 0} de ${t?.iva_total ?? 0} ítems) · ` +
      `estadística ${t?.estadistica_pct ?? "—"}% (${t?.estadistica_items ?? 0} de ${t?.estadistica_total ?? 0})`);
  }
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
  tasas: recalcularTasas,
  resumen: async (c, periodos) => {
    const lista = periodos.length ? periodos : (await c.query("select periodo from arca_cargas order by 1")).rows.map((r) => r.periodo);
    for (const p of lista) { await enTransaccion(c, () => recalcularResumen(c, p)); console.log(`${p}: resumen recalculado`); }
  },
  verificar,
};

if (!COMANDOS[comando]) {
  console.log("Comandos: esquema | arca <carpeta> [AAAAMM ...] [--forzar] | tasas <carpeta> | arancel <carpeta> | softrade [carpeta] | resumen [AAAAMM ...] | verificar");
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
