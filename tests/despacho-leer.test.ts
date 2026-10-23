// Lo que se carga en el despacho a partir de lo que leyó la IA (lib/compras/despacho-leer.ts), con el despacho
// 26017IC04006534U: el SIM liquida en dólares y cada importe pasa a pesos con el dólar del despacho.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aDespacho, clasificarConcepto, type LecturaDespacho } from "@/lib/compras/despacho-leer";

const lectura: LecturaDespacho = {
  numero: "26017IC04006534U", fecha: "2026-09-29", cotizacion: 1524.5, cuit_importador: "30714306339", vendedor: "AIRTRU LLC", via: "AVION",
  fob_usd: 21632.1, flete_usd: 708.73, seguro_usd: 110.15,
  liquidacion: [
    { codigo: "010", concepto: "DERECHOS IMPORTACION", importe_usd: 3592.16 }, { codigo: "415", concepto: "I.V.A.", importe_usd: 2734.53 },
    { codigo: "500", concepto: "ARANCEL SIM IMPO", importe_usd: 10 }, { codigo: "900", concepto: "INGRESOS BRUTOS", importe_usd: 509.88 },
  ],
  items: [
    { descripcion: "ASUS F412DA NH77", ncm: "8471.30.19.910G", cantidad: 24, fob_unit_usd: 268.75125 },
    { descripcion: "ASUS S532FA SB77", ncm: "8471.30.19.910G", cantidad: 20, fob_unit_usd: 352.5525 },
    { descripcion: "HP 15 EF0022NR", ncm: "8471.30.19.910G", cantidad: 39, fob_unit_usd: 208.48769 },
  ],
};

test("cada concepto va a su lado y en pesos", () => {
  const r = aDespacho(lectura);
  assert.deepEqual(r.gastos, [{ concepto: "Derechos de importación", importe_ars: 5476247.92 }, { concepto: "Arancel SIM", importe_ars: 15245 }]);
  assert.deepEqual(r.impuestos, [{ concepto: "IVA", importe_ars: 4168790.99 }, { concepto: "IIBB", importe_ars: 777312.06 }]);
  assert.equal(r.fobItems, 21632.1);
  assert.deepEqual(r.avisos, []);
});

test("los nombres de impuestos son los que reconoce el asiento", () => {
  assert.equal(clasificarConcepto("IVA ADICIONAL").nombre, "IVA adicional");
  assert.equal(clasificarConcepto("IMPUESTO A LAS GANANCIAS").nombre, "Ganancias");
  assert.equal(clasificarConcepto("TASA DE ESTADISTICA").lado, "gastos");
  assert.equal(clasificarConcepto("SERVICIO EXTRAORDINARIO").lado, "gastos");
});

test("avisa si la mercadería no suma el FOB o falta el dólar", () => {
  const r = aDespacho({ ...lectura, cotizacion: null, items: lectura.items.slice(0, 2) });
  assert.equal(r.avisos.length, 2);
});
