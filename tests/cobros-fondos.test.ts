// Tests sin base de los cobros de pedidos en Caja y bancos: el nombre de la
// cuenta de fondos del Mercado Pago de la tienda y la pata de fondos de un
// asiento de cobro (qué cuenta de fondos recibe el movimiento y por cuánto).

import { test } from "node:test";
import assert from "node:assert/strict";
import { nombreFondosMercadoPagoTienda, pataDeFondos, lineasCobroPedido } from "@/lib/administracion/contabilidad-base";

test("Mercado Pago de la tienda: con el nombre de siempre, «Mercado Pago — Tienda web»", () => {
  assert.equal(nombreFondosMercadoPagoTienda("Mercado Pago"), "Mercado Pago — Tienda web");
  assert.equal(nombreFondosMercadoPagoTienda("  mercado pago "), "Mercado Pago — Tienda web");
  assert.equal(nombreFondosMercadoPagoTienda("MercadoPago"), "Mercado Pago — Tienda web");
  assert.equal(nombreFondosMercadoPagoTienda(""), "Mercado Pago — Tienda web");
  assert.equal(nombreFondosMercadoPagoTienda(null), "Mercado Pago — Tienda web");
});

test("Mercado Pago de la tienda: con otro nombre, ése (con «Mercado Pago — » si no lo tiene)", () => {
  assert.equal(nombreFondosMercadoPagoTienda("Mercado Pago Laucen"), "Mercado Pago Laucen");
  assert.equal(nombreFondosMercadoPagoTienda("Tarjetas y dinero en cuenta"), "Mercado Pago — Tarjetas y dinero en cuenta");
});

const ROL = { deudores: 1, cobros_canal: 4, comisiones: 5 };

test("pata de fondos: lo cobrado a la cuenta contable de una cuenta de fondos, sin la comisión", () => {
  // Cuenta contable 77 = la de la cuenta de fondos 9 (Mercado Pago).
  const lineas = lineasCobroPedido({ total: 1000, comision: 130 }, ROL, 77);
  assert.deepEqual(pataDeFondos(lineas, new Map([[77, 9]])), { cuentaFondosId: 9, importe: 870 });
});

test("pata de fondos: si fue a Cobros de canales a liquidar (sin cuenta de fondos), no hay movimiento", () => {
  const lineas = lineasCobroPedido({ total: 1000, comision: 130 }, ROL, null);
  assert.equal(pataDeFondos(lineas, new Map([[77, 9]])), null);
  assert.equal(pataDeFondos(lineas, new Map()), null);
});

test("pata de fondos: comisión igual al total (nada cobrado) no deja movimiento", () => {
  assert.equal(pataDeFondos([{ cuentaId: 77, debe: 0 }, { cuentaId: 5, debe: 500 }, { cuentaId: 1, haber: 500 }], new Map([[77, 9]])), null);
});

test("pata de fondos: renglones de la misma cuenta se suman; la comisión nunca entra", () => {
  const lineas = [{ cuentaId: 77, debe: 600 }, { cuentaId: 77, debe: 270.004 }, { cuentaId: 5, debe: 130 }, { cuentaId: 1, haber: 1000 }];
  // Aunque Comisiones (5) fuera de una cuenta de fondos, toma la primera al debe que es de fondos.
  assert.deepEqual(pataDeFondos(lineas, new Map([[77, 9], [5, 3]])), { cuentaFondosId: 9, importe: 870 });
});
