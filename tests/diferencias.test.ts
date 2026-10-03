// Tests sin base de las dos diferencias que se asientan solas: la diferencia
// de cambio de una imputación de cuenta corriente (y de una transferencia
// entre monedas) y la diferencia entre lo facturado y lo recibido en una
// factura de compra vinculada a una recepción.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pesosDeSuFecha, diferenciaDeCambio, lineasDiferenciaCambio, lineaDiferenciaTransferencia,
  diferenciasRecepcion, cubiertoPorFactura, lineasDiferenciaRecepcion,
} from "@/lib/administracion/diferencias";

const rol = { proveedores: 1, deudores: 2, diferencia_cambio_positiva: 3, diferencia_cambio_negativa: 4, diferencias_recepcion: 5, mercaderias: 6 };

// ── Diferencia de cambio ───────────────────────────────────

// Factura de US$1.000 registrada con el dólar a $1.000 ($1.000.000).
const factura = { importe: 1000, importeArs: 1_000_000 };

test("los pesos de lo cancelado salen de la cotización con que se registró el renglón", () => {
  assert.equal(pesosDeSuFecha({ cancelado: 1000, ...factura }), 1_000_000);
  assert.equal(pesosDeSuFecha({ cancelado: 250, ...factura }), 250_000);
  // Un renglón en pesos (orden de pago, importe negativo): tal cual.
  assert.equal(pesosDeSuFecha({ cancelado: 300_000, importe: -500_000, importeArs: -500_000 }), 300_000);
});

test("proveedor: se paga en pesos con el dólar más alto → diferencia negativa (pérdida)", () => {
  // Orden de pago de $1.500.000 con el dólar a $1.200: cancela US$1.000 usando $1.200.000.
  const dif = diferenciaDeCambio({ cancelado: 1000, ...factura }, { cancelado: 1_200_000, importe: -1_500_000, importeArs: -1_500_000 });
  assert.equal(dif, 200_000);
  assert.deepEqual(lineasDiferenciaCambio("proveedor", dif, rol), [
    { cuentaId: rol.diferencia_cambio_negativa, debe: 200_000 },
    { cuentaId: rol.proveedores, haber: 200_000 },
  ]);
});

test("proveedor: el dólar bajó → diferencia positiva (ganancia)", () => {
  const dif = diferenciaDeCambio({ cancelado: 1000, ...factura }, { cancelado: 900_000, importe: -900_000, importeArs: -900_000 });
  assert.equal(dif, -100_000);
  assert.deepEqual(lineasDiferenciaCambio("proveedor", dif, rol), [
    { cuentaId: rol.proveedores, debe: 100_000 },
    { cuentaId: rol.diferencia_cambio_positiva, haber: 100_000 },
  ]);
});

test("cliente: se cobra más pesos de lo que valía la deuda → ganancia; menos → pérdida", () => {
  assert.deepEqual(lineasDiferenciaCambio("cliente", 5000, rol), [
    { cuentaId: rol.deudores, debe: 5000 },
    { cuentaId: rol.diferencia_cambio_positiva, haber: 5000 },
  ]);
  assert.deepEqual(lineasDiferenciaCambio("cliente", -5000, rol), [
    { cuentaId: rol.diferencia_cambio_negativa, debe: 5000 },
    { cuentaId: rol.deudores, haber: 5000 },
  ]);
});

test("pago parcial: sólo la parte cancelada", () => {
  // Se cancelan US$400 de la factura con $480.000 (dólar a $1.200): 480.000 − 400.000.
  assert.equal(diferenciaDeCambio({ cancelado: 400, ...factura }, { cancelado: 480_000, importe: -480_000, importeArs: -480_000 }), 80_000);
});

test("nota de crédito en dólares de otro día contra la factura en dólares", () => {
  // NC de US$100 registrada con el dólar a $1.100 ($110.000).
  assert.equal(diferenciaDeCambio({ cancelado: 100, ...factura }, { cancelado: 100, importe: -100, importeArs: -110_000 }), 10_000);
});

test("pesos contra pesos: nunca hay diferencia", () => {
  const dif = diferenciaDeCambio({ cancelado: 1000, importe: 5000, importeArs: 5000 }, { cancelado: 1000, importe: -1000, importeArs: -1000 });
  assert.equal(dif, 0);
  assert.deepEqual(lineasDiferenciaCambio("proveedor", dif, rol), []);
});

test("transferencia entre monedas: la diferencia va a diferencias de cambio", () => {
  // Salen US$100 (registrados a $1.000 = $100.000) y entran $105.000.
  assert.deepEqual(lineaDiferenciaTransferencia([{ cuentaId: 10, debe: 105_000 }, { cuentaId: 11, debe: -100_000 }], rol),
    { cuentaId: rol.diferencia_cambio_positiva, debe: -5000, detalle: "Diferencia de cambio" });
  assert.deepEqual(lineaDiferenciaTransferencia([{ cuentaId: 10, debe: 95_000 }, { cuentaId: 11, debe: -100_000 }], rol),
    { cuentaId: rol.diferencia_cambio_negativa, debe: 5000, detalle: "Diferencia de cambio" });
  assert.equal(lineaDiferenciaTransferencia([{ cuentaId: 10, debe: 100 }, { cuentaId: 11, debe: -100 }], rol), null);
});

// ── Diferencia en recepciones ──────────────────────────────

test("facturan 10 a $100 y se recibieron 8: $200 de egreso contra Mercaderías", () => {
  const difs = diferenciasRecepcion([{ variacionId: 7, cantidad: 10, costoUnitArs: 100 }], new Map([[7, 8]]));
  assert.deepEqual(difs, [{ variacion_id: 7, facturado: 10, recibido: 8, diferencia: 2, costo_unit_ars: 100, importe: 200 }]);
  assert.deepEqual(lineasDiferenciaRecepcion(difs, rol), [
    { cuentaId: rol.diferencias_recepcion, debe: 200, detalle: undefined },
    { cuentaId: rol.mercaderias, haber: 200, detalle: undefined },
  ]);
});

test("se recibieron de más: importe negativo (Mercaderías al debe, achica el egreso)", () => {
  const difs = diferenciasRecepcion([{ variacionId: 7, cantidad: 10, costoUnitArs: 100 }], new Map([[7, 12]]));
  assert.equal(difs[0].diferencia, -2);
  assert.equal(difs[0].importe, -200);
  // grabarAsiento da vuelta los negativos: queda Mercaderías al debe y la diferencia al haber.
  assert.deepEqual(lineasDiferenciaRecepcion(difs, rol).map((l) => [l.cuentaId, l.debe ?? 0, l.haber ?? 0]),
    [[rol.diferencias_recepcion, -200, 0], [rol.mercaderias, 0, -200]]);
});

test("sin diferencia, nada; producto que no vino en la recepción: falta todo", () => {
  assert.deepEqual(diferenciasRecepcion([{ variacionId: 7, cantidad: 10, costoUnitArs: 100 }], new Map([[7, 10]])), []);
  const d = diferenciasRecepcion([{ variacionId: 9, cantidad: 3, costoUnitArs: 50 }], new Map([[7, 10]]));
  assert.deepEqual(d, [{ variacion_id: 9, facturado: 3, recibido: 0, diferencia: 3, costo_unit_ars: 50, importe: 150 }]);
});

test("un producto en dos líneas: se suman y el costo es el promedio", () => {
  const d = diferenciasRecepcion([{ variacionId: 7, cantidad: 5, costoUnitArs: 100 }, { variacionId: 7, cantidad: 5, costoUnitArs: 120 }], new Map([[7, 8]]));
  assert.deepEqual(d, [{ variacion_id: 7, facturado: 10, recibido: 8, diferencia: 2, costo_unit_ars: 110, importe: 220 }]);
});

test("recepción de 10 facturada en dos facturas de 5: el sobrante de la primera lo revierte la segunda", () => {
  const recibido = new Map([[7, 10]]);
  const l1 = [{ variacionId: 7, cantidad: 5, costoUnitArs: 100 }];
  const d1 = diferenciasRecepcion(l1, recibido);
  assert.equal(d1[0].importe, -500);
  const cubierto = cubiertoPorFactura(l1, d1);
  assert.equal(cubierto.get(7), 10);
  const d2 = diferenciasRecepcion([{ variacionId: 7, cantidad: 5, costoUnitArs: 100 }], recibido, cubierto);
  assert.equal(d2[0].importe, 500);
  assert.equal(d1[0].importe + d2[0].importe, 0);
});

test("factura anterior sin diferencia: cubre lo que facturó", () => {
  const l1 = [{ variacionId: 7, cantidad: 4, costoUnitArs: 100 }, { variacionId: 8, cantidad: 2, costoUnitArs: 10 }];
  const recibido = new Map([[7, 4], [8, 5]]);
  const d1 = diferenciasRecepcion(l1, recibido);
  // 7 justo; 8 sobran 3.
  assert.deepEqual(d1.map((d) => [d.variacion_id, d.diferencia]), [[8, -3]]);
  const cub = cubiertoPorFactura(l1, d1);
  assert.deepEqual([...cub.entries()], [[7, 4], [8, 5]]);
});
