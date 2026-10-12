// Catálogo con nuestra marca (lib/mercadolibre/catalogo-propio.ts): qué catálogo se reemplaza y cómo se arma la propuesta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { atributosSugerencia, catalogoAjeno, motivosValidacion, tituloSugerencia } from "@/lib/mercadolibre/catalogo-propio";

test("catalogoAjeno: la marca en la tabla de marcas es competencia de verdad; si no está, es ajeno", () => {
  const tabla = new Set(["asus", "mastech", "oem"]);
  assert.equal(catalogoAjeno("Asus", tabla), false);
  assert.equal(catalogoAjeno("TecnoliveUSA", tabla), true);
  assert.equal(catalogoAjeno("Nubbeo", new Set(["nubbeo"])), true);
  assert.equal(catalogoAjeno("Deirolab", tabla), false);
  assert.equal(catalogoAjeno("Laucen", tabla), false);
  assert.equal(catalogoAjeno("Genérica", tabla), false);
  assert.equal(catalogoAjeno("", tabla), false);
});

test("atributosSugerencia: con la marca de la cuenta y sin lo que es de la publicación", () => {
  const a = atributosSugerencia([
    { id: "BRAND", value_name: "Tiendavirtual" }, { id: "MODEL", value_name: "Gy511" }, { id: "SELLER_SKU", value_name: "SKU1" },
    { id: "GTIN", value_name: "123" }, { id: "SELLER_PACKAGE_WEIGHT", value_name: "20 g" }, { id: "COLOR", value_name: "" }, { id: "VOLTAGE", value_name: "5 V" },
  ], "Deirolab");
  assert.deepEqual(a, [{ id: "BRAND", values: [{ name: "Deirolab" }] }, { id: "MODEL", values: [{ name: "Gy511" }] }, { id: "VOLTAGE", values: [{ name: "5 V" }] }]);
});

test("tituloSugerencia: sin nuestras marcas, con la de la cuenta al final y hasta 60 letras", () => {
  assert.equal(tituloSugerencia("Modulo Gy511 Acelerometro Tiendavirtual", "Deirolab"), "Modulo Gy511 Acelerometro Deirolab");
  const t = tituloSugerencia("Microscopio Digital Usb Zoom 1000x 2mpx 8 Luz Leds Pc Mac Negro Con Soporte Metalico", "Daitom");
  assert.ok(t.length <= 60 && t.endsWith(" Daitom"));
});

test("motivosValidacion: errores y avisos de validations o cause", () => {
  assert.deepEqual(motivosValidacion({ validations: [{ type: "error", message: "A" }, { type: "warning", message: "B" }] }), { errores: ["A"], avisos: ["B"] });
  assert.deepEqual(motivosValidacion({ cause: [{ type: "error", message: "Domain is not active" }] }).errores, ["Domain is not active"]);
  assert.deepEqual(motivosValidacion({ message: "Validation error" }).errores, ["Validation error"]);
});
