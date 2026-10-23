// Impuestos (lib/impuestos/): las jurisdicciones, la lectura de las declaraciones y las cuentas de la posición del mes
// (IVA como el F.2002, IIBB provincia por provincia, la municipal de Córdoba). Puras: sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoJurisdiccion, nombreJurisdiccion, provinciasDePercepcion } from "@/lib/impuestos/jurisdicciones";
import { aDdjj, datosIibb, numero, periodoNormal, resultadoDdjj } from "@/lib/impuestos/ddjj-leer";
import { calcularIva, calcularIibb, calcularMunicipal, mesAnterior } from "@/lib/impuestos/posicion";
import { detalleIibb, type LecturaFactura } from "@/lib/compras/factura-leer";

test("jurisdicciones: código por número o por nombre escrito de cualquier forma", () => {
  assert.equal(codigoJurisdiccion(904), 904);
  assert.equal(codigoJurisdiccion("4"), 904);
  assert.equal(codigoJurisdiccion("CORDOBA"), 904);
  assert.equal(codigoJurisdiccion("CABA"), 901);
  assert.equal(codigoJurisdiccion("Cargo por percepción de IIBB del régimen general para Buenos Aires"), 902);
  assert.equal(codigoJurisdiccion("Cargo por percepción de IIBB del régimen general para CABA"), 901);
  assert.equal(codigoJurisdiccion("Santa Fe"), 921);
  assert.equal(codigoJurisdiccion("Santiago del Estero"), 922);
  assert.equal(codigoJurisdiccion("Marte"), null);
  assert.equal(nombreJurisdiccion(901), "CABA");
});

test("percepciones de una factura: el detalle si cierra; si no, la provincia del proveedor o la sede", () => {
  assert.deepEqual(provinciasDePercepcion(150, [{ jur: 902, importe: 100 }, { jur: 901, importe: 50 }], 904, 904), [{ jur: 902, importe: 100 }, { jur: 901, importe: 50 }]);
  assert.deepEqual(provinciasDePercepcion(150, [{ jur: 902, importe: 100 }], 921, 904), [{ jur: 921, importe: 150 }]);
  assert.deepEqual(provinciasDePercepcion(150, null, null, 904), [{ jur: 904, importe: 150 }]);
  assert.deepEqual(provinciasDePercepcion(0, null, null, 904), []);
});

test("detalle de IIBB leído de la factura: sólo si suma la percepción", () => {
  const l = { percepciones_iibb_provincias: [{ provincia: "Buenos Aires", importe: 337 }, { provincia: "CABA", importe: 96 }] } as LecturaFactura;
  assert.deepEqual(detalleIibb(l, 433), [{ jur: 902, importe: 337 }, { jur: 901, importe: 96 }]);
  assert.equal(detalleIibb(l, 500), null);
});

test("números y períodos como vienen", () => {
  assert.equal(numero("1.234.567,89"), 1234567.89);
  assert.equal(numero("1234.5"), 1234.5);
  assert.equal(numero(""), 0);
  assert.equal(periodoNormal("09/2026"), "2026-09");
  assert.equal(periodoNormal("202609"), "2026-09");
  assert.equal(periodoNormal("2026-13"), null);
  assert.equal(mesAnterior("2026-01"), "2025-12");
});

test("lectura de un CM03: coeficientes en %, saldos a favor con signo", () => {
  const x = aDdjj({
    impuesto: "iibb", cuit: "30-71430633-9", periodo: "2026-09", rectificativa: 0, fecha_presentacion: "2026-10-15",
    iibb: { base_total: "1.000.000,00", jurisdicciones: [
      { codigo: 904, coeficiente: "85,0000", base: 850000, alicuota: 4.75, determinado: 40375, percepciones: 1000, saldo_anterior: 0, a_pagar: 39375, a_favor: 0 },
      { provincia: "CABA", coeficiente: 0.15, base: 150000, alicuota: 5, determinado: 7500, retenciones: 9000, a_pagar: 0, a_favor: 1500 },
    ] },
  });
  assert.ok(!("error" in x));
  if ("error" in x) return;
  assert.equal(x.cuit, "30714306339");
  const d = x.datos as ReturnType<typeof datosIibb>;
  assert.equal(d.base_total, 1000000);
  assert.deepEqual(d.jurisdicciones.map((j) => [j.codigo, j.coeficiente, j.saldo]), [[901, 0.15, -1500], [904, 0.85, 39375]]);
  assert.deepEqual(resultadoDdjj("iibb", d), { aPagar: 39375, aFavor: 1500 });
  assert.ok("error" in aDdjj({ impuesto: "otro", cuit: null, periodo: "2026-09", rectificativa: 0, fecha_presentacion: null }));
});

test("IVA como el F.2002", () => {
  // Débito 1.000, crédito 600, saldo técnico anterior 100 → impuesto 300; percepciones 50 + libre anterior 20 → a pagar 230.
  const a = calcularIva({ debito: 1000, credito: 600, pagosACuenta: 50, anterior: { saldo_tecnico_favor: 100, saldo_libre_favor: 20 } });
  assert.deepEqual([a.impuesto, a.saldoTecnicoFavor, a.aPagar, a.saldoLibreFavor], [300, 0, 230, 0]);
  // Más crédito que débito: saldo técnico a favor; las percepciones quedan como libre disponibilidad.
  const b = calcularIva({ debito: 500, credito: 800, pagosACuenta: 40, anterior: null });
  assert.deepEqual([b.impuesto, b.saldoTecnicoFavor, b.aPagar, b.saldoLibreFavor], [0, 300, 0, 40]);
});

test("IIBB provincia por provincia: lo que no trae provincia se reparte por coeficiente", () => {
  const r = calcularIibb({
    base: 1000000,
    jurisdicciones: [{ codigo: 904, coeficiente: 0.8, alicuota: 4.75 }, { codigo: 901, coeficiente: 0.2, alicuota: 5 }],
    percepciones: new Map([[904, 1000], [902, 300]]), aduaneras: 1000, retenciones: 500, anteriores: new Map([[901, 20000]]), sede: 904,
  });
  const cba = r.filas.find((f) => f.codigo === 904)!, caba = r.filas.find((f) => f.codigo === 901)!, pba = r.filas.find((f) => f.codigo === 902)!;
  assert.deepEqual([cba.base, cba.determinado, cba.aduaneras, cba.retenciones, cba.saldo], [800000, 38000, 800, 400, 35800]);
  assert.deepEqual([caba.determinado, caba.aduaneras, caba.retenciones, caba.saldoAnterior, caba.saldo], [10000, 200, 100, 20000, -10300]);
  // Una percepción de una provincia sin coeficiente: sólo saldo a favor.
  assert.deepEqual([pba.coeficiente, pba.determinado, pba.saldo], [0, 0, -300]);
  assert.deepEqual([r.totales.aPagar, r.totales.aFavor], [35800, 10600]);
});

test("municipal: base × alícuota o el mínimo, menos el saldo a favor", () => {
  assert.deepEqual(calcularMunicipal({ base: 1000000, alicuota: 1.5, minimo: 10000, saldoAnterior: 1000 }).saldo, 14000);
  assert.equal(calcularMunicipal({ base: 100000, alicuota: 0.6, minimo: 10000, saldoAnterior: 0 }).determinado, 10000);
});
