// Ofertas relámpago (lib/precios-ml/relampago.ts): lo que se recibe y el precio con que se entra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { precioRelampago, recibis, costoPct, fechaRelampago } from "@/lib/precios-ml/relampago";

test("recibis: precio menos comisión menos envío; sin un dato, no se sabe", () => {
  assert.equal(recibis(962_999, 122_949.69, 9_590), 830_459);
  assert.equal(recibis(20_000, 3_000, 0), 17_000);
  assert.equal(recibis(20_000, null, 0), null);
});

test("precioRelampago: el de hoy si entra en el rango, si no el más alto; el elegido a mano, si está en el rango", () => {
  assert.equal(precioRelampago(1_513_000, 1_119_946), 1_119_946);
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
