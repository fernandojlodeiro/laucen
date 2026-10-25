// La parte que decide de la conciliación del comprobante de pago (lib/pagos/comprobante.ts): pura, sin
// IA ni Mercado Pago. Lo que no puede pasar nunca es registrar un pago dudoso solo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decidir, coincideCliente, movimientoDe, type Leido, type Movimiento } from "@/lib/pagos/comprobante";

const leido = (x: Partial<Leido> = {}): Leido => ({ esComprobante: true, numeroOperacion: "", monto: 50000, fecha: "2026-10-25", quienPago: "", quienRecibio: "", ...x });
const mov = (x: Partial<Movimiento> = {}): Movimiento => ({ id: "111", monto: 50000, fecha: "2026-10-25T15:00:00-03:00", nombre: "Juan Carlos Pérez", documento: null, desdeBanco: true, ...x });
const cliente = { nombres: ["PEREZ, JUAN CARLOS"], documentos: ["20123456789"] };
const base = { total: 50000, porNumero: null, usadoPorOtro: false, delDia: [] as Movimiento[], cliente };

test("con número de operación de MP y el importe del pedido: se registra solo", () => {
  const v = decidir({ ...base, leido: leido({ numeroOperacion: "111" }), porNumero: mov({ desdeBanco: false }) });
  assert.equal(v.estado, "conciliado");
  assert.equal(v.elegido?.id, "111");
});

test("la operación ya está en otro pedido: no", () => {
  assert.equal(decidir({ ...base, leido: leido({ numeroOperacion: "111" }), porNumero: mov(), usadoPorOtro: true }).estado, "no_coincide");
});

test("la operación existe pero por otro importe: a confirmar, nunca sola", () => {
  const v = decidir({ ...base, leido: leido({ numeroOperacion: "111" }), porNumero: mov({ monto: 45000 }) });
  assert.equal(v.estado, "a_confirmar");
});

test("desde un banco: una sola del importe exacto y el nombre coincide → se registra", () => {
  assert.equal(decidir({ ...base, leido: leido(), delDia: [mov()] }).estado, "conciliado");
});

test("desde un banco: el nombre no coincide → a confirmar con la transferencia", () => {
  const v = decidir({ ...base, leido: leido(), delDia: [mov({ nombre: "María Gómez" })] });
  assert.equal(v.estado, "a_confirmar");
  assert.equal(v.candidatos?.length, 1);
});

test("dos transferencias del mismo importe ese día: a confirmar, aunque una sea del cliente", () => {
  const v = decidir({ ...base, leido: leido(), delDia: [mov(), mov({ id: "222", nombre: "María Gómez" })] });
  assert.equal(v.estado, "a_confirmar");
  assert.deepEqual(v.candidatos?.map((m) => m.id), ["111"]);
});

test("otro día u otro importe: todavía no aparece", () => {
  assert.equal(decidir({ ...base, leido: leido(), delDia: [mov({ fecha: "2026-10-20T12:00:00-03:00" })] }).estado, "sin_encontrar");
  assert.equal(decidir({ ...base, leido: leido(), delDia: [mov({ monto: 49000 })] }).estado, "sin_encontrar");
});

test("el comprobante es por menos que el pedido: a confirmar", () => {
  assert.equal(decidir({ ...base, total: 60000, leido: leido(), delDia: [mov()] }).estado, "a_confirmar");
});

test("no es un comprobante", () => {
  assert.equal(decidir({ ...base, leido: leido({ esComprobante: false }) }).estado, "no_es");
});

test("coincide por CUIT aunque el nombre venga distinto", () => {
  assert.ok(coincideCliente({ nombre: "J C PEREZ", documento: "20-12345678-9" }, cliente));
  assert.ok(!coincideCliente({ nombre: "Juan Gómez", documento: null }, cliente));
});

test("movimientoDe: el nombre de quien transfirió desde un banco", () => {
  const m = movimientoDe({ id: 9, transaction_amount: 100, operation_type: "account_fund", payment_type_id: "bank_transfer",
    point_of_interaction: { transaction_data: { bank_info: { payer: { long_name: "PEREZ JUAN CARLOS" } } } } });
  assert.equal(m.nombre, "PEREZ JUAN CARLOS");
  assert.ok(m.desdeBanco);
});
