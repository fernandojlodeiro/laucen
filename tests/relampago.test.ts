// Ofertas relámpago (lib/precios-ml/relampago.ts): lo que se recibe y el precio con que se entra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { precioRelampago, recibis, costoPct, fechaRelampago, entraSola, stockAuto } from "@/lib/precios-ml/relampago";

test("recibis: precio menos comisión menos envío; sin un dato, no se sabe", () => {
  assert.equal(recibis(962_999, 122_949.69, 9_590), 830_459);
  assert.equal(recibis(20_000, 3_000, 0), 17_000);
  assert.equal(recibis(20_000, null, 0), null);
});

test("precioRelampago: un peso debajo de hoy si entra en el rango, si no el más alto; el elegido a mano, si está en el rango", () => {
  assert.equal(precioRelampago(1_513_000, 1_119_946), 1_119_945);
  assert.equal(precioRelampago(2_000_000, 1_662_807.43), 1_662_807);
  assert.equal(precioRelampago(1_889.1, 2_099), 1_889);
  assert.equal(precioRelampago(800_000, 962_999, 850_000), null);
  assert.equal(precioRelampago(null, 962_999), null);
  assert.equal(precioRelampago(1_513_000, 1_119_946, 336_000, 1_000_000), 1_000_000);
  assert.equal(precioRelampago(1_513_000, 1_119_946, 336_000, 2_000_000), null);
});

test("costoPct: la parte del precio de hoy que no llega, con un decimal", () => {
  assert.equal(costoPct(1_000, 830), 17);
  assert.equal(costoPct(2_099, 1_000), 52.4);
  assert.equal(costoPct(null, 1), null);
});

test("fechaRelampago: lo que dice ML, en hora argentina", () => {
  assert.equal(fechaRelampago("2026-10-15T12:00:00"), "15/10 12:00");
  assert.equal(fechaRelampago("2026-10-15T15:00:00Z"), "15/10 12:00");
  assert.equal(fechaRelampago("2026-10-15T12:00:00-03:00"), "15/10 12:00");
  assert.equal(fechaRelampago(null), null);
});

test("entraSola: hasta 5 % debajo de hoy, con piso alcanzado si hay, con stock", () => {
  const base = { estado: "candidate", rel: 1_119_945, hoy: 1_119_946, alcanza: null, piso: null, stock: 8, stock_min: 5 };
  assert.equal(entraSola(base), true);
  assert.equal(entraSola({ ...base, rel: 1_063_949 }), true, "5 % justo");
  assert.equal(entraSola({ ...base, rel: 1_000_000 }), false, "más de 5 %");
  assert.equal(entraSola({ ...base, piso: 900_000, alcanza: null }), false, "con piso y sin costos leídos, espera");
  assert.equal(entraSola({ ...base, piso: 900_000, alcanza: true }), true);
  assert.equal(entraSola({ ...base, stock: 3 }), false, "no llega al mínimo");
  assert.equal(entraSola({ ...base, estado: "pending" }), false, "ya aceptada");
});

test("stockAuto: todas las unidades hasta el máximo de la oferta, o las elegidas", () => {
  assert.equal(stockAuto({ stock: 19, stock_max: 19, elegido_stock: null }), 19);
  assert.equal(stockAuto({ stock: 40, stock_max: 19, elegido_stock: null }), 19);
  assert.equal(stockAuto({ stock: 40, stock_max: 19, elegido_stock: 6 }), 6);
});
