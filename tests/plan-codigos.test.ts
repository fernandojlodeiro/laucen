// Tests de los códigos del plan de cuentas, sin base: el próximo código libre
// que se sugiere al crear una cuenta (Contabilidad y la vista previa de ARCA),
// la cuenta madre que sale del código, el formato y el orden por partes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { proximoCodigo, madreDe, codigoValido, compararCodigos } from "@/lib/administracion/plan-codigos";

// Lo de egresos del plan por defecto.
const PLAN = [
  { codigo: "4", tipo: "ingreso", imputable: false },
  { codigo: "4.1.01", tipo: "ingreso", imputable: true },
  { codigo: "4.1.02", tipo: "ingreso", imputable: true },
  { codigo: "5", tipo: "egreso", imputable: false, nombre: "EGRESOS" },
  { codigo: "5.1.01", tipo: "egreso", imputable: true },
  { codigo: "5.1.02", tipo: "egreso", imputable: true },
  { codigo: "5.2.01", tipo: "egreso", imputable: true },
  { codigo: "5.2.05", tipo: "egreso", imputable: true },
];

test("plan por defecto: después de 5.2.05 sugiere 5.2.06", () => {
  assert.equal(proximoCodigo(PLAN, "egreso"), "5.2.06");
  assert.equal(proximoCodigo(PLAN, "ingreso"), "4.1.03");
});

test("ordena por partes como números, no como texto", () => {
  const plan = [...PLAN, { codigo: "5.2.9", tipo: "egreso", imputable: true }, { codigo: "5.2.10", tipo: "egreso", imputable: true }];
  assert.equal(proximoCodigo(plan, "egreso"), "5.2.11");
  assert.ok(compararCodigos("5.2.10", "5.2.9") > 0);
  assert.ok(compararCodigos("5.2", "5.2.01") < 0);
  assert.equal(compararCodigos("5.2.06", "5.2.06"), 0);
});

test("respeta los ceros y pasa de 99 a 100", () => {
  assert.equal(proximoCodigo([{ codigo: "5.2.99", tipo: "egreso", imputable: true }], "egreso"), "5.2.100");
  assert.equal(proximoCodigo([{ codigo: "5.2.009", tipo: "egreso", imputable: true }], "egreso"), "5.2.010");
});

test("salta los códigos ya usados por un título u otra cuenta", () => {
  const plan = [...PLAN, { codigo: "5.2.06", tipo: "egreso", imputable: false }, { codigo: "5.2.07", tipo: "activo", imputable: true }];
  assert.equal(proximoCodigo(plan, "egreso"), "5.2.08");
});

test("sin imputables del tipo: la primera bajo su título, o bajo el número del tipo", () => {
  assert.equal(proximoCodigo([{ codigo: "6", tipo: "egreso", imputable: false }], "egreso"), "6.01");
  assert.equal(proximoCodigo([], "egreso"), "5.01");
  assert.equal(proximoCodigo([], "activo"), "1.01");
});

test("la madre es el antecesor más cercano que existe", () => {
  assert.equal(madreDe("5.2.06", PLAN)?.codigo, "5");
  const conTitulo = [...PLAN, { codigo: "5.2", tipo: "egreso", imputable: false }];
  assert.equal(madreDe("5.2.06", conTitulo)?.codigo, "5.2");
  assert.equal(madreDe("7.1", PLAN), null);
  assert.equal(madreDe("5", PLAN), null);
});

test("formato del código", () => {
  for (const c of ["5", "5.2.06", "1.1.01.01"]) assert.ok(codigoValido(c), c);
  for (const c of ["", "5.", ".5", "5..2", "5,2", "5.2a", " 5.2"]) assert.ok(!codigoValido(c), c);
});
