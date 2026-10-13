// Garantía de 1 año en notebooks: cuándo ya está como se va a mandar y qué se manda (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { yaEstaIgual, cuerpoGarantia } from "@/lib/mercadolibre/garantia-notebooks";

test("yaEstaIgual: sólo vendedor + 12 meses; cualquier otra cosa se cambia", () => {
  const g = (tipo: string, tiempo?: string) => [{ id: "WARRANTY_TYPE", value_name: tipo }, ...(tiempo ? [{ id: "WARRANTY_TIME", value_name: tiempo }] : [])];
  assert.equal(yaEstaIgual(g("Garantía del vendedor", "12 meses")), true);
  assert.equal(yaEstaIgual(g("Garantía de fábrica", "12 meses")), false);
  assert.equal(yaEstaIgual(g("Garantía del vendedor", "90 días")), false);
  assert.equal(yaEstaIgual(g("Sin garantía")), false);
  assert.equal(yaEstaIgual([]), false);
  assert.equal(yaEstaIgual(undefined), false);
});

test("cuerpoGarantia: siempre vendedor y 12 meses", () => {
  assert.deepEqual(cuerpoGarantia().sale_terms,
    [{ id: "WARRANTY_TYPE", value_name: "Garantía del vendedor" }, { id: "WARRANTY_TIME", value_name: "12 meses" }]);
});
