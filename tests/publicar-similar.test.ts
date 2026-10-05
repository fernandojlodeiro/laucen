// Publicar en ML copiando una publicación parecida: lo puro (palabras, parecido,
// cuáles sirven de modelo, cambios en los atributos). Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarCambios, motivoNoSirve, palabras, puntaje, skuComparable, skuRaiz } from "@/lib/mercadolibre/publicar-similar";

test("palabras: sin tildes, signos ni palabras vacías; sin repetir", () => {
  assert.deepEqual(palabras("Módulo Relé de 5V, para Arduino — relé"), ["modulo", "rele", "5v", "arduino"]);
  assert.deepEqual(palabras(null), []);
});

test("skuComparable: sin DE- y en mayúscula", () => {
  assert.equal(skuComparable("de-sku01"), "SKU01");
  assert.equal(skuComparable(" SKU02 "), "SKU02");
});

test("puntaje: mismo SKU manda; si no, la parte de las palabras buscadas que están en el título", () => {
  const skus = new Set(["SKU03409"]);
  const buscadas = palabras("Nodemcu Esp32 Wifi Bluetooth");
  assert.equal(puntaje({ sku: "DE-SKU03409", titulo: "otra cosa" }, skus, buscadas), 1000);
  // El pack de la unidad (o al revés): misma raíz de SKU.
  assert.equal(skuRaiz("SKU00715-U"), "SKU00715");
  assert.equal(puntaje({ sku: "SKU00715", titulo: "Pack X5" }, new Set(["SKU00715-U"]), []), 500);
  assert.equal(puntaje({ sku: null, titulo: "Nodemcu Esp32 Wifi Bluetooth 4.2 38 Pines" }, skus, buscadas), 100);
  assert.equal(puntaje({ sku: "X", titulo: "Placa Esp32 Wifi" }, skus, buscadas), 50);
  assert.equal(puntaje({ sku: "X", titulo: "Cable USB" }, skus, buscadas), 0);
  // Singular y plural cuentan igual (desde 4 letras).
  assert.equal(puntaje({ sku: null, titulo: "Resistencias 1k" }, new Set(), palabras("resistencia")), 100);
});

test("motivoNoSirve: catálogo, variaciones, sin fotos o sin categoría no sirven", () => {
  const ok = { catalogo: false, variaciones: 0, fotos: 3, categoria: "MLA1" };
  assert.equal(motivoNoSirve(ok), null);
  assert.match(motivoNoSirve({ ...ok, catalogo: true })!, /catálogo/);
  assert.match(motivoNoSirve({ ...ok, variaciones: 2 })!, /variaciones/);
  assert.match(motivoNoSirve({ ...ok, fotos: 0 })!, /fotos/);
  assert.match(motivoNoSirve({ ...ok, categoria: null })!, /datos/);
});

test("aplicarCambios: igual queda con su código; cambiado va como texto; vacío no se manda; lo que no vino queda", () => {
  const lista = [
    { id: "BRAND", name: "Marca", value_id: "1", value_name: "Daitom" },
    { id: "MODEL", name: "Modelo", value_id: "2", value_name: "A1" },
    { id: "COLOR", name: "Color", value_id: "3", value_name: "Rojo" },
    { id: "LINE", name: "Línea", value_id: null, value_name: "X" },
  ];
  const r = aplicarCambios(lista, { BRAND: "Daitom", MODEL: " B2 ", COLOR: "" });
  assert.deepEqual(r, [
    { id: "BRAND", name: "Marca", value_id: "1", value_name: "Daitom" },
    { id: "MODEL", name: "Modelo", value_id: null, value_name: "B2" },
    { id: "LINE", name: "Línea", value_id: null, value_name: "X" },
  ]);
});

test("estadoMarca: nuestra o genérica se puede; la de otro no; sin marca, a revisar", async () => {
  const { estadoMarca } = await import("@/lib/mercadolibre/catalogo-similar");
  const propias = new Set(["daitom", "deirolab"]);
  assert.equal(estadoMarca("Daitom", propias), "propia");
  assert.equal(estadoMarca("DEIROLAB", propias), "propia");
  assert.equal(estadoMarca("Genérica", propias), "generica");
  assert.equal(estadoMarca("Sin marca", propias), "generica");
  assert.equal(estadoMarca("Arduino", propias), "ajena");
  assert.equal(estadoMarca(null, propias), "sin_dato");
});

test("cuerpoCatalogo: catálogo + SKU + garantía; sin tiempo si es 'Sin garantía'", async () => {
  const { cuerpoCatalogo } = await import("@/lib/mercadolibre/catalogo-similar");
  const base = { catalogoId: "MLA123", categoria: "MLA1", precio: 1234.6, cantidad: 3.7, tipo: "gold_special", sku: "SKU01", garantiaTipo: "Garantía del vendedor", garantiaTiempo: "30 días" };
  const c = cuerpoCatalogo(base);
  assert.equal(c.catalog_product_id, "MLA123");
  assert.equal(c.catalog_listing, true);
  assert.equal(c.price, 1235);
  assert.equal(c.available_quantity, 3);
  assert.deepEqual(c.attributes, [{ id: "SELLER_SKU", value_name: "SKU01" }]);
  assert.deepEqual(c.sale_terms, [{ id: "WARRANTY_TYPE", value_name: "Garantía del vendedor" }, { id: "WARRANTY_TIME", value_name: "30 días" }]);
  assert.equal(c.family_name, undefined);
  const sin = cuerpoCatalogo({ ...base, garantiaTipo: "Sin garantía" }, { sinEnvio: true, nombre: "Placa X" });
  assert.deepEqual(sin.sale_terms, [{ id: "WARRANTY_TYPE", value_name: "Sin garantía" }]);
  assert.equal(sin.shipping, undefined);
  assert.equal(sin.family_name, "Placa X");
});
