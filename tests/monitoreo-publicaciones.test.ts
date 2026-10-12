// Monitoreo de precios y publicaciones (lib/monitoreo/publicaciones.ts): la cucarda
// y quién gana cada plan. Pura, sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { descuentoVisto, armarBloques, type Fila } from "@/lib/monitoreo/publicaciones";

const fila = (x: Partial<Fila>): Fila => ({ pub: 1, item: "MLA1", canal: 1, variacion: 10, producto: 100, sku: "SKU1", titulo: "Cosa", familia: null,
  plan: "clasica", precio: 1000, tachado: null, catalogo: false, recuadro: null, clasica: 1000, foto: null, ...x });
const sinEsquema = () => ({ cuenta: null, excepcion: false });

test("descuentoVisto: el % OFF redondeado, sólo si el tachado es mayor", () => {
  assert.equal(descuentoVisto(800, 1000), 20);
  assert.equal(descuentoVisto(1000, 1000), null);
  assert.equal(descuentoVisto(1000, null), null);
  assert.equal(descuentoVisto(null, 1000), null);
  assert.equal(descuentoVisto(996, 1000), null); // redondea a 0
});

test("armarBloques: planes en orden y gana la más barata", () => {
  const [b] = armarBloques([
    fila({ pub: 1, canal: 1, plan: "premium", precio: 1200 }),
    fila({ pub: 2, canal: 2, plan: "premium", precio: 1100 }),
    fila({ pub: 3, canal: 1, plan: "clasica", precio: 1000 }),
  ], sinEsquema);
  assert.deepEqual(b.planes.map((p) => p.plan), ["clasica", "premium"]);
  const premium = b.planes[1];
  assert.equal(premium.ganador, 2);
  assert.equal(premium.celdas[2][0].gana, true);
  assert.equal(premium.celdas[1][0].gana, false);
  assert.deepEqual(b.raro, []);
});

test("armarBloques: avisa si gana otra cuenta que la del esquema, salvo excepción", () => {
  const filas = [fila({ pub: 1, canal: 1, precio: 1200 }), fila({ pub: 2, canal: 2, precio: 1100 })];
  assert.equal(armarBloques(filas, () => ({ cuenta: 1, excepcion: false }))[0].raro.length, 1);
  assert.equal(armarBloques(filas, () => ({ cuenta: 2, excepcion: false }))[0].raro.length, 0);
  assert.equal(armarBloques(filas, () => ({ cuenta: 1, excepcion: true }))[0].raro.length, 0);
});

test("armarBloques: avisa si en un plan unas tienen % OFF y otras no", () => {
  const [b] = armarBloques([fila({ pub: 1, canal: 1, precio: 900, tachado: 1000 }), fila({ pub: 2, canal: 2, precio: 950 })], sinEsquema);
  assert.equal(b.raro.length, 1);
  assert.equal(b.planes[0].celdas[1][0].off, 10);
});
