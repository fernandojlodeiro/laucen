import { test } from "node:test";
import assert from "node:assert/strict";
import { envioPagadoPorElComprador } from "@/lib/mercadolibre/envio-comprador";

test("envio del comprador: sale del pago aprobado", () => {
  assert.equal(envioPagadoPorElComprador([{ payments: [{ id: 1, status: "approved", shipping_cost: 7490 }] }]), 7490);
});
test("envio del comprador: sin envío pagado (gratis) es 0", () => {
  assert.equal(envioPagadoPorElComprador([{ payments: [{ id: 1, status: "approved", shipping_cost: 0 }] }]), 0);
  assert.equal(envioPagadoPorElComprador([{ payments: [{ id: 1, status: "approved" }] }]), 0);
});
test("envio del comprador: carrito, un mismo pago en dos órdenes cuenta una vez; cancelada o rechazada no cuentan", () => {
  const pago = { id: 9, status: "approved", shipping_cost: 8490 };
  assert.equal(envioPagadoPorElComprador([{ payments: [pago] }, { payments: [pago] }]), 8490);
  assert.equal(envioPagadoPorElComprador([{ status: "cancelled", payments: [pago] }]), 0);
  assert.equal(envioPagadoPorElComprador([{ payments: [{ id: 2, status: "rejected", shipping_cost: 5000 }] }]), 0);
});
