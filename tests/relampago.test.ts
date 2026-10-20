// Ofertas relámpago (lib/precios-ml/relampago.ts): lo que se recibe y el precio con que se entra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { precioRelampago, recibis, costoPct, fechaRelampago, entraSola, bajaSobre, stockAuto, unaPorProducto, type Relampago } from "@/lib/precios-ml/relampago";

test("recibis: precio menos comisión menos envío; sin un dato, no se sabe", () => {
  assert.equal(recibis(962_999, 122_949.69, 9_590), 830_459);
  assert.equal(recibis(20_000, 3_000, 0), 17_000);
  assert.equal(recibis(20_000, null, 0), null);
});

test("precioRelampago: un peso debajo de hoy si entra en el rango, si no el más alto; el elegido a mano, si está en el rango", () => {
  assert.equal(precioRelampago(1_513_000, 1_119_946), 1_119_945);
  assert.equal(precioRelampago(2_000_000, 1_662_807.43), 1_662_807);
  assert.equal(precioRelampago(1_575_816.4, 962_999), 962_998, "de entrada, un peso debajo de hoy");
  assert.equal(precioRelampago(1_575_816.4, 962_999, 350_181.4, null, 914_849.06), 914_849, "tras el rechazo por «no creíble», el que propone ML");
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

test("entraSola: hasta 5 % debajo del precio del esquema de esa publicación, con piso alcanzado si hay, con stock", () => {
  const base = { estado: "candidate", rel: 1_119_945, base: 1_119_946, alcanza: null, piso: null, stock: 8, stock_min: 5 };
  assert.equal(entraSola(base), true);
  assert.equal(entraSola({ ...base, rel: 1_063_949 }), true, "5 % justo");
  assert.equal(entraSola({ ...base, base: 949_240, rel: 901_778 }), true, "el sugerido de ML, 5 % justo");
  assert.equal(entraSola({ ...base, rel: 1_000_000 }), false, "más de 5 %");
  // Fer, 20/10: la ET5 Premium de DEIROLAB SA: la relámpago a $ 478.082 se mide contra la Premium del esquema
  // ($ 499.999 × (1 − 12,77 %) ÷ (1 − 26,17 %) × 1,08 = $ 638.004), no contra la Clásica: baja 25 % y no entra sola.
  assert.equal(entraSola({ ...base, base: 638_004, rel: 478_082 }), false, "Premium: contra el precio de la Premium del esquema");
  assert.equal(entraSola({ ...base, base: 499_999, rel: 478_082 }), true, "Clásica: contra la Clásica de la lista");
  assert.equal(entraSola({ ...base, base: 499_999, rel: 560_000 }), true, "más cara que el esquema");
  assert.equal(entraSola({ ...base, base: null }), false, "sin precio de esquema no entra sola");
  assert.equal(bajaSobre(478_082, 499_999), 4.4);
  assert.equal(bajaSobre(478_082, 638_004), 25.1);
  assert.equal(bajaSobre(560_000, 499_999), -12);
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

test("unaPorProducto: una publicación por producto, salteando los que ya tienen una relámpago", () => {
  const f = (item_id: string, producto_id: number, estado = "candidate", rel = 100) => ({ item_id, producto_id, estado, rel } as Relampago);
  const cand = [f("A1", 1), f("A2", 1), f("A3", 1), f("B1", 2), f("C1", 3)];
  const todas = [...cand, f("C2", 3, "pending")];
  const r = unaPorProducto(cand, todas, new Map(), () => 0);
  assert.deepEqual(r.map((x) => x.item_id), ["A1", "B1"], "una del 1, la del 2; el 3 ya tiene una aceptada");
  const conEnvio = unaPorProducto(cand, todas, new Map([["B1", { estado: "ok", error: null, precio: 100 }]]), () => 0);
  assert.deepEqual(conEnvio.map((x) => x.item_id), ["A1"], "el 2 ya se mandó");
  const rechazada = unaPorProducto(cand, todas, new Map([["B1", { estado: "error", error: "no creíble", precio: 105 }]]), () => 0);
  assert.deepEqual(rechazada.map((x) => x.item_id), ["A1", "B1"], "rechazada a otro precio: se vuelve a probar");
});
