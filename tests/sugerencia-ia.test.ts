// "Respondió <usuario> con la IA": sólo si se mandó EXACTAMENTE la sugerencia (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { igualALaSugerencia } from "@/lib/mercadolibre/sugerencia";

test("igualALaSugerencia: igual, ignorando espacios de los extremos y el tipo de salto de línea", () => {
  assert.equal(igualALaSugerencia("Hola, sí, hay stock.", "Hola, sí, hay stock."), true);
  assert.equal(igualALaSugerencia("  Hola\r\nChau \n", "Hola\nChau"), true);
});

test("igualALaSugerencia: cualquier cambio, o sin sugerencia, es del usuario solo", () => {
  assert.equal(igualALaSugerencia("Hola, sí, hay stock!", "Hola, sí, hay stock."), false);
  assert.equal(igualALaSugerencia("Hola  mundo", "Hola mundo"), false);
  assert.equal(igualALaSugerencia("Hola", null), false);
  assert.equal(igualALaSugerencia("Hola", ""), false);
  assert.equal(igualALaSugerencia("", ""), false);
});
