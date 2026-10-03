// Tests del costo promedio ponderado, sin base: compra sin recepción (el stock
// entra con la factura), con la recepción vinculada (lo recibido ya está en el
// stock y no se cuenta dos veces), recepción parcial o de más, una recepción
// repartida en dos facturas y el mismo producto en dos líneas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promedioPonderado, excluirPorRecepcion } from "@/lib/administracion/costos";

// Simula registrarCosto: stock de hoy, promedio anterior, y lo que se descuenta.
const prom = (stockActual: number, promedioAnterior: number | null, cantidad: number, costoNuevo: number, excluir = 0) =>
  promedioPonderado({ stockAnterior: stockActual - excluir, promedioAnterior, cantidad, costoNuevo, decimales: 2 });

test("sin recepción: había 10 a $100, entran 10 a $200 → $150", () => {
  // El stock todavía no se movió (la factura lo mueve después del costo).
  assert.equal(prom(10, 100, 10, 200), 150);
});

test("stock cero, negativo o sin promedio: el promedio es el costo nuevo", () => {
  assert.equal(prom(0, 100, 5, 200), 200);
  assert.equal(prom(-3, 100, 5, 200), 200);
  assert.equal(prom(10, null, 5, 200), 200);
});

test("redondeo: 2 decimales en pesos, 4 en dólares", () => {
  assert.equal(promedioPonderado({ stockAnterior: 1, promedioAnterior: 1, cantidad: 2, costoNuevo: 2, decimales: 2 }), 1.67);
  assert.equal(promedioPonderado({ stockAnterior: 1, promedioAnterior: 1, cantidad: 2, costoNuevo: 2, decimales: 4 }), 1.6667);
});

test("con recepción completa: lo recibido no se cuenta dos veces", () => {
  // Había 10 a $100; la recepción ingresó 10 (stock 20); la factura las cuesta a $200.
  const ex = excluirPorRecepcion([{ variacionId: 1, cantidad: 10 }], new Map([[1, 10]]));
  assert.deepEqual(ex, [10]);
  assert.equal(prom(20, 100, 10, 200, ex[0]), 150);
  // El error de antes: sin descontar daba 133,33.
  assert.equal(prom(20, 100, 10, 200), 133.33);
});

test("recepción parcial: se recibieron 8 de 10 facturadas", () => {
  // Stock 18 (10 de antes + 8 recibidas). Sólo se descuentan las 8 que están adentro.
  const ex = excluirPorRecepcion([{ variacionId: 1, cantidad: 10 }], new Map([[1, 8]]));
  assert.deepEqual(ex, [8]);
  assert.equal(prom(18, 100, 10, 200, ex[0]), 150);
});

test("recepción de más: se recibieron 12, se facturan 10", () => {
  // Stock 22. Las 12 recibidas no tienen costo todavía: ninguna es "stock que había".
  const ex = excluirPorRecepcion([{ variacionId: 1, cantidad: 10 }], new Map([[1, 12]]));
  assert.deepEqual(ex, [12]);
  assert.equal(prom(22, 100, 10, 200, ex[0]), 150);
  // La segunda factura (2 a $300) de la misma recepción: las 10 ya costeadas son stock que había.
  const ex2 = excluirPorRecepcion([{ variacionId: 1, cantidad: 2 }], new Map([[1, 12]]), new Map([[1, 10]]));
  assert.deepEqual(ex2, [2]);
  assert.equal(prom(22, 150, 2, 300, ex2[0]), 163.64); // (20×150 + 2×300) / 22
});

test("el mismo producto en dos líneas de una factura con recepción", () => {
  // Había 10 a $100, la recepción ingresó 10 (stock 20); la factura: 6 a $200 y 4 a $250.
  const ex = excluirPorRecepcion([{ variacionId: 1, cantidad: 6 }, { variacionId: 1, cantidad: 4 }], new Map([[1, 10]]));
  assert.deepEqual(ex, [10, 4]);
  const p1 = prom(20, 100, 6, 200, ex[0]); // (10×100 + 6×200) / 16 = 137,5
  assert.equal(p1, 137.5);
  const p2 = prom(20, p1, 4, 250, ex[1]); // (16×137,5 + 4×250) / 20 = 160
  assert.equal(p2, 160);
  // Igual que si fuera una sola línea de 10 a $220: (10×100 + 10×220) / 20 = 160.
  assert.equal(prom(20, 100, 10, 220, 10), 160);
});

test("producto facturado que no vino en la recepción: no se descuenta nada", () => {
  assert.deepEqual(excluirPorRecepcion([{ variacionId: 2, cantidad: 5 }], new Map([[1, 10]])), [0]);
});
