// Garantía de 1 año en notebooks: cuándo ya la tienen y qué se manda (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { tieneUnAnio, cuerpoGarantia } from "@/lib/mercadolibre/garantia-notebooks";

test("tieneUnAnio: 12 meses, 1 año o más sí; menos, sin garantía o sin dato no", () => {
  const g = (tipo: string, tiempo?: string) => [{ id: "WARRANTY_TYPE", value_name: tipo }, ...(tiempo ? [{ id: "WARRANTY_TIME", value_name: tiempo }] : [])];
  assert.equal(tieneUnAnio(g("Garantía del vendedor", "12 meses")), true);
  assert.equal(tieneUnAnio(g("Garantía de fábrica", "1 año")), true);
  assert.equal(tieneUnAnio(g("Garantía del vendedor", "2 años")), true);
  assert.equal(tieneUnAnio(g("Garantía del vendedor", "90 días")), false);
  assert.equal(tieneUnAnio(g("Garantía del vendedor", "6 meses")), false);
  assert.equal(tieneUnAnio(g("Sin garantía")), false);
  assert.equal(tieneUnAnio([]), false);
  assert.equal(tieneUnAnio(undefined), false);
});

test("cuerpoGarantia: conserva el tipo salvo 'Sin garantía' y pone 12 meses", () => {
  assert.deepEqual(cuerpoGarantia([{ id: "WARRANTY_TYPE", value_name: "Garantía de fábrica" }]).sale_terms,
    [{ id: "WARRANTY_TYPE", value_name: "Garantía de fábrica" }, { id: "WARRANTY_TIME", value_name: "12 meses" }]);
  assert.deepEqual(cuerpoGarantia([{ id: "WARRANTY_TYPE", value_name: "Sin garantía" }]).sale_terms[0], { id: "WARRANTY_TYPE", value_name: "Garantía del vendedor" });
  assert.deepEqual(cuerpoGarantia([]).sale_terms[0], { id: "WARRANTY_TYPE", value_name: "Garantía del vendedor" });
});
