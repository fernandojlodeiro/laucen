// ¿Avión o barco? (lib/compras/via.ts): flete por kilo cobrable y por m³, costo final con y sin NCM, y la categoría.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_VIA, calcularVia, costoCourier, costoFinal } from "@/lib/compras/via";
import { resolver } from "@/lib/costo-importacion";

const sinNcm = null;
const m = (peso_g: number | null, cbm: number | null) => ({ peso_g, cbm, origen: "packing" as const, exacto: true });

test("sin NCM: (FOB + flete) × 1,30", () => {
  assert.equal(Math.round(costoFinal(10, 3, sinNcm, CONFIG_VIA) * 100) / 100, 16.9);
});

test("con NCM: CIF + derechos, estadística, despachante y depósito + IVA", () => {
  const r = resolver({ derecho_pct: 10, tasa_estadistica_pct: 3, iva_pct: 21 }, [], { seguro_pct: 1, despachante_pct: 1, deposito_pct: 2 });
  // CIF = 10 + 2 + 0,1 = 12,1; derechos 1,21; estadística 0,363; despachante 0,121; depósito 0,242 → 14,036;
  // IVA = (12,1 + 1,21 + 0,363) × 21 % = 2,87133 → 16,90733
  assert.equal(Math.round(costoFinal(10, 2, r, CONFIG_VIA) * 1000) / 1000, 16.907);
});

test("por avión, courier: FOB + flete + 8 % del FOB", () => {
  assert.equal(Math.round(costoCourier(10, 3, CONFIG_VIA) * 100) / 100, 13.8);
});

test("categorías: avión, conviene barco, no rentable, imposible, sin datos", () => {
  // 100 g, chico: flete 1,30 sobre FOB 10 = 13 % → avión.
  assert.equal(calcularVia(10, m(100, 0.0001), 30, sinNcm, CONFIG_VIA).categoria, "avion");
  // 1 kg: flete 13 = 130 % del FOB, pero con precio alto deja margen → conviene barco.
  const b = calcularVia(10, m(1000, 0.001), 60, sinNcm, CONFIG_VIA);
  assert.equal(b.categoria, "barco");
  assert.equal(Math.round(b.flete_aereo_pct!), 130);
  // Volumétrico manda: 0,01 m³ × 167 = 1,67 kg aunque pese 200 g.
  assert.equal(calcularVia(10, m(200, 0.01), 60, sinNcm, CONFIG_VIA).cobrable_kg, 1.67);
  // Gana, pero menos del 10 %: costo 10,8 + 1,3 = 12,1; neto 13 → 6,9 %.
  assert.equal(calcularVia(10, m(100, null), 13, sinNcm, CONFIG_VIA).categoria, "no_rentable");
  // Pierde plata por avión: 10,8 + 13 = 23,8 > 20.
  assert.equal(calcularVia(10, m(1000, null), 20, sinNcm, CONFIG_VIA).categoria, "imposible");
  assert.equal(calcularVia(null, m(100, null), 20, sinNcm, CONFIG_VIA).categoria, "sin_datos");
  assert.equal(calcularVia(10, m(null, null), 20, sinNcm, CONFIG_VIA).categoria, "sin_datos");
});
