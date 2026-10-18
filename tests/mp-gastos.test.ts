// Tests de la clasificación de gastos de Mercado Pago (lib/mercadopago/gastos.ts): lo que no es
// gasto (transferencias entre cuentas propias, retiros), las reglas fijas por palabra, las reglas
// guardadas y la marca a mano, y las pistas de gasto personal pagado por la empresa.

import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarGastos, armarTablero, type MovGasto } from "@/lib/mercadopago/gastos";

const mov = (x: Partial<MovGasto>): MovGasto => ({
  conexion_id: 1, cuenta: "EMPRESA", cuenta_mp_id: 100, clave: Math.random().toString(), movimiento_id: "1", tipo_original: "SETTLEMENT",
  fecha: new Date("2026-09-10T15:00:00Z"), importe_neto: -1000, descripcion: null, medio_pago: "account_money",
  api_tipo: "regular_payment", api_descripcion: null, cobrador_id: "900", pagador_id: "100", tipo_medio: "account_money", ...x,
});

test("transferencia a una cuenta propia y retiro a banco no son gasto; ARCA es Impuestos", () => {
  const c = clasificarGastos([
    mov({ api_tipo: "money_transfer", cobrador_id: "200", importe_neto: -500000 }),
    mov({ tipo_original: "PAYOUTS", api_tipo: null, movimiento_id: null, medio_pago: null, importe_neto: -100000 }),
    mov({ api_descripcion: "ARCA", importe_neto: -2796962 }),
    mov({ api_tipo: "money_transfer", cobrador_id: "777", importe_neto: -15000 }),
  ], { propias: new Set(["100", "200"]), ambitoCuenta: () => "empresa", marcas: [], reglas: [] });
  assert.equal(c[0].es_gasto, false);
  assert.equal(c[0].grupo, "Transferencia entre cuentas propias");
  assert.equal(c[1].grupo, "Retiro a banco propio");
  assert.equal(c[2].categoria, "Impuestos");
  assert.equal(c[2].recurrencia, "recurrente");
  assert.equal(c[3].categoria, "Transferencias a terceros");
});

test("regla guardada por destinatario y marca a mano; pista de gasto personal en la empresa", () => {
  const a = mov({ clave: "a", cobrador_id: "3297688050", api_descripcion: "Varios" });
  const b = mov({ clave: "b", api_descripcion: "Farmacity", fecha: new Date("2026-09-08T15:00:00Z") });
  const d = mov({ clave: "d", cobrador_id: "555" });
  const c = clasificarGastos([a, b, d], {
    propias: new Set(["100"]), ambitoCuenta: () => "empresa",
    marcas: [{ conexion_id: 1, clave: "d", categoria: "Viajes", ambito_gasto: "personal", recurrencia: "extraordinario", nota: null }],
    reglas: [], pagadosDesdePersonal: new Set(["3297688050"]),
  });
  assert.equal(c[0].posible_personal, "al mismo destinatario se le pagó desde la cuenta personal");
  assert.equal(c[1].categoria, "Salud");
  assert.ok(c[1].posible_personal);
  assert.equal(c[2].categoria, "Viajes");
  assert.equal(c[2].ambito_gasto, "personal");
  assert.equal(c[2].posible_personal, null, "lo marcado a mano ya no es candidato");

  const conRegla = clasificarGastos([a], { propias: new Set(["100"]), ambitoCuenta: () => "empresa", marcas: [],
    reglas: [{ id: 1, campo: "contraparte", valor: "3297688050", categoria: "Supermercado y comida", ambito_gasto: "personal", recurrencia: "eventual" }] });
  assert.equal(conRegla[0].categoria, "Supermercado y comida");
  assert.equal(conRegla[0].ambito_gasto, "personal");
});

test("el tablero suma sólo gasto de los 12 meses cerrados", () => {
  const ahora = new Date("2026-10-18T12:00:00Z");
  const c = clasificarGastos([
    mov({ api_descripcion: "Telecom", importe_neto: -100, fecha: new Date("2026-09-10T15:00:00Z") }),
    mov({ api_descripcion: "Telecom", importe_neto: -100, fecha: new Date("2026-10-10T15:00:00Z") }),
    mov({ api_descripcion: "Telecom", importe_neto: -100, fecha: new Date("2025-10-02T15:00:00Z") }),
    mov({ importe_neto: 5000, api_tipo: "regular_payment", cobrador_id: "100", pagador_id: "1" }),
  ], { propias: new Set(["100"]), ambitoCuenta: () => "personal", marcas: [], reglas: [] });
  const t = armarTablero(c, () => true, ahora);
  assert.equal(t.totalAnio, 200, "septiembre y octubre del año pasado; el mes en curso no suma");
  assert.equal(t.porMes.find((m) => m.mes === "2026-10")!.total, 100);
  assert.equal(t.noGasto.find((g) => g.grupo === "Ingreso")!.entradas, 5000);
});
