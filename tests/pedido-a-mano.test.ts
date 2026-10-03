// El pedido a mano (lib/pedidos/a-mano.ts), sin base: las validaciones que
// comparten "Nuevo pedido" y el asistente antes de crear nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validarPedidoAMano, type PedidoAMano } from "@/lib/pedidos/a-mano";

const base = (x: Partial<PedidoAMano> = {}): PedidoAMano => ({
  canalId: 1, clienteId: null, lineas: [{ sku: "A1", cantidad: 2 }], pago: "a_convenir", medio: null, entrega: "retiro", ...x,
});

test("un pedido completo pasa", () => {
  assert.doesNotThrow(() => validarPedidoAMano(base()));
  assert.doesNotThrow(() => validarPedidoAMano(base({ pago: "pagado", medio: "Efectivo" })));
  assert.doesNotThrow(() => validarPedidoAMano(base({ entrega: "envio", direccion: { calle: "Mitre", numero: "100", piso_depto: null, localidad: "Córdoba", provincia: null, codigo_postal: null, referencia: null } })));
});

test("lo que falta se avisa en criollo", () => {
  assert.throws(() => validarPedidoAMano(base({ lineas: [] })), /al menos un producto/);
  assert.throws(() => validarPedidoAMano(base({ lineas: [{ cantidad: 1 }] })), /Línea 1: falta el producto/);
  assert.throws(() => validarPedidoAMano(base({ lineas: [{ sku: "A1", cantidad: 1.5 }] })), /entero mayor que cero/);
  assert.throws(() => validarPedidoAMano(base({ pago: "pagado" })), /con qué pagó/);
  assert.throws(() => validarPedidoAMano(base({ pago: "pagado", medio: "Bitcoin" })), /Medio de pago desconocido/);
  assert.throws(() => validarPedidoAMano(base({ pago: "cuenta_corriente" })), /necesita un cliente/);
  assert.throws(() => validarPedidoAMano(base({ entrega: "envio", direccion: null })), /calle y la localidad/);
});
