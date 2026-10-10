// Qué catálogo de ML se usa al publicar, según su marca. Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirCatalogo } from "@/lib/mercadolibre/catalogo-marca";

test("decidirCatalogo: marca nuestra entra; vetada no se publica; página de otra marca no entra; catálogo de fábrica entra", () => {
  assert.equal(decidirCatalogo("DAITOM", "flex"), "entra");
  assert.equal(decidirCatalogo("Deirolab", "catalog_product"), "entra");
  assert.equal(decidirCatalogo("Libercam", "catalog_product"), "no_publicar");
  assert.equal(decidirCatalogo("ST  Smart Tech", "flex"), "no_publicar");
  assert.equal(decidirCatalogo("Riotecno", "flex"), "no_entra");
  assert.equal(decidirCatalogo("Mastech", "catalog_product"), "entra");
  assert.equal(decidirCatalogo(null, "flex"), "no_entra");
});
