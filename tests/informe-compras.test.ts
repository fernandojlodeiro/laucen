// Informe de importaciones (lib/compras/informe.ts): las cuentas por producto y las recomendaciones. Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { analizar, recomendar, resumir, type ProductoImportado } from "@/lib/compras/informe";

const p = (x: Partial<ProductoImportado>): ProductoImportado => ({
  linea_id: 1, compra_id: 1, compra: "C_1", ingreso_ts: new Date("2026-05-21T16:10:00Z"), producto_id: 1, sku: "SKU1", descripcion: "Algo", fotos: null,
  cargado: 100, vendido: 0, ventas: 0, comision: 0, costo_unit: 1000, disponible: 100, precio: 5000, primera_venta: null, agotado_ts: null, dias: 140, ...x,
});

test("ganancia, margen, venta por día, días para agotar y diferencia de stock", () => {
  const a = analizar(p({ vendido: 70, ventas: 350_000, comision: 60_000, disponible: 25, dias: 140 }));
  assert.equal(a.costo_vendido, 70_000);
  assert.equal(a.ganancia, 220_000);
  assert.equal(a.margen_pct, 62.9);
  assert.equal(a.por_dia, 0.5);
  assert.equal(a.dias_para_agotar, 50);
  assert.equal(a.diferencia, -5);
});

test("se agotó rápido con buen margen: comprar más, para 120 días", () => {
  const a = analizar(p({ vendido: 100, ventas: 500_000, comision: 80_000, disponible: 0, dias: 40, agotado_ts: new Date("2026-06-30") }));
  const r = recomendar(a);
  assert.equal(r[0].tipo, "comprar_mas");
  assert.match(r[0].texto, /unas 300 unidades/);
});

test("lento: comprar menos; margen bajo: revisar precio; faltante: revisar stock", () => {
  const lento = recomendar(analizar(p({ vendido: 10, ventas: 50_000, comision: 8_000, disponible: 90, dias: 140 })));
  assert.deepEqual(lento.map((r) => r.tipo), ["comprar_menos"]);
  const caro = recomendar(analizar(p({ vendido: 80, ventas: 90_000, comision: 15_000, disponible: 10, dias: 140 })));
  assert.equal(caro[0].tipo, "revisar_precio");
  assert.ok(caro.some((r) => r.tipo === "revisar_stock"));
});

test("resumen de varias", () => {
  const r = resumir("Total", [analizar(p({ vendido: 10, ventas: 50_000, comision: 5_000, disponible: 85 })), analizar(p({ vendido: 20, ventas: 80_000, comision: 9_000, disponible: 80 }))]);
  assert.equal(r.vendido, 30);
  assert.equal(r.ganancia, 50_000 - 5_000 - 10_000 + 80_000 - 9_000 - 20_000);
  assert.equal(r.diferencia, -5);
});
