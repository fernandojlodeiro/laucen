// Costo puesto en Argentina y neto de Mercado Libre (Fer, 28/9).
//
//   CIF = FOB + seguro (1% del FOB) + flete (barco: m³ de la caja × US$/m³;
//         avión: kg cobrables × US$/kg)
//   derechos = CIF × arancel de la NCM · estadística = CIF × tasa
//   base imponible = CIF + derechos + estadística · IVA = base × tasa
//   costo = base + IVA + 3% del CIF (1% despachante + 2% depósito y otros)
//
// La NCM la propone el juez; el arancel sale del nomenclador de ARCA y el IVA
// y la estadística de lo que se pagó en los despachos (módulo Importaciones).
// Las percepciones (IVA adicional, Ganancias) quedan afuera: son anticipos.
// Del lado de Mercado Libre, sólo publicación clásica y envío por Full.

import { pool } from "@/db";
import type { Caja, Parametros } from "./tipos";

export type Tasas = {
  ncm: string; propuesta: string; existe: boolean; aproximada: boolean; descripcion: string | null;
  arancel: number | null; arancelMin?: number | null; iva: number; estadistica: number; deDespachos: boolean; despachos: number;
};
export type CostosML = { comision: number | null; envio: number | null; errores: string[] };
export type DatosCosto = { tasas: Tasas | null; alternativa?: Tasas | null; ml: CostosML;
  clasificacion?: import("./ncm").Clasificacion | null };

/** "6306.40.90", "630640", "6306.40.90.000C" → "6306.40.90" (null si no hay 8 dígitos). */
export function normalizarNcm(s: string | null | undefined) {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : null;
}

/** `arancelFijo`: el de la apertura SIM ya elegida (clasificación registrada). */
export async function tasasDe(propuesta: string, arancelFijo?: number | null): Promise<Tasas | null> {
  let ncm = normalizarNcm(propuesta);
  if (!ncm) return null;
  let aproximada = false;
  const existe = async (c: string) =>
    (await pool.query("select 1 from ref_ncm_vigente where codigo like $1 || '%' limit 1", [c])).rowCount! > 0;
  if (!(await existe(ncm))) {
    // No existe tal cual: la posición de la misma subpartida más usada en los despachos.
    const r = await pool.query<{ ncm: string }>(
      `select a.ncm from ncm_arancel a left join ncm_tasas t on t.ncm = a.ncm
        where a.ncm like $1 || '%' order by coalesce(t.iva_total, 0) desc, a.ncm limit 1`, [ncm.slice(0, 7)]);
    if (!r.rows[0]) return { ncm, propuesta, existe: false, aproximada: false, descripcion: null, arancel: null, iva: 21, estadistica: 0, deDespachos: false, despachos: 0 };
    ncm = r.rows[0].ncm;
    aproximada = true;
  }
  const r = await pool.query<{ descripcion: string | null; arancel_min: string | null; arancel_max: string | null; iva_pct: string | null; estadistica_pct: string | null; despachos: number | null }>(
    `select (select coalesce(descripcion_completa, descripcion) from ref_ncm_vigente where codigo like $1 || '%' order by length(codigo) limit 1) descripcion,
            a.arancel_min, a.arancel_max, t.iva_pct, t.estadistica_pct, t.iva_total despachos
       from (select 1) x left join ncm_arancel a on a.ncm = $1 left join ncm_tasas t on t.ncm = $1`, [ncm]);
  const f = r.rows[0];
  const num = (v: string | null | undefined) => (v == null ? null : Number(v));
  return {
    ncm, propuesta, existe: true, aproximada, descripcion: f?.descripcion ?? null,
    // Si la NCM tiene aperturas con distinto arancel, se toma el más alto (conservador).
    arancel: arancelFijo ?? num(f?.arancel_max),
    arancelMin: arancelFijo == null && num(f?.arancel_min) !== num(f?.arancel_max) ? num(f?.arancel_min) : null,
    // Sin despachos de esa NCM: 21% de IVA y 0% de estadística (lo que más se paga hoy).
    iva: num(f?.iva_pct) ?? 21, estadistica: num(f?.estadistica_pct) ?? 0, deDespachos: f?.iva_pct != null, despachos: f?.despachos ?? 0,
  };
}

/** Comisión de publicación clásica y costo del envío por Full, en pesos,
 *  preguntados a Mercado Libre con la cuenta de Fer. Nunca tira. */
/** Comisión de publicación clásica y envío gratis por Full, en pesos, de las
 *  tablas que actualiza todos los días el cron de costos de ML (bitácora #84).
 *  Fer (28/9): siempre de las tablas, no se le pregunta más a Mercado Libre. */
export async function costosML(_organizacionId: string, categoriaId: string, precio: number | null, caja: Caja | null): Promise<CostosML> {
  const errores: string[] = [];
  if (!precio) return { comision: null, envio: null, errores: ["sin precio"] };
  let comision: number | null = null, envio: number | null = null;
  const c = await pool.query<{ clasica_pct: string | null }>("select clasica_pct from ml_costos_comisiones_vigente where categoria_id = $1", [categoriaId]).catch(() => null);
  const pct = c?.rows[0]?.clasica_pct;
  if (pct != null) comision = Math.round(precio * Number(pct)) / 100;
  else errores.push(`comisión: la categoría ${categoriaId} no está en la tabla de comisiones`);
  // Cargo fijo por unidad (sólo debajo de $33.000): el del precio de la grilla más cercano por debajo.
  if (comision != null && precio < 33000) {
    const f = await pool.query<{ cargo_fijo: string }>(
      "select cargo_fijo from ml_costos_cargo_fijo_vigente where logistica = 'fulfillment' and precio <= $1 order by precio desc, peso_g limit 1", [precio]).catch(() => null);
    if (f?.rows[0]) comision += Number(f.rows[0].cargo_fijo);
  }
  if (!caja?.kg) errores.push("envío: sin peso");
  else {
    // Full cobra por tramo de peso facturable (el mayor entre el real y el volumétrico). La grilla
    // de la tabla tiene 15 tamaños: se toma el primer tramo que cubre la caja, al precio de la grilla
    // más cercano por debajo del de venta. Es aproximado (contra la API, entre -16% y +8% en los colchones).
    const volumetricoG = caja.largo && caja.ancho && caja.alto ? (caja.largo * caja.ancho * caja.alto) / 4 : 0; // cm³/4000 kg
    const facturableG = Math.max(Math.round(caja.kg * 1000), Math.round(volumetricoG));
    const e = await pool.query<{ costo: string }>(
      `with p as (select coalesce((select max(precio) from ml_costos_envio_gratis_vigente where logistica = 'fulfillment' and precio <= $1),
                                  (select min(precio) from ml_costos_envio_gratis_vigente where logistica = 'fulfillment')) precio)
       select costo from ml_costos_envio_gratis_vigente g, p
        where g.logistica = 'fulfillment' and g.precio = p.precio and greatest(g.peso_facturable, g.peso_g) >= $2
        order by g.peso_g limit 1`, [precio, facturableG]).catch(() => null);
    if (e?.rows[0]) envio = Number(e.rows[0].costo);
    else errores.push("envío: no está en la tabla de envíos (más grande o pesado que la grilla)");
  }
  return { comision, envio, errores };
}

export type Cuenta = {
  fob: number; seguro: number; flete: number | null; fleteComo: string; cif: number | null;
  derechos: number | null; estadistica: number | null; base: number | null; iva: number | null; gastos: number | null; costo: number | null;
  venta: number | null; sobreCosto: number | null; sobreVenta: number | null;
  comision: number | null; envio: number | null; neto: number | null; netoSobreCosto: number | null; netoSobreVenta: number | null;
  falta: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** La cuenta completa en dólares, por unidad del producto de Mercado Libre. */
export function cuenta(fob: number, cajaML: Caja | null, precioPesos: number | null, p: Parametros, datos: DatosCosto | null,
  cajaChina?: { largo: number; ancho: number; alto: number; kg: number } | null, unidades = 1): Cuenta {
  // La caja de la publicación de China manda (Fer, 28/9: ahí las medidas son
  // exactas), por las unidades que hacen falta; si no, la de Mercado Libre.
  const deChina = !!(cajaChina?.largo && cajaChina.ancho && cajaChina.alto);
  const n = deChina ? unidades : 1;
  const caja = deChina ? cajaChina! : cajaML;
  const falta: string[] = [];
  const t = datos?.tasas;
  let flete: number | null = null, fleteComo = "";
  if (p.modo === "avion") {
    if (caja?.kg) {
      const kg = Math.max(caja.kg, caja.largo && caja.ancho && caja.alto ? (caja.largo * caja.ancho * caja.alto) / 6000 : 0);
      flete = kg * p.fleteKgUsd * n; fleteComo = `avión: ${r2(kg)} kg cobrables × US$ ${p.fleteKgUsd}${n > 1 ? ` × ${n} unidades` : ""}`;
    } else falta.push("el peso de la caja");
  } else if (caja?.largo && caja.ancho && caja.alto) {
    const m3 = (caja.largo * caja.ancho * caja.alto) / 1e6;
    flete = m3 * p.fleteM3Usd * n; fleteComo = `barco: caja ${deChina ? "de la publicación de China" : "de Mercado Libre"} ${caja.largo}×${caja.ancho}×${caja.alto} cm = ${m3.toLocaleString("es-AR", { maximumFractionDigits: 4 })} m³ × US$ ${p.fleteM3Usd}${n > 1 ? ` × ${n} unidades` : ""}`;
  } else falta.push("las medidas de la caja (el barco se cobra por volumen)");
  if (!t) falta.push("la NCM");
  else if (t.arancel == null) falta.push("el arancel de la NCM");
  const seguro = fob * 0.01;
  const cif = flete != null ? fob + seguro + flete : null;
  const derechos = cif != null && t?.arancel != null ? (cif * t.arancel) / 100 : null;
  const estadistica = cif != null && t ? (cif * t.estadistica) / 100 : null;
  const base = cif != null && derechos != null && estadistica != null ? cif + derechos + estadistica : null;
  const iva = base != null && t ? (base * t.iva) / 100 : null;
  const gastos = cif != null ? cif * 0.03 : null;
  const costo = base != null && iva != null && gastos != null ? base + iva + gastos : null;
  const venta = precioPesos ? precioPesos / p.dolar : null;
  const pct = (a: number | null, b: number | null) => (a != null && b ? r2((a / b) * 100) : null);
  const comision = datos?.ml.comision != null ? datos.ml.comision / p.dolar : null;
  const envio = datos?.ml.envio != null ? datos.ml.envio / p.dolar : null;
  const neto = venta != null && comision != null && envio != null ? venta - comision - envio : null;
  const f = (n: number | null) => (n == null ? null : r2(n));
  return {
    fob: r2(fob), seguro: r2(seguro), flete: f(flete), fleteComo, cif: f(cif), derechos: f(derechos), estadistica: f(estadistica),
    base: f(base), iva: f(iva), gastos: f(gastos), costo: f(costo), venta: f(venta),
    sobreCosto: costo != null && venta != null ? pct(venta - costo, costo) : null,
    sobreVenta: costo != null && venta != null ? pct(venta - costo, venta) : null,
    comision: f(comision), envio: f(envio), neto: f(neto),
    netoSobreCosto: costo != null && neto != null ? pct(neto - costo, costo) : null,
    netoSobreVenta: costo != null && neto != null && venta ? pct(neto - costo, venta) : null,
    falta,
  };
}
