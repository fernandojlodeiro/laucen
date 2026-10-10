// Costos de vender en Mercado Libre: todos los días se le pregunta a la API de
// ML, con la cuenta de Fer, cuánto cuesta vender, y se guarda SÓLO LO QUE
// CAMBIÓ respecto de lo último guardado, con la fecha desde la que vale
// (tablas ml_costos_*, db/costos_ml.sql). Lo leen las sesiones que calculan el
// costo de vender por ML (vistas ml_costos_*_vigente).
//
// Una corrida por día, en partes ("fases"). Las chicas (unos cientos de
// consultas) se hacen enteras en un turno; si el turno se corta, se rehacen.
// Las comisiones se consultan sólo en las categorías donde Fer tiene
// publicaciones activas, con el cargo de cada plan de cuotas (Fer, 30/9; antes
// eran las ~10.700 categorías hoja). Si un turno no alcanza, pg_cron sigue
// cada 5 minutos (app/api/costos-ml/cron).
//
// Lo que se vio de la API el 28/9 (cuenta de Fer, Córdoba):
// - /sites/MLA/listing_prices: % por categoría y tipo de publicación; el % no
//   depende del precio. El cargo fijo sí: depende del precio y, si se manda
//   logistic_type + billable_weight, también del peso.
// - /users/{id}/shipping_options/free: lo que paga el vendedor por el envío
//   gratis, igual para todo el país; depende del peso, la logística y el
//   precio. Debajo del umbral ($33.000) da 0 (lo paga el comprador).
// - No hay API para el almacenamiento de Full ni para el costo de cuotas de
//   la publicación clásica (quedan en la bitácora #43, relevados a mano).

import { pool } from "@/db";
import { ml, tokenML } from "@/lib/radar/base";
import type { Respuesta } from "@/lib/meli";

const SITIO = "MLA";
/** Categoría de referencia para el cargo fijo (el cargo fijo no depende de la categoría). */
const CATEGORIA_REF = "MLA1621";
/** Precio para preguntar el % de comisión: alto, para que no se sume cargo fijo. */
const PRECIO_COMISION = 100_000;
const TIPOS = ["gold_special", "gold_pro"] as const;
const LOGISTICAS = ["xd_drop_off", "fulfillment"] as const;

// Grillas. Precios en pesos, pesos en gramos.
const PRECIOS_CARGO_FIJO = [1_000, 5_000, 10_000, 12_000, 12_500, 15_000, 18_000, 20_000, 22_000, 25_000, 28_000, 30_000, 32_999, 33_000, 40_000];
const PESOS_CARGO_FIJO = [300, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 30_000];
const PRECIOS_ENVIO = [33_000, 40_000, 50_000, 80_000, 150_000, 500_000];
const PESOS_ENVIO = [300, 500, 1_000, 2_000, 3_000, 5_000, 7_000, 10_000, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 70_000];
// "Envío por destino" (lo que paga el comprador según el código postal) ya no
// se consulta (Fer, 3/10): no es plata de Fer y sus "cambios" (ML agrega y saca
// opciones sin tocar el precio) tapaban los que importan. Su tabla queda con
// la historia.
export const FASES = ["referencias", "cargo_fijo", "envio_gratis", "comisiones"] as const;
type Fase = (typeof FASES)[number];

/** Fecha 'YYYY-MM-DD' en hora argentina. */
function hoyAR() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

/** Una caja cúbica cuyo peso volumétrico (cm³/4000) no pasa el peso real:
 *  así lo que se mide es el peso. */
function cajaPara(pesoG: number) {
  const lado = Math.max(1, Math.floor(Math.cbrt(pesoG * 4)));
  return `${lado}x${lado}x${lado}`;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET a ML con reintentos si limita pedidos (429) o falla del lado de ML. */
async function pedir(ruta: string, token: string | null): Promise<Respuesta> {
  let r: Respuesta = { ruta, status: 0, datos: null };
  for (let i = 0; i < 3; i++) {
    r = await ml(ruta, token);
    if (r.status !== 429 && r.status !== 0 && r.status < 500) return r;
    await espera(1500 * (i + 1));
  }
  return r;
}

/** Corre `tarea` sobre `items` de a `n` en paralelo mientras quede tiempo. */
async function enParalelo<T, R>(items: T[], n: number, hasta: number, tarea: (x: T) => Promise<R>): Promise<R[] | null> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    if (Date.now() > hasta) return null;
    out.push(...(await Promise.all(items.slice(i, i + n).map(tarea))));
  }
  return out;
}

/** Guarda en `tabla` sólo las filas cuyos valores cambiaron respecto de la
 *  última fila guardada con la misma clave (o que son nuevas). Devuelve
 *  cuántas agregó. `filas` trae todas las columnas de la tabla. */
async function guardarCambios(c: Corrida, tabla: string, claves: string[], valores: string[], filas: Record<string, unknown>[]) {
  let nuevas = 0;
  const igualClave = claves.map((k) => `u.${k} = n.${k}`).join(" and ");
  const igualValor = valores.map((v) => `u.${v} is not distinct from n.${v}`).join(" and ");
  for (let i = 0; i < filas.length; i += 500) {
    const r = await pool.query(
      `insert into ${tabla} select n.* from jsonb_populate_recordset(null::${tabla}, $1::jsonb) n
        where not exists (select 1 from (select * from ${tabla} u where ${igualClave} order by u.desde desc limit 1) u
                           where ${igualValor})
        on conflict do nothing`,
      [JSON.stringify(filas.slice(i, i + 500))]);
    nuevas += r.rowCount ?? 0;
  }
  if (nuevas) await pool.query(
    `update ml_costos_corridas set cambios = coalesce(cambios, '{}'::jsonb) || jsonb_build_object($2::text, coalesce((cambios->>$2)::int, 0) + $3)
      where id = $1`, [c.id, tabla, nuevas]);
  return nuevas;
}

type Corrida = { id: number; fecha: string; fases: string[]; meli_user: string | null; terminada: Date | null;
  iniciada: Date; cursor: string | null };

/** Crea la corrida de hoy si no existe. */
export async function iniciarHoy(): Promise<number> {
  const r = await pool.query<{ id: number }>(
    `insert into ml_costos_corridas (fecha) values ($1) on conflict (fecha) do update set fecha = excluded.fecha returning id`, [hoyAR()]);
  return r.rows[0].id;
}

type LP = { listing_type_id?: string; sale_fee_amount?: number;
  sale_fee_details?: { percentage_fee?: number; fixed_fee?: number; financing_add_on_fee?: number } };

// ── Las fases ──────────────────────────────────────────

async function referencias(c: Corrida, token: string, userId: number, hasta: number) {
  const rutas: [string, string][] = [
    ["tipos_publicacion", `/sites/${SITIO}/listing_types`],
    ["metodos_envio", `/sites/${SITIO}/shipping_methods`],
    ["preferencias_envio", `/users/${userId}/shipping_preferences`],
    ["cuenta", `/users/${userId}`],
  ];
  const res = await enParalelo(rutas, 4, hasta, async ([clave, ruta]) => ({ clave, r: await pedir(ruta, token) }));
  if (!res) return false;
  const filas = res.filter(({ r }) => r.status === 200).map(({ clave, r }) => {
    let datos = r.datos as Record<string, unknown>;
    // De la cuenta, sólo lo que cambia costos (el nivel y el tipo), no métricas ni datos personales.
    if (clave === "cuenta") {
      const rep = datos.seller_reputation as { level_id?: string; power_seller_status?: string } | undefined;
      const dir = datos.address as { state?: string; zip_code?: string } | undefined;
      datos = { user_type: datos.user_type, tags: datos.tags, provincia: dir?.state, cp: dir?.zip_code,
        nivel: rep?.level_id, mercadolider: rep?.power_seller_status };
    }
    return { clave, desde: c.iniciada, corrida_id: c.id, datos };
  });
  await guardarCambios(c, "ml_costos_referencias", ["clave"], ["datos"], filas);
  return true;
}

async function cargoFijo(c: Corrida, token: string, _u: number, hasta: number) {
  type Q = { tipo: string; precio: number; logistica: string; peso: number };
  const qs: Q[] = [];
  for (const tipo of TIPOS) for (const precio of PRECIOS_CARGO_FIJO) {
    qs.push({ tipo, precio, logistica: "-", peso: 0 });
    for (const logistica of LOGISTICAS) for (const peso of PESOS_CARGO_FIJO) qs.push({ tipo, precio, logistica, peso });
  }
  const res = await enParalelo(qs, 8, hasta, async (q) => {
    const extra = q.peso ? `&logistic_type=${q.logistica}&billable_weight=${q.peso}` : "";
    const r = await pedir(`/sites/${SITIO}/listing_prices?price=${q.precio}&category_id=${CATEGORIA_REF}&listing_type_id=${q.tipo}${extra}`, token);
    const d = (Array.isArray(r.datos) ? r.datos[0] : r.datos) as LP | null;
    if (r.status !== 200 || !d?.sale_fee_details) return null;
    return {
      tipo: q.tipo, precio: q.precio, logistica: q.logistica, peso_g: q.peso, desde: c.iniciada, corrida_id: c.id,
      cargo_fijo: d.sale_fee_details.fixed_fee ?? null, porcentaje: d.sale_fee_details.percentage_fee ?? null,
      comision_total: d.sale_fee_amount ?? null,
    };
  });
  if (!res) return false;
  await guardarCambios(c, "ml_costos_cargo_fijo", ["tipo", "precio", "logistica", "peso_g"],
    ["cargo_fijo", "porcentaje", "comision_total"], res.filter((x) => x !== null));
  await sumarFallas(c, res.filter((x) => x === null).length);
  return true;
}

async function envioGratis(c: Corrida, token: string, userId: number, hasta: number) {
  type Q = { logistica: string; precio: number; peso: number };
  const qs: Q[] = [];
  for (const logistica of LOGISTICAS) for (const precio of PRECIOS_ENVIO) for (const peso of PESOS_ENVIO) qs.push({ logistica, precio, peso });
  const tipo = "gold_special";
  const res = await enParalelo(qs, 8, hasta, async (q) => {
    const medidas = cajaPara(q.peso);
    const r = await pedir(`/users/${userId}/shipping_options/free?dimensions=${medidas},${q.peso}&item_price=${q.precio}` +
      `&listing_type_id=${tipo}&mode=me2&condition=new&logistic_type=${q.logistica}&verbose=true`, token);
    const a = (r.datos as { coverage?: { all_country?: { list_cost?: number; billable_weight?: number; discount?: { rate?: number; promoted_amount?: number } } } } | null)
      ?.coverage?.all_country;
    if (r.status !== 200 || !a) return null;
    return {
      logistica: q.logistica, tipo, precio: q.precio, peso_g: q.peso, desde: c.iniciada, corrida_id: c.id, medidas,
      costo: a.list_cost ?? null, costo_lleno: a.discount?.promoted_amount ?? null,
      bonificacion: a.discount?.rate ?? null, peso_facturable: a.billable_weight ?? null,
    };
  });
  if (!res) return false;
  await guardarCambios(c, "ml_costos_envio_gratis", ["logistica", "tipo", "precio", "peso_g"],
    ["costo", "costo_lleno", "bonificacion", "peso_facturable"], res.filter((x) => x !== null));
  await sumarFallas(c, res.filter((x) => x === null).length);
  return true;
}

/** Las categorías donde Fer tiene publicaciones activas (Fer, 30/9: sólo
 *  ésas interesan), en cualquiera de sus cuentas. Se guardan en ml_costos_mis_categorias. */
async function misCategorias(token: string, userId: number, hasta: number) {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 100) {
    if (Date.now() > hasta) return null;
    const r = await pedir(`/users/${userId}/items/search?status=active&limit=100&offset=${offset}`, token);
    const d = r.datos as { results?: string[]; paging?: { total?: number } } | null;
    if (r.status !== 200 || !d?.results) return null;
    ids.push(...d.results);
    if (!d.results.length || ids.length >= (d.paging?.total ?? 0) || offset >= 900) break;
  }
  const tandas: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) tandas.push(ids.slice(i, i + 20));
  const res = await enParalelo(tandas, 5, hasta, async (t) => {
    const r = await pedir(`/items?ids=${t.join(",")}&attributes=id,category_id`, token);
    return Array.isArray(r.datos) ? (r.datos as { code?: number; body?: { category_id?: string } }[]).map((x) => x.body?.category_id) : [];
  });
  if (!res) return null;
  const cuenta = new Map<string, number>();
  for (const cat of res.flat()) if (cat) cuenta.set(cat, (cuenta.get(cat) ?? 0) + 1);
  // También las categorías de las publicaciones activas de TODAS las cuentas de ML conectadas (Fer, 10/10): al
  // publicar en una cuenta lo que tiene otra, hace falta la comisión de cada plan de esas categorías.
  const otras = (await pool.query<{ categoria: string; n: number }>(
    "select categoria, count(*)::int n from meli_item where estado = 'active' and categoria is not null group by 1")).rows;
  for (const o of otras) if (!cuenta.has(o.categoria)) cuenta.set(o.categoria, o.n);
  const filas = [...cuenta].map(([categoria_id, publicaciones]) => ({ categoria_id, publicaciones }));
  await pool.query(
    `insert into ml_costos_mis_categorias (categoria_id, ruta, publicaciones, activa, vista)
     select n.categoria_id, (select ruta from meli_categorias m where m.id = n.categoria_id), n.publicaciones, true, now()
       from jsonb_to_recordset($1::jsonb) n(categoria_id text, publicaciones int)
     on conflict (categoria_id) do update set ruta = coalesce(excluded.ruta, ml_costos_mis_categorias.ruta),
       publicaciones = excluded.publicaciones, activa = true, vista = excluded.vista`, [JSON.stringify(filas)]);
  await pool.query("update ml_costos_mis_categorias set activa = false where activa and not (categoria_id = any($1::text[]))",
    [filas.map((f) => f.categoria_id)]);
  return filas.map((f) => f.categoria_id);
}

/** La comisión de cada categoría donde Fer tiene publicaciones activas, con lo
 *  que suma cada plan de cuotas (marca de ML en la publicación). */
const PLANES = [
  ["clasica_bajo_interes_pct", "gold_special", "pcj-co-funded"],
  ["premium_3x_pct", "gold_pro", "3x_campaign"],
  ["premium_9x_pct", "gold_pro", "9x_campaign"],
  ["premium_12x_pct", "gold_pro", "12x_campaign"],
] as const;

async function comisiones(c: Corrida, token: string, userId: number, hasta: number) {
  const cats = await misCategorias(token, userId, hasta);
  if (!cats) return false;
  const rutas = new Map((await pool.query<{ categoria_id: string; ruta: string | null }>(
    "select categoria_id, ruta from ml_costos_mis_categorias where activa")).rows.map((r) => [r.categoria_id, r.ruta]));
  const res = await enParalelo(cats, 5, hasta, async (cat) => {
    const r = await pedir(`/sites/${SITIO}/listing_prices?price=${PRECIO_COMISION}&category_id=${cat}`, token);
    if (r.status !== 200 || !Array.isArray(r.datos)) return null;
    const lista = r.datos as LP[];
    const de = (t: string) => lista.find((x) => x.listing_type_id === t)?.sale_fee_details;
    const fila: Record<string, unknown> = {
      categoria_id: cat, desde: c.iniciada, corrida_id: c.id, ruta: rutas.get(cat) ?? null,
      clasica_pct: de("gold_special")?.percentage_fee ?? null, premium_pct: de("gold_pro")?.percentage_fee ?? null,
      premium_cuotas_pct: de("gold_pro")?.financing_add_on_fee ?? null,
    };
    for (const [col, tipo, tag] of PLANES) {
      const p = await pedir(`/sites/${SITIO}/listing_prices?price=${PRECIO_COMISION}&category_id=${cat}&listing_type_id=${tipo}&tags=${tag}`, token);
      const d = (Array.isArray(p.datos) ? p.datos[0] : p.datos) as LP | null;
      fila[col] = p.status === 200 ? d?.sale_fee_details?.financing_add_on_fee ?? null : null;
    }
    return fila;
  });
  if (!res) return false;
  await guardarCambios(c, "ml_costos_comisiones", ["categoria_id"],
    ["clasica_pct", "premium_pct", "premium_cuotas_pct", ...PLANES.map(([col]) => col)], res.filter((x) => x !== null));
  await sumarFallas(c, res.filter((x) => x === null).length);
  return true;
}

async function sumarFallas(c: Corrida, n: number) {
  if (n) await pool.query("update ml_costos_corridas set fallas = fallas + $2 where id = $1", [c.id, n]);
}

const PASOS: Record<Fase, (c: Corrida, token: string, userId: number, hasta: number) => Promise<boolean>> = {
  referencias, cargo_fijo: cargoFijo, envio_gratis: envioGratis, comisiones,
};

/** Avanza las corridas sin terminar hasta `hasta` (ms). Nunca tira. */
export async function avanzar(hasta: number) {
  const out: Record<string, unknown>[] = [];
  const r = await pool.query<Corrida>("select * from ml_costos_corridas where terminada is null order by id");
  for (const c of r.rows) {
    try {
      const token = await tokenML();
      if (!token) throw new Error("No hay cuenta de Mercado Libre conectada (/admin/meli)");
      let userId = Number(c.meli_user);
      if (!userId) {
        const yo = await pedir("/users/me", token);
        userId = (yo.datos as { id?: number } | null)?.id ?? 0;
        if (!userId) throw new Error(`/users/me respondió ${yo.status}`);
        await pool.query("update ml_costos_corridas set meli_user = $2 where id = $1", [c.id, userId]);
      }
      const hechas: string[] = [];
      for (const f of FASES) {
        if (c.fases.includes(f)) continue;
        if (Date.now() > hasta) break;
        if (!(await PASOS[f](c, token, userId, hasta))) break;
        c.fases.push(f);
        hechas.push(f);
        await pool.query("update ml_costos_corridas set fases = $2, error = null where id = $1", [c.id, c.fases]);
      }
      const fin = FASES.every((f) => c.fases.includes(f));
      if (fin) await pool.query("update ml_costos_corridas set terminada = now() where id = $1", [c.id]);
      out.push({ corrida: c.id, fecha: c.fecha, hechas, terminada: fin });
    } catch (e) {
      const msg = String(e).slice(0, 300);
      console.error("[costos-ml]", c.id, e);
      await pool.query("update ml_costos_corridas set error = $2 where id = $1", [c.id, msg]).catch(() => {});
      out.push({ corrida: c.id, error: msg });
    }
    if (Date.now() > hasta) break;
  }
  return out;
}

export async function ultimasCorridas(n = 10) {
  const r = await pool.query<{
    id: number; fecha: string; iniciada: Date; terminada: Date | null; fases: string[]; error: string | null;
    cursor: string | null; fallas: number; cambios: Record<string, number> | null; hojas: number; hechas: number;
  }>(
    `select c.*, (select count(*)::int from ml_costos_mis_categorias where activa) hojas, 0 hechas
       from ml_costos_corridas c order by id desc limit $1`, [n]);
  return r.rows;
}

// ── Lectura para la pantalla (lo vigente) ──────────────

const num = (v: unknown) => (v == null ? null : Number(v));

type FilaComision = { categoria_id: string; ruta: string | null; desde: Date; publicaciones: number; cambios: number;
  clasica_pct: string | null; premium_pct: string | null; premium_cuotas_pct: string | null; clasica_bajo_interes_pct: string | null;
  premium_3x_pct: string | null; premium_9x_pct: string | null; premium_12x_pct: string | null };

/** Comisiones vigentes de las categorías donde Fer tiene publicaciones activas. */
export async function comisionesVigentes(buscar: string, limite = 300) {
  const q = `%${buscar.trim()}%`;
  const r = await pool.query<FilaComision>(
    `select v.*, coalesce(m.ruta, v.ruta) ruta, m.publicaciones,
            (select count(*)::int from ml_costos_comisiones k where k.categoria_id = v.categoria_id) cambios
       from ml_costos_comisiones_vigente v join ml_costos_mis_categorias m on m.categoria_id = v.categoria_id and m.activa
      where $1 = '%%' or coalesce(m.ruta, v.ruta) ilike $1 or v.categoria_id ilike $1
      order by m.publicaciones desc, 2 limit $2`, [q, limite]);
  const total = await pool.query<{ n: number }>(
    `select count(*)::int n from ml_costos_mis_categorias m where m.activa and ($1 = '%%' or m.ruta ilike $1 or m.categoria_id ilike $1)`, [q]);
  return {
    total: total.rows[0].n,
    filas: r.rows.map((f) => ({
      ...f, clasica_pct: num(f.clasica_pct), premium_pct: num(f.premium_pct), premium_cuotas_pct: num(f.premium_cuotas_pct),
      clasica_bajo_interes_pct: num(f.clasica_bajo_interes_pct), premium_3x_pct: num(f.premium_3x_pct),
      premium_9x_pct: num(f.premium_9x_pct), premium_12x_pct: num(f.premium_12x_pct),
    })),
  };
}

export async function cargoFijoVigente() {
  const r = await pool.query<{ tipo: string; precio: string; logistica: string; peso_g: number; cargo_fijo: string | null; desde: Date }>(
    "select tipo, precio, logistica, peso_g, cargo_fijo, desde from ml_costos_cargo_fijo_vigente where tipo = 'gold_special'");
  return r.rows.map((f) => ({ ...f, precio: Number(f.precio), cargo_fijo: num(f.cargo_fijo) }));
}

export async function envioGratisVigente() {
  const r = await pool.query<{ logistica: string; precio: string; peso_g: number; costo: string | null; peso_facturable: number | null; desde: Date }>(
    "select logistica, precio, peso_g, costo, peso_facturable, desde from ml_costos_envio_gratis_vigente");
  return r.rows.map((f) => ({ ...f, precio: Number(f.precio), costo: num(f.costo) }));
}

export const GRILLAS = { PRECIOS_CARGO_FIJO, PESOS_CARGO_FIJO, PRECIOS_ENVIO, PESOS_ENVIO };

export type Cambio = { desde: Date; que: string; detalle: string; antes: string; ahora: string };

/** Lo que cambió después de la primera carga, lo más nuevo primero: una fila
 *  por clave que cambió de valor (o que apareció nueva, p. ej. una categoría). */
export async function cambiosRecientes(limite = 300): Promise<Cambio[]> {
  const r = await pool.query<Cambio>(
    `with primera as (select min(id) id from ml_costos_corridas),
     com as (
       select desde, corrida_id, 'Comisión' que, coalesce(ruta, categoria_id) detalle,
              lag(concat_ws(' · ', 'clásica ' || replace(round(clasica_pct, 2)::text, '.', ',') || ' %', 'premium ' || replace(round(premium_pct, 2)::text, '.', ',') || ' %', 'cuotas ' || replace(round(premium_cuotas_pct, 2)::text, '.', ',') || ' %', 'bajo interés +' || replace(round(clasica_bajo_interes_pct, 2)::text, '.', ',') || ' %', '3x +' || replace(round(premium_3x_pct, 2)::text, '.', ',') || ' %', '9x +' || replace(round(premium_9x_pct, 2)::text, '.', ',') || ' %', '12x +' || replace(round(premium_12x_pct, 2)::text, '.', ',') || ' %'))
                over (partition by categoria_id order by desde) antes,
              concat_ws(' · ', 'clásica ' || replace(round(clasica_pct, 2)::text, '.', ',') || ' %', 'premium ' || replace(round(premium_pct, 2)::text, '.', ',') || ' %', 'cuotas ' || replace(round(premium_cuotas_pct, 2)::text, '.', ',') || ' %', 'bajo interés +' || replace(round(clasica_bajo_interes_pct, 2)::text, '.', ',') || ' %', '3x +' || replace(round(premium_3x_pct, 2)::text, '.', ',') || ' %', '9x +' || replace(round(premium_9x_pct, 2)::text, '.', ',') || ' %', '12x +' || replace(round(premium_12x_pct, 2)::text, '.', ',') || ' %') ahora
         from ml_costos_comisiones c where exists (select 1 from ml_costos_mis_categorias m where m.categoria_id = c.categoria_id and m.activa)),
     cf as (
       select desde, corrida_id, 'Cargo fijo' que,
              case tipo when 'gold_special' then 'Clásica' when 'gold_pro' then 'Premium' else tipo end || ' · $ ' || replace(to_char(precio, 'FM999,999,990'), ',', '.') || case when peso_g > 0 then ' · ' || case logistica when 'fulfillment' then 'Full' else 'Colecta' end || ' ' || peso_g || ' g' else '' end detalle,
              lag('$ ' || replace(to_char(cargo_fijo, 'FM999,999,990'), ',', '.')) over (partition by tipo, precio, logistica, peso_g order by desde) antes, '$ ' || replace(to_char(cargo_fijo, 'FM999,999,990'), ',', '.') ahora
         from ml_costos_cargo_fijo),
     eg as (
       select desde, corrida_id, 'Envío gratis' que, case logistica when 'fulfillment' then 'Full' else 'Colecta' end || ' · ' || peso_g || ' g · a $ ' || replace(to_char(precio, 'FM999,999,990'), ',', '.') detalle,
              lag('$ ' || replace(to_char(costo, 'FM999,999,990'), ',', '.')) over (partition by logistica, tipo, precio, peso_g order by desde) antes, '$ ' || replace(to_char(costo, 'FM999,999,990'), ',', '.') ahora
         from ml_costos_envio_gratis),
     rf as (
       select desde, corrida_id, 'Referencia' que, clave detalle,
              lag(left(datos::text, 120)) over (partition by clave order by desde) antes, left(datos::text, 120) ahora
         from ml_costos_referencias),
     todo as (select * from com union all select * from cf union all select * from eg union all select * from rf)
     select desde, que, detalle, coalesce(antes, '(nuevo)') antes, ahora from todo, primera
      where corrida_id > primera.id order by desde desc, que, detalle limit $1`, [limite]);
  return r.rows;
}
