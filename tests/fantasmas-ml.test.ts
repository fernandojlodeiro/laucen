// Publicaciones fantasma: la comparación Laucen vs Mercado Libre es pura.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { faltantesEnMl } from "@/lib/mercadolibre/fantasmas";

test("faltantesEnMl: sólo las que Laucen tiene y ML no devolvió, sin repetir y ordenadas", () => {
  const enMl = new Set(["MLA1", "MLA3"]);
  assert.deepEqual(faltantesEnMl(["MLA3", "MLA2", "MLA1", "MLA2", "MLA0"], enMl), ["MLA0", "MLA2"]);
});

test("faltantesEnMl: sin nada de Laucen no falta nada; con ML vacío falta todo", () => {
  assert.deepEqual(faltantesEnMl([], new Set(["MLA1"])), []);
  assert.deepEqual(faltantesEnMl(["MLA1", "MLA1"], new Set()), ["MLA1"]);
});
