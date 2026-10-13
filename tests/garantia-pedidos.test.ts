// La garantía como texto, a partir de las condiciones de venta de ML (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { garantiaDeTerminos } from "@/lib/garantia";

test("garantiaDeTerminos: tipo y tiempo; sin garantía; sin dato", () => {
  assert.equal(garantiaDeTerminos([{ id: "WARRANTY_TYPE", value_name: "Garantía del vendedor" }, { id: "WARRANTY_TIME", value_name: "12 meses" }]), "Garantía del vendedor · 12 meses");
  assert.equal(garantiaDeTerminos([{ id: "WARRANTY_TYPE", value_name: "Garantía de fábrica" }, { id: "WARRANTY_TIME", value_name: "6 meses" }, { id: "OTRO", value_name: "x" }]), "Garantía de fábrica · 6 meses");
  assert.equal(garantiaDeTerminos([{ id: "WARRANTY_TYPE", value_name: "Sin garantía" }]), "Sin garantía");
  assert.equal(garantiaDeTerminos([{ id: "INSTALLMENTS_CAMPAIGN", value_name: "x" }]), null);
  assert.equal(garantiaDeTerminos(undefined), null);
});
