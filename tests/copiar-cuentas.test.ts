// Copiar entre cuentas de ML: lo puro (título, fotos, SKU, cuerpo del alta). Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarCuerpoCopia, claveProducto, motivoNoCopiable, rotarFotos, skuDestino, variarTitulo, type ItemGuardado } from "@/lib/mercadolibre/copiar";

// Un item de verdad (BAIRES, 5/10), recortado.
const ITEM: ItemGuardado = {
  id: "MLA668323386", status: "active", title: "Transistor Stf 20nf20 F20nf20 Mosfet N-ch 200v 18a-220fp",
  family_name: "Transistor Stf 20nf20 F20nf20 Mosfet N-ch 200v 18a-220fp", category_id: "MLA380650", price: 2551, currency_id: "ARS",
  available_quantity: 1, buying_mode: "buy_it_now", condition: "new", listing_type_id: "gold_special", channels: ["marketplace"],
  pictures: [{ secure_url: "https://http2.mlstatic.com/a.webp" }, { secure_url: "https://http2.mlstatic.com/b.webp" }],
  attributes: [
    { id: "BRAND", value_id: "54059554", value_name: "Daitom" }, { id: "GTIN", value_id: "-1", value_name: null },
    { id: "SELLER_SKU", value_name: "SKU00040" }, { id: "MAX_SUPPORTED_CURRENT", value_id: null, value_name: "18 A" }, { id: "VACIO", value_id: null, value_name: null },
  ],
  sale_terms: [], shipping: { mode: "me2", local_pick_up: false, free_shipping: false }, catalog_listing: false,
};

test("variarTitulo: la primera palabra queda y la segunda mitad del resto pasa adelante; mismas palabras", () => {
  const v = variarTitulo(ITEM.title!);
  assert.equal(v, "Transistor N-ch 200v 18a-220fp Stf 20nf20 F20nf20 Mosfet");
  assert.deepEqual(v.split(" ").sort(), ITEM.title!.split(" ").sort());
  assert.equal(variarTitulo("Cable USB"), "Cable USB");
});

test("rotarFotos: la primera pasa al final", () => {
  assert.deepEqual(rotarFotos(["a", "b", "c"]), ["b", "c", "a"]);
  assert.deepEqual(rotarFotos(["a"]), ["a"]);
});

test("skuDestino: saca el DE- y pone el prefijo de la cuenta", () => {
  assert.equal(skuDestino("DE-SKU1", ""), "SKU1");
  assert.equal(skuDestino("SKU1", "DE-"), "DE-SKU1");
  assert.equal(skuDestino("de-SKU1", "DE-"), "DE-SKU1");
});

test("claveProducto: el SKU sin DE- manda; sin SKU, el título sin tildes ni signos", () => {
  assert.equal(claveProducto("DE-SKU1", "x"), claveProducto("sku1", "y"));
  assert.equal(claveProducto(null, "Cable  Ñandú, USB"), claveProducto("", "cable nandu usb"));
});

test("motivoNoCopiable: sólo activas, sin catálogo ni variaciones", () => {
  assert.equal(motivoNoCopiable(ITEM), null);
  assert.match(motivoNoCopiable({ ...ITEM, status: "paused" })!, /activa/);
  assert.match(motivoNoCopiable({ ...ITEM, catalog_listing: true })!, /catálogo/);
  assert.match(motivoNoCopiable({ ...ITEM, variations: [{}] })!, /variaciones/);
});

test("armarCuerpoCopia: family_name (no title), sin lo propio de la cuenta, SKU de destino y fotos rotadas", () => {
  const c = armarCuerpoCopia(ITEM, "DE-SKU00040", { variarTitulo: true, rotarFotos: true }) as Record<string, unknown> & { attributes: { id: string; value_name?: string }[]; pictures: { source: string }[] };
  assert.equal(c.family_name, "Transistor N-ch 200v 18a-220fp Stf 20nf20 F20nf20 Mosfet");
  assert.equal("title" in c, false);
  assert.deepEqual(c.pictures.map((p) => p.source), ["https://http2.mlstatic.com/b.webp", "https://http2.mlstatic.com/a.webp"]);
  assert.deepEqual(c.attributes.filter((a) => a.id === "SELLER_SKU"), [{ id: "SELLER_SKU", value_name: "DE-SKU00040" }]);
  assert.equal(c.attributes.some((a) => a.id === "GTIN" || a.id === "VACIO"), false);
  for (const k of ["official_store_id", "catalog_product_id", "catalog_listing", "user_product_id", "id", "seller_custom_field"]) assert.equal(k in c, false);
  assert.deepEqual(c.shipping, { mode: "me2", local_pick_up: false, free_shipping: false });
  assert.equal(c.price, 2551);
});

test("armarCuerpoCopia: sin opciones, el título y las fotos quedan como están; sin family_name usa title", () => {
  const c = armarCuerpoCopia({ ...ITEM, family_name: null }, null, { variarTitulo: false, rotarFotos: false }) as { title: string; pictures: { source: string }[]; attributes: { id: string }[] };
  assert.equal(c.title, ITEM.title);
  assert.equal(c.pictures[0].source, "https://http2.mlstatic.com/a.webp");
  assert.equal(c.attributes.some((a) => a.id === "SELLER_SKU"), false);
});
