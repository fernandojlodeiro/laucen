// Planes de cuotas en un mismo producto de ML (lib/mercadolibre/agrupar.ts): la receta del lote 140 (22/10).
import test from "node:test";
import assert from "node:assert/strict";
import { cuerpoAgrupado, type ItemMadre } from "@/lib/mercadolibre/agrupar";

const madre: ItemMadre = {
  id: "MLA856187270", family_name: "Impresora 3d Anet A8 Fdm Kit Diy 22x22mm Sd Lcd Pla Abs", title: "Impresora 3d Anet A8 (título que arma ML)",
  category_id: "MLA372127", price: 400000, currency_id: "ARS", buying_mode: "buy_it_now", condition: "new", listing_type_id: "gold_special",
  channels: ["marketplace"], official_store_id: 442648,
  pictures: [{ secure_url: "https://http2.mlstatic.com/a.jpg" }, { url: "http://http2.mlstatic.com/b.jpg" }],
  attributes: [
    { id: "BRAND", value_id: "123", value_name: "Anet" }, { id: "GTIN", value_id: "-1", value_name: null },
    { id: "PACKAGE_WEIGHT", value_name: "3 kg" }, { id: "SELLER_SKU", value_name: "SKU03373" }, { id: "IS_TOM_BRAND", value_name: "No" },
  ],
  sale_terms: [{ id: "WARRANTY_TYPE", value_id: "2230280", value_name: "Garantía del vendedor" }, { id: "WARRANTY_TIME", value_name: "6 meses" },
    { id: "INSTALLMENTS_CAMPAIGN", value_name: "3x_campaign" }, { id: "INVOICE", value_id: "6891885", value_name: "Factura A" }],
};

test("el plan copia la madre de la misma cuenta: nombre, tienda oficial, canales, garantía y factura", () => {
  const c = cuerpoAgrupado(madre, "3x_campaign", 545453, 10);
  assert.equal(c.family_name, madre.family_name);
  assert.equal(c.official_store_id, 442648);
  assert.deepEqual(c.channels, ["marketplace"]);
  assert.deepEqual(c.sale_terms, [{ id: "WARRANTY_TYPE", value_id: "2230280" }, { id: "WARRANTY_TIME", value_name: "6 meses" }, { id: "INVOICE", value_id: "6891885" }]);
  assert.equal(c.listing_type_id, "gold_pro");
  assert.deepEqual(c.tags, ["3x_campaign"]);
  assert.equal(c.price, 545453);
  assert.deepEqual(c.shipping, { mode: "me2" });
  assert.deepEqual(c.pictures, [{ source: "https://http2.mlstatic.com/a.jpg" }, { source: "http://http2.mlstatic.com/b.jpg" }]);
});

test("atributos: los de la madre con SELLER_SKU, sin los que calcula ML ni los vacíos", () => {
  const ids = (cuerpoAgrupado(madre, "premium", 1, 1).attributes as { id: string }[]).map((a) => a.id);
  assert.deepEqual(ids, ["BRAND", "SELLER_SKU"]);
});

test("Clásica y Premium sin marca de plan; la Clásica es gold_special", () => {
  const cl = cuerpoAgrupado(madre, "clasica", 1, 1);
  assert.equal(cl.listing_type_id, "gold_special");
  assert.equal(cl.tags, undefined);
  assert.equal(cuerpoAgrupado(madre, "premium", 1, 1).tags, undefined);
});
