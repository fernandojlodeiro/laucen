// Tests de los Libros de IVA, sin base: filas en pesos y con signo (NC
// restan, dólares a la cotización), totales, resumen y saldo técnico, y los
// renglones de los archivos del Libro de IVA Digital de ARCA (largo exacto y
// valores armados a mano campo por campo según el diseño de registro).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarLibro, filaLibro, resumenIva, lineaVentaCbte, lineasVentaAlicuotas, lineaCompraCbte, lineasCompraAlicuotas,
  lineasCompraImportaciones, archivosLibroIvaDigital, clasificarImpuestosDespacho, baseIvaDespacho, periodoDeRango, rangoMes,
  importe, num, txt, cambioTxt, tipoCompra, LARGO, ADUANA, type CbteIva,
} from "@/lib/administracion/libro-iva";
import { crc32, armarZip } from "@/lib/zip";

const base = (x: Partial<CbteIva>): CbteIva => ({
  origen: "venta", id: 1, fecha: "2026-09-05", tipo: 1, puntoVenta: 1, numero: "123", docTipo: 80, docNro: "30712345678", nombre: "Cliente SA",
  condicionIva: "IVA Responsable Inscripto", moneda: "PES", cotizacion: 1, nc: false, alicuotas: [], noGravado: 0, exento: 0, sinDiscriminar: 0,
  percepcionIva: 0, percepcionNacionales: 0, percepcionIibb: 0, percepcionMunicipal: 0, impuestosInternos: 0, otros: 0, total: 0, ...x,
});
const Z15 = "0".repeat(15);

// ── Fixtures ──
const FA = base({ id: 1, alicuotas: [{ pct: 21, base: 1000, iva: 210 }], total: 1210 });
const FB = base({ id: 2, fecha: "2026-09-07", tipo: 6, numero: "50", docTipo: 99, docNro: "0", nombre: "Consumidor final", condicionIva: "Consumidor Final",
  alicuotas: [{ pct: 21, base: 2000, iva: 420 }], total: 2420 });
const NCA = base({ id: 3, fecha: "2026-09-08", tipo: 3, numero: "7", nc: true, alicuotas: [{ pct: 21, base: 100, iva: 21 }], total: 121 });
const NCB_USD = base({ id: 4, fecha: "2026-09-09", tipo: 8, numero: "10", docTipo: 96, docNro: "25123456", nombre: "Juan Pérez", nc: true, moneda: "DOL", cotizacion: 1000.5,
  alicuotas: [{ pct: 21, base: 100, iva: 21 }], total: 121 });

const CA = base({ origen: "compra", id: 10, fecha: "2026-09-10", tipo: 1, puntoVenta: 3, numero: "456", docNro: "30500010912", nombre: "Proveedor SRL",
  alicuotas: [{ pct: 21, base: 1000, iva: 210 }, { pct: 10.5, base: 2000, iva: 210 }], percepcionIva: 30, percepcionIibb: 25.5, total: 3475.5 });
const CB = base({ origen: "compra", id: 11, fecha: "2026-09-11", tipo: 6, puntoVenta: 2, numero: "99", docNro: "20111111112", nombre: "Monotrib B", sinDiscriminar: 1210, total: 1210 });
const CC = base({ origen: "compra", id: 12, fecha: "2026-09-12", tipo: 11, puntoVenta: 4, numero: "5", docNro: "20222222223", nombre: "Ferretería Ñandú", sinDiscriminar: 500, total: 500 });
const imp = clasificarImpuestosDespacho([
  { concepto: "IVA", importe_ars: 274890 }, { concepto: "IVA adicional", importe_ars: 261800 }, { concepto: "Ganancias", importe_ars: 78540 }, { concepto: "IIBB", importe_ars: 32725 },
]);
const bDesp = baseIvaDespacho(imp.iva, 1_000 * 1_100 + 176_000 + 33_000);
const DESP = base({ origen: "despacho", id: 20, fecha: "2026-09-20", tipo: 66, puntoVenta: 0, numero: "0", despacho: "26001IC04012345X", docNro: ADUANA.cuit, nombre: ADUANA.nombre,
  alicuotas: [{ pct: bDesp.pct, base: bDesp.base, iva: imp.iva }], percepcionIva: imp.percepcionIva, percepcionNacionales: imp.percepcionNacionales, percepcionIibb: imp.percepcionIibb,
  total: bDesp.base + imp.iva + imp.percepcionIva + imp.percepcionNacionales + imp.percepcionIibb });

// ── El libro ──

test("ventas: NC restan, dólares a la cotización, orden por fecha y totales", () => {
  const { filas, totales } = armarLibro([NCB_USD, FB, NCA, FA]);
  assert.deepEqual(filas.map((f) => f.c.id), [1, 2, 3, 4]);
  assert.equal(filas[2].neto[21], -100);
  assert.equal(filas[2].iva[21], -21);
  assert.equal(filas[2].total, -121);
  const usd = filaLibro(NCB_USD);
  assert.equal(usd.neto[21], -100050);
  assert.equal(usd.iva[21], -21010.5);
  assert.equal(usd.total, -121060.5);
  assert.equal(totales.neto[21], 1000 + 2000 - 100 - 100050);
  assert.equal(totales.iva[21], 210 + 420 - 21 - 21010.5);
  assert.equal(totales.total, 1210 + 2420 - 121 - 121060.5);
});

test("compras: A con 21 y 10,5 da crédito; B y C van sin crédito; despacho con IVA, IVA adicional, ganancias e IIBB", () => {
  const { filas, totales } = armarLibro([DESP, CC, CA, CB]);
  assert.deepEqual(filas.map((f) => f.c.id), [10, 11, 12, 20]);
  assert.equal(totales.neto[21], 1000 + 1_309_000);
  assert.equal(totales.neto[10.5], 2000);
  assert.equal(totales.iva[21], 210 + 274890);
  assert.equal(totales.iva[10.5], 210);
  assert.equal(totales.sinDiscriminar, 1710);
  assert.equal(totales.percepcionIva, 30 + 261800);
  assert.equal(totales.percepcionIibb, 25.5 + 32725);
  assert.equal(totales.otros, 78540);
  assert.equal(totales.total, 3475.5 + 1210 + 500 + 1_956_955);
});

test("despacho: impuestos clasificados y base del IVA por alícuota", () => {
  assert.deepEqual(imp, { iva: 274890, percepcionIva: 261800, percepcionNacionales: 78540, percepcionIibb: 32725, otros: 0 });
  assert.deepEqual(bDesp, { pct: 21, base: 1_309_000, dudosa: false });
  assert.deepEqual(baseIvaDespacho(105, 1000), { pct: 10.5, base: 1000, dudosa: false });
  assert.equal(baseIvaDespacho(150, 1000).dudosa, true);
  assert.equal(clasificarImpuestosDespacho([{ concepto: "Percepción IVA RG 2937", importe_ars: 10 }, { concepto: "Ingresos Brutos", importe_ars: 5 }, { concepto: "Tasa X", importe_ars: 1 }]).percepcionIva, 10);
});

test("saldo técnico: débito − crédito, percepciones aparte", () => {
  const v = armarLibro([FA, FB, NCA]).totales;
  const c = armarLibro([CA, CB, CC]).totales;
  const r = resumenIva(v, c);
  assert.equal(r.debito, 609);
  assert.equal(r.credito, 420);
  assert.equal(r.saldoTecnico, 189);
  assert.equal(r.percepciones, 30);
  assert.equal(r.saldoConPercepciones, 159);
  assert.deepEqual(r.alicuotas.map((a) => [a.pct, a.baseVentas, a.debito, a.baseCompras, a.credito]), [[21, 2900, 609, 1000, 210], [10.5, 0, 0, 2000, 210]]);
});

// ── Campos ──

test("campos de ancho fijo", () => {
  assert.equal(importe(1210), "000000000121000");
  assert.equal(importe(0.07), "000000000000007");
  assert.equal(importe(-5), "-00000000000500");
  assert.equal(num("30-71234567-8", 20), "00000000030712345678");
  assert.equal(txt("Ferretería Ñandú", 20), "Ferreteria Nandu    ");
  assert.equal(txt("x".repeat(40), 30).length, 30);
  assert.equal(cambioTxt(1), "0001000000");
  assert.equal(cambioTxt(1000.5), "1000500000");
  assert.equal(tipoCompra("A", false, false), 1);
  assert.equal(tipoCompra("B", true, false), 8);
  assert.equal(tipoCompra("C", false, true), 12);
  assert.equal(tipoCompra("M", false, false), 51);
  assert.equal(tipoCompra("X", false, false), null);
});

// ── Renglones del Libro de IVA Digital ──

test("VENTAS_CBTE: factura A, 266 posiciones campo por campo", () => {
  const l = lineaVentaCbte(FA);
  assert.equal(l.length, LARGO.ventasCbte);
  const esperado = "20260905" + "001" + "00001" + "00000000000000000123" + "00000000000000000123" + "80" + "00000000030712345678" + "Cliente SA".padEnd(30)
    + "000000000121000" + Z15 + Z15 + Z15 + Z15 + Z15 + Z15 + Z15 + "PES" + "0001000000" + "1" + "0" + Z15 + "00000000";
  assert.equal(l, esperado);
});

test("VENTAS_CBTE: NC B en dólares a consumidor con DNI y factura B sin identificar", () => {
  const l = lineaVentaCbte(NCB_USD);
  assert.equal(l.length, 266);
  assert.equal(l.slice(8, 11), "008");
  assert.equal(l.slice(56, 58), "96");
  assert.equal(l.slice(58, 78), "00000000000025123456");
  assert.equal(l.slice(78, 108), "Juan Perez".padEnd(30));
  assert.equal(l.slice(108, 123), "000000000012100"); // en la moneda del comprobante
  assert.equal(l.slice(228, 231), "DOL");
  assert.equal(l.slice(231, 241), "1000500000");
  const b = lineaVentaCbte(FB);
  assert.equal(b.slice(56, 78), "99" + "0".repeat(20));
});

test("VENTAS_ALICUOTAS: 62 posiciones", () => {
  const [l] = lineasVentaAlicuotas(FA);
  assert.equal(l, "001" + "00001" + "00000000000000000123" + "000000000100000" + "0005" + "000000000021000");
  assert.equal(l.length, LARGO.ventasAlicuotas);
  // Sin alícuotas (exenta), una de 0 % con base cero y código de operación E.
  const ex = base({ id: 9, exento: 500, total: 500 });
  assert.deepEqual(lineasVentaAlicuotas(ex), ["001" + "00001" + "00000000000000000123" + Z15 + "0003" + Z15]);
  assert.equal(lineaVentaCbte(ex).slice(242, 243), "E");
});

test("COMPRAS_CBTE: factura A con 21 y 10,5 y percepciones, 325 posiciones campo por campo", () => {
  const l = lineaCompraCbte(CA);
  assert.equal(l.length, LARGO.comprasCbte);
  const esperado = "20260910" + "001" + "00003" + "00000000000000000456" + " ".repeat(16) + "80" + "00000000030500010912" + "Proveedor SRL".padEnd(30)
    + "000000000347550" + Z15 + Z15 + "000000000003000" + Z15 + "000000000002550" + Z15 + Z15
    + "PES" + "0001000000" + "2" + "0" + "000000000042000" + Z15 + "0".repeat(11) + " ".repeat(30) + Z15;
  assert.equal(l, esperado);
});

test("COMPRAS_ALICUOTAS: 84 posiciones, una por alícuota; B y C no van", () => {
  const ls = lineasCompraAlicuotas(CA);
  assert.deepEqual(ls, [
    "001" + "00003" + "00000000000000000456" + "80" + "00000000030500010912" + "000000000100000" + "0005" + "000000000021000",
    "001" + "00003" + "00000000000000000456" + "80" + "00000000030500010912" + "000000000200000" + "0004" + "000000000021000",
  ]);
  for (const l of ls) assert.equal(l.length, LARGO.comprasAlicuotas);
  assert.deepEqual(lineasCompraAlicuotas(CB), []);
  const b = lineaCompraCbte(CB);
  assert.equal(b.length, 325);
  assert.equal(b.slice(237, 239), "00");          // 0 alícuotas, código de operación 0
  assert.equal(b.slice(239, 254), Z15);           // sin crédito fiscal
  assert.equal(b.slice(104, 119), "000000000121000");
});

test("despacho: COMPRAS_CBTE tipo 066 con el número de despacho y COMPRAS_IMPORTACIONES de 50", () => {
  const l = lineaCompraCbte(DESP);
  assert.equal(l.length, 325);
  const esperado = "20260920" + "066" + "00000" + "0".repeat(20) + "26001IC04012345X" + "80" + "00000000033693450239" + "DIRECCION GENERAL DE ADUANAS".padEnd(30)
    + "000000195695500" + Z15 + Z15 + "000000026180000" + "000000007854000" + "000000003272500" + Z15 + Z15
    + "PES" + "0001000000" + "1" + "0" + "000000027489000" + Z15 + "0".repeat(11) + " ".repeat(30) + Z15;
  assert.equal(l, esperado);
  assert.deepEqual(lineasCompraAlicuotas(DESP), []);
  const [i] = lineasCompraImportaciones(DESP);
  assert.equal(i, "26001IC04012345X" + "000000130900000" + "0005" + "000000027489000");
  assert.equal(i.length, LARGO.comprasImportaciones);
});

test("los cinco archivos: nombres, renglones con CRLF y largos", () => {
  const a = archivosLibroIvaDigital("202609", [FA, FB, NCA, NCB_USD], [CA, CB, CC, DESP]);
  assert.deepEqual(a.map((x) => [x.nombre, x.renglones]), [
    ["LIBRO_IVA_DIGITAL_VENTAS_CBTE_202609.txt", 4],
    ["LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_202609.txt", 4],
    ["LIBRO_IVA_DIGITAL_COMPRAS_CBTE_202609.txt", 4],
    ["LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_202609.txt", 2],
    ["LIBRO_IVA_DIGITAL_IMPORTACIONES_202609.txt", 1],
  ]);
  const largos = [266, 62, 325, 84, 50];
  a.forEach((x, k) => {
    assert.ok(x.contenido.endsWith("\r\n"));
    for (const r of x.contenido.split("\r\n").slice(0, -1)) assert.equal(r.length, largos[k], x.nombre);
    assert.ok(/^[\x20-\x7E\r\n]*$/.test(x.contenido));
  });
});

test("período: mes entero o no; zip con CRC correcto", () => {
  assert.deepEqual(rangoMes("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.equal(periodoDeRango("2026-09-01", "2026-09-30"), "202609");
  assert.equal(periodoDeRango("2026-09-01", "2026-09-29"), null);
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const z = armarZip([{ nombre: "a.txt", contenido: "hola\r\n" }, { nombre: "b.txt", contenido: "" }]);
  assert.equal(z.readUInt32LE(0), 0x04034b50);
  assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50);
  assert.equal(z.readUInt16LE(z.length - 12), 2);
});
