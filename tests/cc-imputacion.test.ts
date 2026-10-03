// Tests de la imputación de cuentas corrientes entre monedas, sin base: un
// pago en pesos cancela una factura en dólares al tipo de cambio del día del
// pago (el pendiente de la factura baja en dólares), los topes de la
// imputación a mano, y que ningún pendiente quede negativo por redondeo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicar, repartir, equivalente, type RenglonCc } from "@/lib/administracion/cc-imputacion";

test("misma moneda: se restan tal cual", () => {
  assert.deepEqual(aplicar({ moneda: "ARS", p: 1000 }, { moneda: "ARS", p: 300 }, null), { debito: 300, credito: 300, cotizacion: null });
  assert.deepEqual(aplicar({ moneda: "USD", p: 50 }, { moneda: "USD", p: 80 }, 1000), { debito: 50, credito: 50, cotizacion: null });
  assert.deepEqual(aplicar({ moneda: "ARS", p: 1000 }, { moneda: "ARS", p: 800 }, null, 250), { debito: 250, credito: 250, cotizacion: null });
});

test("el bug: $100.000 NO cancelan US$100.000", () => {
  // Factura de US$100.000, orden de pago de $100.000 con el dólar a $1.000.
  const a = aplicar({ moneda: "USD", p: 100000 }, { moneda: "ARS", p: 100000 }, 1000)!;
  assert.deepEqual(a, { debito: 100, credito: 100000, cotizacion: 1000 });
});

test("pago en pesos que alcanza: cancela la factura en dólares y sobra en pesos", () => {
  const a = aplicar({ moneda: "USD", p: 1000 }, { moneda: "ARS", p: 1500000 }, 1200)!;
  assert.deepEqual(a, { debito: 1000, credito: 1200000, cotizacion: 1200 });
});

test("al revés: crédito en dólares contra deuda en pesos", () => {
  assert.deepEqual(aplicar({ moneda: "ARS", p: 50000 }, { moneda: "USD", p: 100 }, 1000), { debito: 50000, credito: 50, cotizacion: 1000 });
  assert.deepEqual(aplicar({ moneda: "ARS", p: 500000 }, { moneda: "USD", p: 100 }, 1000), { debito: 100000, credito: 100, cotizacion: 1000 });
});

test("sin cotización no imputa entre monedas", () => {
  assert.equal(aplicar({ moneda: "USD", p: 10 }, { moneda: "ARS", p: 10000 }, null), null);
  assert.equal(aplicar({ moneda: "USD", p: 10 }, { moneda: "ARS", p: 10000 }, 0), null);
});

test("redondeo: un resto de menos de un centavo del otro lado se absorbe, nada queda negativo", () => {
  // $1.000.000 al dólar de 1000,5 = US$999,5002 contra una factura de US$999,50:
  // la factura queda en cero y el recibo también (el resto, $0,25, no cancela nada).
  const a = aplicar({ moneda: "USD", p: 999.5 }, { moneda: "ARS", p: 1000000 }, 1000.5)!;
  assert.deepEqual(a, { debito: 999.5, credito: 1000000, cotizacion: 1000.5 });
  // Factura US$33,33 con $100.000 al 3.000: sobrarían $10 (US$0,003), que no
  // cancelan nada en dólares: el pago se usa entero.
  const b = aplicar({ moneda: "USD", p: 33.33 }, { moneda: "ARS", p: 100000 }, 3000)!;
  assert.deepEqual(b, { debito: 33.33, credito: 100000, cotizacion: 3000 });
  // Con $100.060 sobran $70 (US$0,02): quedan pendientes en el pago.
  const b2 = aplicar({ moneda: "USD", p: 33.33 }, { moneda: "ARS", p: 100060 }, 3000)!;
  assert.deepEqual(b2, { debito: 33.33, credito: 99990, cotizacion: 3000 });
  // Un crédito en pesos que, pasado a dólares, redondea por arriba del pendiente: tope en el pendiente.
  const c = aplicar({ moneda: "USD", p: 10 }, { moneda: "ARS", p: 10004.9 }, 1000)!;
  assert.ok(c.debito <= 10 && c.credito <= 10004.9);
  // Un resto que no llega a un centavo de la otra moneda no imputa.
  assert.equal(aplicar({ moneda: "USD", p: 10 }, { moneda: "ARS", p: 3 }, 1000), null);
});

test("imputación a mano: el tope va en la moneda de la deuda", () => {
  assert.deepEqual(aplicar({ moneda: "USD", p: 1000 }, { moneda: "ARS", p: 2000000 }, 1000, 400), { debito: 400, credito: 400000, cotizacion: 1000 });
  // Un tope mayor que lo que alcanza el crédito queda en lo que alcanza.
  assert.deepEqual(aplicar({ moneda: "USD", p: 1000 }, { moneda: "ARS", p: 100000 }, 1000, 400), { debito: 100, credito: 100000, cotizacion: 1000 });
});

test("reparto automático: de lo más viejo a lo más nuevo, cada uno en su moneda", () => {
  const deb: RenglonCc[] = [
    { id: 1, moneda: "USD", p: 100 },     // factura en dólares
    { id: 2, moneda: "ARS", p: 50000 },   // factura en pesos
  ];
  const cre: RenglonCc[] = [{ id: 10, moneda: "ARS", p: 180000, cot: 1000 }];
  const imp = repartir(deb, cre);
  assert.deepEqual(imp, [
    { debito: 100, credito: 100000, cotizacion: 1000, debitoId: 1, creditoId: 10 },
    { debito: 50000, credito: 50000, cotizacion: null, debitoId: 2, creditoId: 10 },
  ]);
  assert.deepEqual(deb.map((d) => d.p), [0, 0]);
  assert.equal(cre[0].p, 30000);
});

test("reparto automático: un crédito sin cotización salta la deuda de otra moneda", () => {
  const deb: RenglonCc[] = [{ id: 1, moneda: "USD", p: 100 }, { id: 2, moneda: "ARS", p: 5000 }];
  const cre: RenglonCc[] = [{ id: 10, moneda: "ARS", p: 8000, cot: null }];
  const imp = repartir(deb, cre);
  assert.deepEqual(imp.map((i) => [i.debitoId, i.debito]), [[2, 5000]]);
  assert.deepEqual(deb.map((d) => d.p), [100, 0]);
  assert.equal(cre[0].p, 3000);
});

test("reparto: los pendientes nunca quedan negativos", () => {
  const deb: RenglonCc[] = [{ id: 1, moneda: "USD", p: 0.01 }, { id: 2, moneda: "USD", p: 77.77 }, { id: 3, moneda: "ARS", p: 0.01 }];
  const cre: RenglonCc[] = [{ id: 10, moneda: "ARS", p: 123456.78, cot: 1357.9 }, { id: 11, moneda: "USD", p: 5.55, cot: 1400 }];
  repartir(deb, cre);
  for (const r of [...deb, ...cre]) assert.ok(r.p >= 0, `renglón ${r.id} quedó en ${r.p}`);
});

test("equivalente", () => {
  assert.equal(equivalente(100, "USD", "ARS", 1000), 100000);
  assert.equal(equivalente(100000, "ARS", "USD", 1000), 100);
  assert.equal(equivalente(5, "ARS", "ARS", 1000), 5);
});
