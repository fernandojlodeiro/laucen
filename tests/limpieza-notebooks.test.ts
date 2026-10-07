// Limpieza de notebooks (bitácora #425): qué SKU se conservan y de dónde salen los de una publicación de ML.

import { test } from "node:test";
import assert from "node:assert/strict";
import { seConserva, skusDeItem } from "@/lib/limpieza-notebooks";

test("se conservan los de la lista, sin importar mayúsculas ni el DE- de DEIROLAB", () => {
  assert.equal(seConserva(["14-dk1022wm"]), true);
  assert.equal(seConserva(["DE-G3-3500"]), true);
  assert.equal(seConserva([" g3-3500-1 "]), true);
  assert.equal(seConserva(["F412DA-NH77-12GB"]), true);
  assert.equal(seConserva(["81WE011UUS"]), false);
  assert.equal(seConserva(["G3-3500-2", ""]), false);
  assert.equal(seConserva([]), false);
});

test("los SKU de una publicación: el suyo, el atributo y los de sus variaciones", () => {
  const it = {
    id: "MLA1", seller_custom_field: null,
    attributes: [{ id: "BRAND", value_name: "Dell" }, { id: "SELLER_SKU", value_name: "G3-3500-1" }],
    variations: [{ seller_custom_field: "X1", attributes: [] }, { attributes: [{ id: "SELLER_SKU", value_name: "X2" }] }],
  };
  assert.deepEqual(skusDeItem(it), ["G3-3500-1", "X1", "X2"]);
  assert.deepEqual(skusDeItem({ id: "MLA2" }), []);
});
