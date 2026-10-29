// Revisión antes de facturar (lib/facturacion/revision.ts): qué se hace con lo que
// leyó la IA. Pura, sin base ni IA.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decidir, domicilioDe, firmaDe, retenidaPorLaLectura, type Lectura } from "@/lib/facturacion/revision";
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

test("decidir: la condición que dice el comprador pasa; si no dice nada, null", () => {
  const a = decidir(lectura({ cuit: CUIT, condicion_iva: "monotributo" }), { cuit: null });
  assert.equal(a.accion === "facturar" && a.condicionIva, "monotributo");
  const b = decidir(lectura({ cuit: CUIT }), { cuit: null });
  assert.equal(b.accion === "facturar" && b.condicionIva, null);
  const c = decidir(lectura({ cuit: CUIT, condicion_iva: "otra cosa" }), { cuit: null });
  assert.equal(c.accion === "facturar" && c.condicionIva, null);
});

test("retenidaPorLaLectura: la retención por duda de la lectura se vuelve a leer; la de otra cosa, no (pedido 150490)", () => {
  const motivo = "Pide cambiar la factura ya hecha: no envió los datos correctos.";
  assert.equal(retenidaPorLaLectura({ retenida: motivo, revision: { decision: "duda", motivo, firma: "x" } }), true);
  assert.equal(retenidaPorLaLectura({ retenida: "No se pudo refacturar solo: ARCA no contestó", revision: { decision: "duda", motivo, firma: "x" } }), false);
  assert.equal(retenidaPorLaLectura({ retenida: null, revision: { decision: "duda", motivo } }), false);
  assert.equal(retenidaPorLaLectura({ retenida: motivo, revision: null }), false);
});

test("decidir: el domicilio que dio el comprador para la factura viaja en partes (pedido 150490)", () => {
  const l: Lectura = { decision: "aplicar", leyenda: null, cuit: "20-28456276-4", factura_a: true, razon_social: "AMILIVIA NELSON SEBASTIAN", motivo: "Pide rehacer la A",
    domicilio: { calle: "CONGRESAL ACEVEDO S/N", localidad: "Valle Viejo", provincia: "Catamarca", codigo_postal: "4705" } };
  const d = decidir(l, { cuit: null });
  assert.equal(d.accion, "facturar");
  assert.deepEqual(d.accion === "facturar" && d.domicilio, { calle: "CONGRESAL ACEVEDO S/N", localidad: "Valle Viejo", provincia: "Catamarca", codigo_postal: "4705" });
});

test("domicilioDe: sin calle no hay domicilio; un texto suelto va entero como calle", () => {
  assert.equal(domicilioDe(null), null);
  assert.equal(domicilioDe({ calle: " ", localidad: "Valle Viejo", provincia: null, codigo_postal: null }), null);
  assert.deepEqual(domicilioDe("Congresal Acevedo S/N, Valle Viejo"), { calle: "Congresal Acevedo S/N, Valle Viejo", localidad: null, provincia: null, codigo_postal: null });
});
