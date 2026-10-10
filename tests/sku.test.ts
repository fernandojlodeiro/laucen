// El SKU sugerido (lib/catalogo/sku.ts): sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarSku, numeroDeSku } from "@/lib/catalogo/sku";

test("armarSku: 5 cifras, 6 cuando no entra", () => {
  assert.equal(armarSku(6001), "SKU06001");
  assert.equal(armarSku(99999), "SKU99999");
  assert.equal(armarSku(100000), "SKU100000");
});

test("numeroDeSku: con sufijo cuenta; con otro formato no", () => {
  assert.equal(numeroDeSku("SKU03542"), 3542);
  assert.equal(numeroDeSku("sku03542-BC"), 3542);
  assert.equal(numeroDeSku("SKU1234567"), null);
  assert.equal(numeroDeSku("NB-100"), null);
});
