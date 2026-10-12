// Publicidad en Mercado Libre: el veredicto por producto (lib/publicidad/veredicto.ts › juzgar), con el ejemplo de la
// orden 596. Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { juzgar, type Metr } from "@/lib/publicidad/veredicto";
import { CONFIG_DEFECTO } from "@/lib/publicidad/config";

const cfg = { ...CONFIG_DEFECTO, pctMax: 7, topeVentas: 2, topePesos: 0, diasMinimos: 3, clicsMinimos: 30, subirHasta: 50, cortarDesde: 150, ventas: "directas" as const };
const m = (x: Partial<Metr>): Metr => ({ clics: 0, impresiones: 0, costo: 0, montoDir: 0, montoInd: 0, udsDir: 0, udsInd: 0, diasConGasto: 0, ...x });

test("sin ventas: dentro del corte sigue (amarillo); al gastar el equivalente a 2 ventas, corta", () => {
  const dia5 = juzgar(m({ costo: 30_000, clics: 280, diasConGasto: 5 }), 962_999, 7, cfg);
  assert.equal(dia5.veredicto, "seguir");
  assert.equal(dia5.color, "amarillo");
  const dia9 = juzgar(m({ costo: 135_000, clics: 600, diasConGasto: 9 }), 962_999, 7, cfg);
  assert.equal(dia9.veredicto, "cortar");
  assert.equal(Math.round(dia9.topeSinVentas!), 134_820);
});

test("rinde: 2,4 % por venta contra un tope de 7 % → subir", () => {
  const r = juzgar(m({ costo: 60_000, clics: 300, diasConGasto: 6, udsDir: 2, montoDir: 2_500_000 }), 1_250_000, 7, cfg);
  assert.equal(r.veredicto, "subir");
  assert.equal(r.pctPorVenta!.toFixed(1), "2.4");
});

test("entre el tope y el corte → bajar; con pocos datos, seguir; arriba del corte → cortar", () => {
  const conDatos = m({ costo: 9_000, clics: 100, diasConGasto: 5, udsDir: 1, montoDir: 100_000 });
  assert.equal(juzgar(conDatos, 100_000, 7, cfg).veredicto, "bajar");
  assert.equal(juzgar({ ...conDatos, clics: 10 }, 100_000, 7, cfg).veredicto, "seguir");
  assert.equal(juzgar({ ...conDatos, costo: 12_000 }, 100_000, 7, cfg).veredicto, "cortar");
});

test("las indirectas cuentan sólo si la config lo dice; sin gasto, esperar; tope en pesos gana si es menor", () => {
  const x = m({ costo: 5_000, clics: 100, diasConGasto: 5, udsInd: 2, montoInd: 200_000 });
  assert.equal(juzgar(x, 100_000, 7, cfg).veredicto, "seguir");
  assert.equal(juzgar(x, 100_000, 7, { ...cfg, ventas: "totales" }).color, "verde");
  assert.equal(juzgar(m({}), 100_000, 7, cfg).veredicto, "esperar");
  assert.equal(juzgar(m({ costo: 5_000, clics: 5 }), 100_000, 7, { ...cfg, topePesos: 4_000 }).veredicto, "cortar");
});
