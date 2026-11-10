// Los costos de importación para costear (Fer, 10/11; Configuración › Costos de importación): flete aéreo por kg,
// gastos fijos por envío, despachante, aranceles, IVA y la tabla TCA por peso. Se guardan en config_org
// (clave 'costeo_importacion'); si la organización no cargó nada, valen los de Miami → Córdoba que pasó Fer.

import { una, consulta } from "@/lib/erp/base";

export type ConfigCosteo = {
  nombre: string;
  flete_kg: number;              // US$ por kg cobrable
  seguro_pct: number;            // % del FOB: sólo se declara (suma al CIF), no se paga
  arancel_pct: number;           // % del CIF
  estadistica_pct: number;       // tasa de estadística, % del CIF (0 si no se paga)
  iva_pct: number;               // IVA de importación, % de CIF + aranceles + estadística (crédito fiscal: no es costo)
  awb: number; thc: number;      // US$ por envío
  gastos_destino: number;        // US$ por envío (+ IVA, crédito)
  despachante_pct: number;       // honorarios, % del CIF
  despachante_min: number;       // mínimo de honorarios, US$
  gastos_despachante: number;    // US$ por envío
  packing: number;               // US$ por caja
  caja_largo: number; caja_ancho: number; caja_alto: number; // cm
  unidades_caja: number;         // notebooks por caja
  peso_unidad: number;           // kg reales por notebook (con su caja)
  divisor_vol: number;           // peso volumétrico = largo × ancho × alto ÷ divisor
  tca: [number | null, number][]; // [hasta kg (null = más), US$ total]
  iva_venta_pct: number;         // IVA del precio de venta (notebooks: 10,5 %)
  gasto_venta: number;           // $ por unidad vendida (envío y otros); 0 = no se cuenta
  meses_tope: number;            // cuántos meses de lo que vende el que gana el catálogo se proponen como máximo
};

export const CONFIG_INICIAL: ConfigCosteo = {
  nombre: "Miami → Córdoba (aéreo)",
  flete_kg: 4.32, seguro_pct: 1, arancel_pct: 16, estadistica_pct: 0, iva_pct: 10.5,
  awb: 55, thc: 75, gastos_destino: 290, despachante_pct: 1, despachante_min: 200, gastos_despachante: 128,
  packing: 180, caja_largo: 104.8, caja_ancho: 71.8, caja_alto: 61.6, unidades_caja: 30, peso_unidad: 2.5, divisor_vol: 6000,
  tca: [[5, 52.31], [10, 71.14], [20, 103.14], [50, 149.93], [100, 205.82], [200, 279.5], [350, 381.16], [500, 526.48], [750, 622.56],
    [1000, 750.6], [1500, 880.22], [2000, 1019.95], [2500, 1155.66], [3000, 1359.42], [4000, 1577.46], [5000, 1916.92], [7000, 2279.29],
    [10000, 2742.22], [null, 3258.56]],
  iva_venta_pct: 10.5, gasto_venta: 0, meses_tope: 2,
};

export async function leerConfigCosteo(org: string): Promise<ConfigCosteo> {
  const r = await una<{ valor: Partial<ConfigCosteo> }>("select valor from config_org where organizacion_id = $1 and clave = 'costeo_importacion'", [org]);
  return { ...CONFIG_INICIAL, ...(r?.valor ?? {}) };
}

export async function guardarConfigCosteo(org: string, c: ConfigCosteo) {
  await consulta(`insert into config_org (organizacion_id, clave, valor) values ($1, 'costeo_importacion', $2::jsonb)
                  on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`, [org, JSON.stringify(c)]);
}

export type Envio = {
  fob: number; unidades: number; cajas: number; kg_reales: number; kg_volumetricos: number; kg_cobrables: number;
  flete: number; seguro: number; cif: number; aranceles: number; estadistica: number; iva: number;
  packing: number; awb: number; thc: number; tca: number; gastos_destino: number; despachante: number; gastos_despachante: number;
  costo: number;   // todo lo que se paga y queda como costo (sin IVA, sin el seguro que sólo se declara)
  coef: number;    // costo ÷ FOB: cada producto lleva su parte en proporción a su FOB
};

/** El costo de un envío con `unidades` notebooks por `fob` US$ en total. Todo en US$. */
export function costearEnvio(c: ConfigCosteo, fob: number, unidades: number): Envio {
  const cajas = Math.max(1, Math.ceil(unidades / Math.max(1, c.unidades_caja)));
  const kg_reales = unidades * c.peso_unidad;
  const kg_volumetricos = cajas * (c.caja_largo * c.caja_ancho * c.caja_alto) / c.divisor_vol;
  const kg_cobrables = Math.max(kg_reales, kg_volumetricos);
  const flete = kg_cobrables * c.flete_kg;
  const seguro = fob * c.seguro_pct / 100;
  const cif = fob + flete + seguro;
  const aranceles = cif * c.arancel_pct / 100;
  const estadistica = cif * c.estadistica_pct / 100;
  const iva = (cif + aranceles + estadistica) * c.iva_pct / 100;
  const packing = cajas * c.packing;
  const tramo = c.tca.find(([hasta]) => hasta == null || kg_cobrables <= hasta);
  const tca = tramo ? tramo[1] : 0;
  const despachante = Math.max(cif * c.despachante_pct / 100, c.despachante_min);
  const costo = fob + flete + aranceles + estadistica + packing + c.awb + c.thc + tca + c.gastos_destino + despachante + c.gastos_despachante;
  return {
    fob, unidades, cajas, kg_reales, kg_volumetricos, kg_cobrables, flete, seguro, cif, aranceles, estadistica, iva, packing,
    awb: c.awb, thc: c.thc, tca, gastos_destino: c.gastos_destino, despachante, gastos_despachante: c.gastos_despachante,
    costo, coef: fob > 0 ? costo / fob : 0,
  };
}

/** Ganancia por unidad vendida en Mercado Libre (en $): precio sin IVA de venta, menos la comisión (que trae IVA 21 %),
 *  menos el gasto de venta por unidad, menos el costo nacionalizado. */
export function gananciaVenta(c: ConfigCosteo, precio: number | null, comisionPct: number, costo: number) {
  if (!precio || costo <= 0) return null;
  const neto = precio / (1 + c.iva_venta_pct / 100);
  const comision = precio * comisionPct / 100 / 1.21;
  const ganancia = neto - comision - c.gasto_venta - costo;
  return { ganancia, sobreVenta: ganancia / neto, sobreCosto: ganancia / costo };
}
