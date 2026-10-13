// Sugerencia de compra (lib/compras/sugerencia-calculo.ts): ritmo de venta en ventanas con stock, compras grandes y costos
// de Mercado Libre. Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { costosMl, ritmo, sinComprasGrandes, type Renglon } from "@/lib/compras/sugerencia-calculo";

const cadaDia = (desde: number, hasta: number, paso: number, cant: number): Renglon[] => {
  const r: Renglon[] = [];
  for (let d = desde; d <= hasta; d += paso) r.push({ dia: d, cantidad: cant });
  return r;
};

test("con quiebre de stock: el típico sale de los tramos con venta regular, no del promedio", () => {
  // Vende 2 por día del 0 al 99, no hay stock del 100 al 299, vende 1 cada 2 días del 300 al 399.
  const rs = [...cadaDia(0, 99, 1, 2), ...cadaDia(300, 399, 2, 1)];
  const r = ritmo(rs, 60, 399);
  assert.equal(r.mejor, 120);
  // El promedio simple daría (200 + 50) / 400 × 60 ≈ 37; las ventanas válidas dan 120 (primer tramo) o 30 (segundo).
  assert.ok(r.tipico === 30 || r.tipico === 120 || r.tipico === 75);
  assert.ok(r.ventanas > 0);
  // Ninguna ventana cruza el quiebre.
  assert.ok(r.mejor <= 120);
});

test("la ventana tiene que entrar en el período", () => {
  const r = ritmo(cadaDia(0, 30, 1, 1), 60, 30);
  assert.equal(r.ventanas, 0);
  assert.equal(r.tipico, 0);
});

test("compras grandes: se separan y se cuentan", () => {
  const { quedan, grandes, mayor } = sinComprasGrandes([{ dia: 1, cantidad: 1 }, { dia: 2, cantidad: 2 }, { dia: 3, cantidad: 1 }, { dia: 4, cantidad: 200 }, { dia: 5, cantidad: 3 }]);
  assert.equal(grandes, 1);
  assert.equal(mayor, 200);
  assert.equal(quedan.length, 4);
  // Con la típica en 1, 5 unidades todavía no es «grande» (mínimo 6).
  assert.equal(sinComprasGrandes([{ dia: 1, cantidad: 1 }, { dia: 2, cantidad: 1 }, { dia: 3, cantidad: 5 }]).grandes, 0);
});

test("costos de ML: comisión + cargo fijo abajo de 33.000, envío arriba", () => {
  const g = { cargoFijo: [{ desde: 0, valor: 1330 }, { desde: 15000, valor: 2740 }, { desde: 33000, valor: 0 }], envio: [{ desde: 0, valor: 0 }, { desde: 33000, valor: 6190 }] };
  assert.equal(Math.round(costosMl(10000, 16, g)), 1600 + 1330);
  assert.equal(Math.round(costosMl(40000, 16, g)), 6400 + 6190);
});
