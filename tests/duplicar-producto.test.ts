// Duplicar producto: el plan de SKU de la copia es puro (sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { planSkus } from "@/lib/catalogo/duplicar";

test("planSkus: un simple lleva -COPIA; el SKU de su variación default es el mismo", () => {
  assert.deepEqual(planSkus("NB-100", ["NB-100"], new Set()), { base: "NB-100-COPIA", variaciones: ["NB-100-COPIA"] });
});

test("planSkus: las variaciones que empiezan con el SKU base conservan el resto; las otras se numeran", () => {
  const r = planSkus("ABC", ["ABC-ROJO", "abc-AZUL", "XYZ"], new Set());
  assert.deepEqual(r, { base: "ABC-COPIA", variaciones: ["ABC-COPIA-ROJO", "ABC-COPIA-AZUL", "ABC-COPIA-3"] });
});

test("planSkus: si -COPIA está ocupado (el SKU base o el de una variación) sigue con -COPIA2, -COPIA3", () => {
  assert.equal(planSkus("ABC", ["ABC"], new Set(["abc-copia"])).base, "ABC-COPIA2");
  assert.equal(planSkus("ABC", ["ABC-ROJO"], new Set(["abc-copia-rojo", "abc-copia2-rojo"])).base, "ABC-COPIA3");
});
