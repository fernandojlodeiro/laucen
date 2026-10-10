// Seguimiento de publicaciones (lib/seguimiento/): cómo se lee un resultado de Apify. Sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aPubEncontrada } from "@/lib/seguimiento";

test("aPubEncontrada: lo que trae el lector de Mercado Libre de Apify", () => {
  const p = aPubEncontrada({
    type: "product", id: "MLA2051561717", title: "Deposito Jardin Galpon", url: "https://articulo.mercadolibre.com.ar/MLA-2051561717",
    sponsored: true, price: 394999, originalPrice: 999999, currency: "ARS", image: "https://http2.mlstatic.com/x.webp",
    sellerName: "NICTOM", officialStore: true, freeShipping: true, installments: "6 cuotas de $88.868",
  });
  assert.equal(p?.itemId, "MLA2051561717");
  assert.equal(p?.precio, 394999);
  assert.equal(p?.precioOriginal, 999999);
  assert.equal(p?.vendedor, "NICTOM");
  assert.equal(p?.tiendaOficial, true);
  assert.equal(p?.publicidad, true);
  assert.equal(p?.catalogoId, null);
});

test("aPubEncontrada: una de catálogo toma la publicación del wid y el catálogo de la dirección", () => {
  const p = aPubEncontrada({ title: "Placa", url: "https://www.mercadolibre.com.ar/placa/p/MLA12345678", clickUrl: "https://click1.x/?a=1&wid=MLA1499999999&sid=s", price: 100 });
  assert.equal(p?.itemId, "MLA1499999999");
  assert.equal(p?.catalogoId, "MLA12345678");
  assert.equal(aPubEncontrada({ title: "sin número" }), null);
});

test("aPubEncontrada: un «producto de vendedor» (MLAU) también se puede seguir; el catálogo nunca es la misma publicación", () => {
  const p = aPubEncontrada({ title: "Servo", url: "https://www.mercadolibre.com.ar/servo/up/MLAU1234567890", price: 10 });
  assert.equal(p?.itemId, "MLAU1234567890");
  const q = aPubEncontrada({ id: "MLA2118082764", url: "https://www.mercadolibre.com.ar/x/p/MLA2118082764", price: 10 });
  assert.equal(q?.catalogoId, null);
});
