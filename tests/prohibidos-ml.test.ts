// Tests puros de lib/mercadolibre/prohibidos.ts: de qué SKU es un alta de la cola (Fer, 29/10, bitácora #986).

import { test } from "node:test";
import assert from "node:assert/strict";
import { skuNormal, skusDeAlta } from "@/lib/mercadolibre/prohibidos";

test("skuNormal saca el DE- de las cuentas DEIROLAB y TIENDAVIRTUAL S", () => {
  assert.equal(skuNormal("DE-SKU00844"), "SKU00844");
  assert.equal(skuNormal("SKU00844"), "SKU00844");
});

test("skusDeAlta: la clave del esquema, del agrupado y de una nueva", () => {
  assert.deepEqual(skusDeAlta({ item_id: "esquema:SKU00844:3x_campaign", payload: null }), ["SKU00844"]);
  assert.deepEqual(skusDeAlta({ item_id: "agrupar:SKU00542-U:clasica", payload: null }), ["SKU00542-U"]);
  assert.deepEqual(skusDeAlta({ item_id: "nueva:SKU01338", payload: null }), ["SKU01338"]);
});

test("skusDeAlta: el SKU del cuerpo del alta, sin DE-", () => {
  const payload = { pedidos: [
    { metodo: "POST", ruta: "/items", cuerpo: { attributes: [{ id: "SELLER_SKU", value_name: "DE-SKU02605" }] } },
    { metodo: "POST", ruta: "/items/{id}/description", cuerpo: { plain_text: "x" } },
  ] };
  assert.deepEqual(skusDeAlta({ item_id: "catalogo:MLA1", payload }), ["SKU02605"]);
});
