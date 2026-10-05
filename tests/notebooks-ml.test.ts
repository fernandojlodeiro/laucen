// Notebooks no activas en ML: qué es una notebook y cuándo hay que eliminarla (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { esNotebook, hayQueEliminar } from "@/lib/mercadolibre/notebooks";

test("esNotebook: la categoría Notebooks, o un título que empieza con Notebook; un accesorio no", () => {
  assert.equal(esNotebook("Notebook Dell Core I5 1035g1", "MLA1000"), true);
  assert.equal(esNotebook("  notebook asus", null), true);
  assert.equal(esNotebook("Lo que sea", "MLA1652"), true);
  assert.equal(esNotebook("Cargador Para Notebook Dell 65w", "MLA3794"), false);
  assert.equal(esNotebook("Notebookera de cuero", null), false);
  assert.equal(esNotebook(null, null), false);
});

test("hayQueEliminar: toda no activa, salvo la que ML ya tiene eliminada", () => {
  assert.equal(hayQueEliminar("active", []), false);
  assert.equal(hayQueEliminar("paused", ["out_of_stock"]), true);
  assert.equal(hayQueEliminar("closed", []), true);
  assert.equal(hayQueEliminar("closed", ["deleted"]), false);
  assert.equal(hayQueEliminar("under_review", undefined), true);
  assert.equal(hayQueEliminar(undefined, []), false);
});
