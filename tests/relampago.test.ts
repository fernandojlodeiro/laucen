// Ofertas relámpago (lib/precios-ml/relampago.ts): lo que se recibe y el precio con que se entra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { precioRelampago, recibis } from "@/lib/precios-ml/relampago";

test("recibis: precio menos comisión menos envío; sin un dato, no se sabe", () => {
  assert.equal(recibis(962_999, 122_949.69, 9_590), 830_459);
  assert.equal(recibis(20_000, 3_000, 0), 17_000);
  assert.equal(recibis(20_000, null, 0), null);
});

test("precioRelampago: el más alto del rango, en pesos enteros", () => {
  assert.equal(precioRelampago(1_575_816.4), 1_575_816);
  assert.equal(precioRelampago(null), null);
});
