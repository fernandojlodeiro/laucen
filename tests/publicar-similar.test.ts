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

test("publicar nueva: valores de Laucen (marca del producto manda, medidas del paquete, GTIN sólo si son números)", async () => {
  const { valoresDeLaucen } = await import("@/lib/mercadolibre/publicar-nueva");
  const v = valoresDeLaucen({
    atributos_ml: [{ id: "BRAND", value_name: "Otra" }, { id: "VOLTAGE", value_name: "5 V" }, { id: "VACIO", value_name: " " }],
    marca: "Daitom", modelo: "X1", linea: null, codigo_barras: "SIN-CODIGO", peso_g: 120, largo_cm: 10.5, ancho_cm: null, alto_cm: 3,
  });
  assert.deepEqual(v, { BRAND: "Daitom", VOLTAGE: "5 V", MODEL: "X1", SELLER_PACKAGE_WEIGHT: "120 g", SELLER_PACKAGE_LENGTH: "10,5 cm", SELLER_PACKAGE_HEIGHT: "3 cm" });
  assert.equal(valoresDeLaucen({ atributos_ml: null, marca: null, modelo: null, linea: null, codigo_barras: "7790001234567", peso_g: null, largo_cm: null, ancho_cm: null, alto_cm: null }).GTIN, "7790001234567");
});

test("publicar nueva: atributos cargables y para ML (opción con su código; texto si no coincide; vacío no va)", async () => {
  const { atributosCargables, atributosParaMl } = await import("@/lib/mercadolibre/publicar-nueva");
  const meta = [
    { id: "BRAND", name: "Marca" },
    { id: "COLOR", name: "Color", values: [{ id: "1", name: "Rojo" }] },
    { id: "OCULTO", name: "x", tags: { hidden: true } },
    { id: "SELLER_SKU", name: "SKU" },
    { id: "PACKAGE_WEIGHT", name: "Peso" },
  ];
  assert.deepEqual(atributosCargables(meta).map((a) => a.id), ["BRAND", "COLOR"]);
  assert.deepEqual(atributosParaMl(atributosCargables(meta), { BRAND: "Genérica", COLOR: "rojo", OCULTO: "y", SELLER_SKU: "z" }),
    [{ id: "BRAND", value_name: "Genérica" }, { id: "COLOR", value_id: "1", value_name: "Rojo" }]);
  assert.deepEqual(atributosParaMl(atributosCargables(meta), { COLOR: "Azul", BRAND: "" }), [{ id: "COLOR", value_name: "Azul" }]);
});

test("publicar nueva: cuerpo con family_name (o title), fotos, SKU al final y sin envío si se pide", async () => {
  const { cuerpoNueva } = await import("@/lib/mercadolibre/publicar-nueva");
  const e = { titulo: "Modulo Rele 5v", categoria: "MLA1", precio: 999.5, cantidad: 2, tipo: "gold_special", condicion: "new", fotos: ["https://a/1.jpg"], sku: "SKU9", garantiaTipo: "", garantiaTiempo: "" };
  const c = cuerpoNueva(e, [{ id: "BRAND", value_name: "Genérica" }]);
  assert.equal(c.family_name, "Modulo Rele 5v");
  assert.equal(c.title, undefined);
  assert.equal(c.price, 1000);
  assert.deepEqual(c.pictures, [{ source: "https://a/1.jpg" }]);
  assert.deepEqual(c.attributes, [{ id: "BRAND", value_name: "Genérica" }, { id: "SELLER_SKU", value_name: "SKU9" }]);
  assert.equal(c.sale_terms, undefined);
  const t = cuerpoNueva(e, [], { conTitle: true, sinEnvio: true, sacar: ["BRAND"] });
  assert.equal(t.title, "Modulo Rele 5v");
  assert.equal(t.shipping, undefined);
});

test("publicar nueva en varias cuentas: cada una arranca con otra foto y otro orden de título", async () => {
  const { rotar, variarTitulo } = await import("@/lib/mercadolibre/publicar-nueva");
  assert.deepEqual(rotar(["a", "b", "c"], 0), ["a", "b", "c"]);
  assert.deepEqual(rotar(["a", "b", "c"], 1), ["b", "c", "a"]);
  assert.deepEqual(rotar(["a", "b", "c"], 4), ["b", "c", "a"]);
  assert.deepEqual(rotar(["a"], 3), ["a"]);
  const t = "Modulo Rele 5v 1 Canal Arduino";
  const vs = [0, 1, 2, 3, 4].map((n) => (n === 0 ? t : variarTitulo(t, n)));
  for (const v of vs) assert.deepEqual(v.split(" ").sort(), t.split(" ").sort());
  assert.equal(new Set(vs).size, 5);
  assert.equal(variarTitulo("Cable USB", 2), "Cable USB");
});
