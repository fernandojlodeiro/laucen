// Revisión antes de facturar (lib/facturacion/revision.ts): qué se hace con lo que
// leyó la IA. Pura, sin base ni IA.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decidir, firmaDe, type Lectura } from "@/lib/facturacion/revision";
import { cuitCierra } from "@/lib/cuit";

const lectura = (x: Partial<Lectura>): Lectura => ({ decision: "aplicar", leyenda: null, cuit: null, factura_a: false, razon_social: null, domicilio: null, motivo: "", ...x });
// Un CUIT que cierra (el verificador se calcula).
const CUIT = (() => { for (let dv = 0; dv <= 9; dv++) if (cuitCierra(`3071234567${dv}`)) return `3071234567${dv}`; throw new Error("sin cuit"); })();

test("decidir: la leyenda se aplica (ej. el subsidio del CONICET)", () => {
  const d = decidir(lectura({ leyenda: "\"PIP 00484-22 CONICET\"", motivo: "Pide la leyenda del subsidio." }), { cuit: null });
  assert.equal(d.accion, "facturar");
  assert.equal(d.accion === "facturar" && d.leyenda, "PIP 00484-22 CONICET");
});

test("decidir: nada que ver con la factura → se factura sin cambios", () => {
  const d = decidir(lectura({ decision: "nada" }), { cuit: null });
  assert.deepEqual(d.accion === "facturar" && [d.leyenda, d.cuit, d.facturaA], [null, null, false]);
});

test("decidir: duda, o sin lectura → se retiene", () => {
  assert.equal(decidir(lectura({ decision: "duda", motivo: "Quiere partir la factura." }), { cuit: null }).accion, "retener");
  assert.equal(decidir(null, { cuit: null }).accion, "retener");
});

test("decidir: factura A", () => {
  assert.equal(decidir(lectura({ factura_a: true }), { cuit: null }).accion, "retener"); // sin CUIT
  assert.equal(decidir(lectura({ factura_a: true }), { cuit: CUIT }).accion, "facturar"); // el cliente ya lo tiene
  const d = decidir(lectura({ factura_a: true, cuit: `${CUIT.slice(0, 2)}-${CUIT.slice(2, 10)}-${CUIT.slice(10)}` }), { cuit: null });
  assert.equal(d.accion === "facturar" && d.cuit, CUIT);
});

test("decidir: CUIT que no cierra, o razón social sin CUIT → se retiene", () => {
  const malo = `${CUIT.slice(0, 10)}${(Number(CUIT[10]) + 1) % 10}`;
  assert.equal(decidir(lectura({ cuit: malo }), { cuit: null }).accion, "retener");
  assert.equal(decidir(lectura({ razon_social: "Otra SA" }), { cuit: null }).accion, "retener");
});

test("firmaDe: sólo cuenta lo del comprador y las notas", () => {
  const a = firmaDe([{ quien: "Comprador", texto: "Factura A por favor" }]);
  assert.equal(a, firmaDe([{ quien: "Comprador", texto: "Factura A por favor" }, { quien: "Vendedor", texto: "Dale" }]));
  assert.notEqual(a, firmaDe([{ quien: "Comprador", texto: "Factura A por favor" }, { quien: "Comprador", texto: "CUIT 30-…" }]));
});

test("decidir: pedir el envío en la factura se aplica (no se retiene)", () => {
  const d = decidir(lectura({ incluir_envio: true, motivo: "Pide el envío en la factura." }), { cuit: null });
  assert.equal(d.accion === "facturar" && d.incluirEnvio, true);
  const sin = decidir(lectura({ decision: "nada" }), { cuit: null });
  assert.equal(sin.accion === "facturar" && sin.incluirEnvio, false);
});
