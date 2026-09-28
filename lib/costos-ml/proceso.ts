// Costos de vender en Mercado Libre: todos los días se le pregunta a la API de
// ML, con la cuenta de Fer, cuánto cuesta vender, y se guarda con fecha y hora
// (tablas ml_costos_*, db/costos_ml.sql). Lo leen las sesiones que calculan el
// costo de vender por ML.
//
// Una corrida por día, en partes ("fases"). Las chicas (unos cientos de
// consultas) se hacen enteras en un turno; si el turno se corta, se rehacen.
// La grande (la comisión de cada una de las ~10.700 categorías hoja) avanza de
// a tandas: el cron de Vercel la arranca y pg_cron la sigue cada 5 minutos
// hasta terminar (app/api/costos-ml/cron).
//
// Lo que se vio de la API el 28/9 (cuenta de Fer, Córdoba):
// - /sites/MLA/listing_prices: % por categoría y tipo de publicación; el % no
//   depende del precio. El cargo fijo sí: depende del precio y, si se manda
//   logistic_type + billable_weight, también del peso.
// - /users/{id}/shipping_options/free: lo que paga el vendedor por el envío
//   gratis, igual para todo el país; depende del peso, la logística y el
//   precio. Debajo del umbral ($33.000) da 0 (lo paga el comprador).
// - /users/{id}/shipping_options?zip_code=: lo que paga el comprador, por
//   destino, saliendo del código postal de la cuenta.
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
const PRECIO_DESTINO = 20_000;
const PESOS_DESTINO = [500, 2_000, 5_000, 10_000, 20_000];
/** Un código postal por ciudad de referencia; cubre todas las provincias. */
export const DESTINOS: [string, string][] = [
  ["1414", "CABA"], ["1650", "GBA San Martín"], ["1900", "La Plata"], ["7600", "Mar del Plata"], ["8000", "Bahía Blanca"],
  ["5000", "Córdoba"], ["5800", "Río Cuarto"], ["2000", "Rosario"], ["3000", "Santa Fe"], ["3100", "Paraná"],
  ["5500", "Mendoza"], ["5400", "San Juan"], ["5700", "San Luis"], ["5300", "La Rioja"], ["4700", "Catamarca"],
  ["4000", "Tucumán"], ["4200", "Santiago del Estero"], ["4400", "Salta"], ["4600", "Jujuy"], ["3400", "Corrientes"],
  ["3300", "Posadas"], ["3500", "Resistencia"], ["3600", "Formosa"], ["6300", "Santa Rosa"], ["8300", "Neuquén"],
  ["8400", "Bariloche"], ["8500", "Viedma"], ["9103", "Rawson"], ["9000", "Comodoro Rivadavia"], ["9400", "Río Gallegos"],
  ["9410", "Ushuaia"],
];

export const FASES = ["referencias", "cargo_fijo", "envio_gratis", "envio_destino", "comisiones"] as const;
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

/** Inserta filas (objetos con los nombres de columna) en una tabla. */
async function insertar(tabla: string, filas: Record<string, unknown>[]) {
  for (let i = 0; i < filas.length; i += 500) {
    await pool.query(
      `insert into ${tabla} select * from jsonb_populate_recordset(null::${tabla}, $1::jsonb)`,
      [JSON.stringify(filas.slice(i, i + 500))]);
  }
}

type Corrida = { id: number; fecha: string; fases: string[]; meli_user: string | null; terminada: Date | null };

/** Crea la corrida de hoy si no existe. */
export async function iniciarHoy(): Promise<number> {
  const r = await pool.query<{ id: number }>(
    `insert into ml_costos_corridas (fecha) values ($1) on conflict (fecha) do update set fecha = excluded.fecha returning id`, [hoyAR()]);
  return r.rows[0].id;
}

export async function hayPendiente(): Promise<boolean> {
  const r = await pool.query("select 1 from ml_costos_corridas where terminada is null limit 1");
  return (r.rowCount ?? 0) > 0;
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
    ["medios_pago", `/sites/${SITIO}/payment_methods`],
    ["sitio", `/sites/${SITIO}`],
    ["listing_prices_referencia", `/sites/${SITIO}/listing_prices?price=${PRECIO_COMISION}&category_id=${CATEGORIA_REF}`],
  ];
  const res = await enParalelo(rutas, 4, hasta, async ([clave, ruta]) => ({ clave, ruta, r: await pedir(ruta, token) }));
  if (!res) return false;
  const ts = new Date().toISOString();
  await pool.query("delete from ml_costos_referencias where corrida_id = $1", [c.id]);
  await insertar("ml_costos_referencias", res.map(({ clave, ruta, r }) => {
    // De la cuenta sólo interesa lo que cambia costos; sin datos personales.
    let datos = r.datos as Record<string, unknown> | null;
    if (clave === "cuenta" && datos) datos = {
      id: datos.id, user_type: datos.user_type, tags: datos.tags, address: { state: (datos.address as { state?: string })?.state, zip_code: (datos.address as { zip_code?: string })?.zip_code },
      seller_reputation: datos.seller_reputation, status: datos.status,
    };
    return { corrida_id: c.id, clave, ts, ruta, status: r.status, datos };
  }));
  return true;
}

async function cargoFijo(c: Corrida, token: string, _u: number, hasta: number) {
  type Q = { tipo: string; precio: number; logistica: string | null; peso: number | null };
  const qs: Q[] = [];
  for (const tipo of TIPOS) for (const precio of PRECIOS_CARGO_FIJO) {
    qs.push({ tipo, precio, logistica: null, peso: null });
    for (const logistica of LOGISTICAS) for (const peso of PESOS_CARGO_FIJO) qs.push({ tipo, precio, logistica, peso });
  }
  const res = await enParalelo(qs, 8, hasta, async (q) => {
    const extra = q.logistica ? `&logistic_type=${q.logistica}&billable_weight=${q.peso}` : "";
    const r = await pedir(`/sites/${SITIO}/listing_prices?price=${q.precio}&category_id=${CATEGORIA_REF}&listing_type_id=${q.tipo}${extra}`, token);
    const d = (Array.isArray(r.datos) ? r.datos[0] : r.datos) as LP | null;
    const ok = r.status === 200 && d?.sale_fee_details;
    return {
      corrida_id: c.id, ts: new Date().toISOString(), categoria_id: CATEGORIA_REF, tipo: q.tipo, precio: q.precio,
      logistica: q.logistica, peso_g: q.peso, status: r.status,
      cargo_fijo: ok ? d.sale_fee_details!.fixed_fee ?? null : null,
      porcentaje: ok ? d.sale_fee_details!.percentage_fee ?? null : null,
      comision_total: ok ? d.sale_fee_amount ?? null : null,
      crudo: r.datos,
    };
  });
  if (!res) return false;
  await pool.query("delete from ml_costos_cargo_fijo where corrida_id = $1", [c.id]);
  await insertar("ml_costos_cargo_fijo", res);
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
    return {
      corrida_id: c.id, ts: new Date().toISOString(), logistica: q.logistica, tipo, precio: q.precio, peso_g: q.peso, medidas,
      status: r.status, costo: a?.list_cost ?? null, costo_lleno: a?.discount?.promoted_amount ?? null,
      bonificacion: a?.discount?.rate ?? null, peso_facturable: a?.billable_weight ?? null, crudo: r.datos,
    };
  });
  if (!res) return false;
  await pool.query("delete from ml_costos_envio_gratis where corrida_id = $1", [c.id]);
  await insertar("ml_costos_envio_gratis", res);
  return true;
}

async function envioDestino(c: Corrida, token: string, userId: number, hasta: number) {
  const qs = DESTINOS.flatMap(([cp, lugar]) => PESOS_DESTINO.map((peso) => ({ cp, lugar, peso })));
  const res = await enParalelo(qs, 8, hasta, async (q) => {
    const medidas = cajaPara(q.peso);
    const r = await pedir(`/users/${userId}/shipping_options?zip_code=${q.cp}&dimensions=${medidas},${q.peso}&item_price=${PRECIO_DESTINO}`, token);
    type Op = { name?: string; shipping_method_type?: string; shipping_method_id?: number; cost?: number; list_cost?: number };
    const d = r.datos as { destination?: { state?: { name?: string } }; options?: Op[] } | null;
    const opciones = (d?.options ?? []).map((o) => ({ nombre: o.name, tipo: o.shipping_method_type, metodo: o.shipping_method_id, costo: o.cost, costo_lista: o.list_cost }));
    const costos = opciones.map((o) => o.costo).filter((x): x is number => typeof x === "number");
    return {
      corrida_id: c.id, ts: new Date().toISOString(), cp: q.cp, lugar: q.lugar, provincia: d?.destination?.state?.name ?? null,
      precio: PRECIO_DESTINO, peso_g: q.peso, medidas, status: r.status,
      costo_min: costos.length ? Math.min(...costos) : null, opciones, crudo: r.datos,
    };
  });
  if (!res) return false;
  await pool.query("delete from ml_costos_envio_destino where corrida_id = $1", [c.id]);
  await insertar("ml_costos_envio_destino", res);
  return true;
}

/** La comisión de cada categoría hoja; avanza de a tandas. Devuelve true cuando no queda ninguna. */
async function comisiones(c: Corrida, token: string, _u: number, hasta: number) {
  while (Date.now() < hasta) {
    const pend = await pool.query<{ id: string; ruta: string }>(
      `select m.id, m.ruta from meli_categorias m
        left join ml_costos_comisiones k on k.corrida_id = $1 and k.categoria_id = m.id
        where m.es_hoja and (k.categoria_id is null or (k.status <> 200 and k.intentos < 3))
        order by m.id limit 200`, [c.id]);
    if (!pend.rows.length) return true;
    const res = await enParalelo(pend.rows, 10, hasta, async (cat) => {
      const r = await pedir(`/sites/${SITIO}/listing_prices?price=${PRECIO_COMISION}&category_id=${cat.id}`, token);
      const lista = (Array.isArray(r.datos) ? r.datos : []) as LP[];
      const de = (t: string) => lista.find((x) => x.listing_type_id === t)?.sale_fee_details;
      return {
        corrida_id: c.id, categoria_id: cat.id, ts: new Date().toISOString(), ruta: cat.ruta, status: r.status, intentos: 1,
        precio: PRECIO_COMISION, clasica_pct: de("gold_special")?.percentage_fee ?? null,
        premium_pct: de("gold_pro")?.percentage_fee ?? null, premium_cuotas_pct: de("gold_pro")?.financing_add_on_fee ?? null,
        crudo: r.datos,
      };
    });
    if (!res) return false;
    await pool.query(
      `insert into ml_costos_comisiones select * from jsonb_populate_recordset(null::ml_costos_comisiones, $1::jsonb)
       on conflict (corrida_id, categoria_id) do update set ts = excluded.ts, status = excluded.status,
         intentos = ml_costos_comisiones.intentos + 1, clasica_pct = excluded.clasica_pct, premium_pct = excluded.premium_pct,
         premium_cuotas_pct = excluded.premium_cuotas_pct, crudo = excluded.crudo`, [JSON.stringify(res)]);
  }
  return false;
}

const PASOS: Record<Fase, (c: Corrida, token: string, userId: number, hasta: number) => Promise<boolean>> = {
  referencias, cargo_fijo: cargoFijo, envio_gratis: envioGratis, envio_destino: envioDestino, comisiones,
};

async function resumen(id: number) {
  const r = await pool.query(
    `select (select count(*) from ml_costos_comisiones where corrida_id = $1 and status = 200) comisiones_ok,
            (select count(*) from ml_costos_comisiones where corrida_id = $1 and status <> 200) comisiones_error,
            (select count(*) from ml_costos_cargo_fijo where corrida_id = $1 and status = 200) cargo_fijo_ok,
            (select count(*) from ml_costos_envio_gratis where corrida_id = $1 and status = 200) envio_gratis_ok,
            (select count(*) from ml_costos_envio_destino where corrida_id = $1 and status = 200) envio_destino_ok,
            (select min(precio) from ml_costos_cargo_fijo where corrida_id = $1 and status = 200 and logistica is null
                and tipo = 'gold_special' and cargo_fijo = 0) umbral_sin_cargo_fijo`, [id]);
  return r.rows[0];
}

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
      if (fin) await pool.query("update ml_costos_corridas set terminada = now(), resumen = $2 where id = $1", [c.id, await resumen(c.id)]);
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
    resumen: Record<string, unknown> | null; comisiones: number; hojas: number;
  }>(
    `select c.*, (select count(*)::int from ml_costos_comisiones k where k.corrida_id = c.id and k.status = 200) comisiones,
            (select count(*)::int from meli_categorias where es_hoja) hojas
       from ml_costos_corridas c order by id desc limit $1`, [n]);
  return r.rows;
}
