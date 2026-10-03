// Tests sin base de las cuentas propias de canales y de Mercado Pago: el
// próximo código libre bajo una madre (1.1 para Mercado Pago, 4.1 para las
// ventas de cada canal) y qué cuenta toman los asientos de venta y de cobro
// de pedido (la propia del canal si la hay; si no, la general).

import { test } from "node:test";
import assert from "node:assert/strict";
import { proximoCodigoBajo } from "@/lib/administracion/plan-codigos";
import { lineasVenta, lineasCobroPedido, nombreContableMercadoPago } from "@/lib/administracion/contabilidad-base";

const cod = (...c: string[]) => c.map((codigo) => ({ codigo }));

test("próximo código bajo una madre: el hijo más alto + 1, con su ancho", () => {
  // Plan por defecto sin la Mercado Pago genérica (1.1.03 ya no se siembra).
  assert.equal(proximoCodigoBajo(cod("1", "1.1", "1.1.01", "1.1.02", "1.1.04", "1.2", "1.2.01"), "1.1"), "1.1.05");
  assert.equal(proximoCodigoBajo(cod("4", "4.1.01", "4.1.02"), "4.1"), "4.1.03");
  assert.equal(proximoCodigoBajo(cod("4", "4.1.01", "4.1.02", "4.1.03"), "4.1"), "4.1.04");
});

test("próximo código bajo una madre: sin hijos, nietos y otras ramas no cuentan", () => {
  assert.equal(proximoCodigoBajo(cod("4"), "4.1"), "4.1.01");
  assert.equal(proximoCodigoBajo(cod("1.1.01", "1.1.02.07", "1.10.05", "1.1x.09"), "1.1"), "1.1.02");
  assert.equal(proximoCodigoBajo(cod("4.1.09", "4.1.123"), "4.1"), "4.1.124");
  assert.equal(proximoCodigoBajo(cod("4.1.99"), "4.1"), "4.1.100");
});

const ROL = { deudores: 1, ventas: 2, iva_debito: 3, cobros_canal: 4, comisiones: 5 };

test("venta: el neto va a la cuenta del canal si tiene; si no, a Ventas", () => {
  assert.deepEqual(lineasVenta({ total: 121, iva: 21, nc: false }, ROL, 40), [
    { cuentaId: 1, debe: 121 }, { cuentaId: 40, haber: 100 }, { cuentaId: 3, haber: 21 }]);
  assert.deepEqual(lineasVenta({ total: 121, iva: 21, nc: false }, ROL, null), [
    { cuentaId: 1, debe: 121 }, { cuentaId: 2, haber: 100 }, { cuentaId: 3, haber: 21 }]);
  // Nota de crédito: al revés, también en la cuenta del canal.
  assert.deepEqual(lineasVenta({ total: 121, iva: 21, nc: true }, ROL, 40), [
    { cuentaId: 1, debe: -121 }, { cuentaId: 40, haber: -100 }, { cuentaId: 3, haber: -21 }]);
});

test("cobro de pedido: lo cobrado a Mercado Pago de la cuenta de ML si tiene; la comisión, a Comisiones", () => {
  assert.deepEqual(lineasCobroPedido({ total: 1000, comision: 130 }, ROL, 77), [
    { cuentaId: 77, debe: 870 }, { cuentaId: 5, debe: 130 }, { cuentaId: 1, haber: 1000 }]);
  assert.deepEqual(lineasCobroPedido({ total: 1000, comision: 130 }, ROL, null), [
    { cuentaId: 4, debe: 870 }, { cuentaId: 5, debe: 130 }, { cuentaId: 1, haber: 1000 }]);
  // La comisión nunca pasa el total; total cero o negativo no asienta.
  assert.deepEqual(lineasCobroPedido({ total: 100, comision: 150 }, ROL, 77), [
    { cuentaId: 77, debe: 0 }, { cuentaId: 5, debe: 100 }, { cuentaId: 1, haber: 100 }]);
  assert.deepEqual(lineasCobroPedido({ total: 0, comision: 10 }, ROL, 77), []);
});

test("nombre de la cuenta contable de Mercado Pago", () => {
  assert.equal(nombreContableMercadoPago("Mercado Pago — LAUCEN"), "Mercado Pago — LAUCEN");
  assert.equal(nombreContableMercadoPago("MP de Fer"), "Mercado Pago — MP de Fer");
});
