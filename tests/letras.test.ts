// El importe en letras del presupuesto (lib/letras.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { numeroEnLetras, enLetras } from "@/lib/letras";

test("números en letras", () => {
  assert.equal(numeroEnLetras(0), "cero");
  assert.equal(numeroEnLetras(1), "uno");
  assert.equal(numeroEnLetras(21), "veintiuno");
  assert.equal(numeroEnLetras(100), "cien");
  assert.equal(numeroEnLetras(101), "ciento uno");
  assert.equal(numeroEnLetras(1000), "mil");
  assert.equal(numeroEnLetras(21000), "veintiún mil");
  assert.equal(numeroEnLetras(120530), "ciento veinte mil quinientos treinta");
  assert.equal(numeroEnLetras(1_000_000), "un millón");
  assert.equal(numeroEnLetras(2_345_678), "dos millones trescientos cuarenta y cinco mil seiscientos setenta y ocho");
  assert.equal(numeroEnLetras(31_000_001), "treinta y un millones uno");
});

test("importes", () => {
  assert.equal(enLetras(120530.5, "ARS"), "Son pesos ciento veinte mil quinientos treinta con 50/100.");
  assert.equal(enLetras(21, "USD"), "Son dólares estadounidenses veintiún con 00/100.");
  assert.equal(enLetras(2_000_000, "ARS"), "Son dos millones de pesos con 00/100.");
});
