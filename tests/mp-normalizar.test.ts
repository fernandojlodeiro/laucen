// Tests de la exportación de Mercado Pago (lib/mercadopago/normalizar.ts): la
// lectura de los CSV de Mercado Pago (JSON con comillas sin escapar adentro),
// los movimientos sin duplicados cuando dos archivos se pisan, y el control
// del saldo del mes contra Liquidaciones.

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCsvMp, normalizar, tramoDe, type DatosExport } from "@/lib/mercadopago/normalizar";

const CAB = "EXTERNAL_REFERENCE,SOURCE_ID,USER_ID,PAYMENT_METHOD_TYPE,PAYMENT_METHOD,SITE,TRANSACTION_TYPE,TRANSACTION_AMOUNT,TRANSACTION_CURRENCY,TRANSACTION_DATE,FEE_AMOUNT,SETTLEMENT_NET_AMOUNT,SETTLEMENT_CURRENCY,SETTLEMENT_DATE,REAL_AMOUNT,COUPON_AMOUNT,METADATA";
const PAGO = ',176725980154,1,available_money,available_money,MLA,SETTLEMENT,-130949.00,ARS,2026-09-01T14:50:12.000-03:00,0.00,-130949.00,ARS,2026-09-01T14:50:13.000-03:00,-130949.00,0.00,"[{}]"';
const RENDIMIENTO = ",1750794498405,1,,,MLA,SETTLEMENT,47.64,ARS,2026-09-30T01:08:42.000-03:00,0.00,47.64,ARS,2026-09-30T01:08:42.000-03:00,47.64,0.00,\"[{}]\"";
const TRANSF = '"ref,con coma",181684466788,1,available_money,available_money,MLA,SETTLEMENT,-850000.00,ARS,2026-09-30T17:01:43.000-04:00,0.00,-855100.00,ARS,2026-09-30T17:01:44.000-04:00,-855100.00,0.00,"[{"amount":-5100,"detail":"tax"}]"';

test("lee los CSV de Mercado Pago aunque el JSON traiga comillas y comas adentro", () => {
  const t = leerCsvMp(`${CAB}\n${TRANSF}\n`);
  assert.equal(t.cab.length, 17);
  assert.equal(t.filas[0].length, 17);
  assert.equal(t.filas[0][0], "ref,con coma");
  assert.equal(t.filas[0][11], "-855100.00");
  assert.equal(t.filas[0][16], '[{"amount":-5100,"detail":"tax"}]');
  // Con punto y coma (otra configuración de la cuenta).
  const pc = leerCsvMp("DATE;SOURCE_ID;DESCRIPTION\n2026-09-01T00:00:00.000-03:00;;\n");
  assert.deepEqual(pc.filas[0], ["2026-09-01T00:00:00.000-03:00", "", ""]);
});

const archivo = (id: number, nombre: string, texto: string, bajado: string, fuente = "settlement_report") =>
  ({ id, fuente, nombre, desde: new Date("2026-09-01T03:00:00Z"), hasta: new Date("2026-10-01T02:59:59Z"), bajado: new Date(bajado), contenido: Buffer.from(texto, "utf8") });

test("sin duplicados entre archivos que se pisan; la misma fila repetida en un archivo cuenta las veces que aparece", async () => {
  const a1 = archivo(1, "viejo.csv", `${CAB}\n${PAGO}\n${RENDIMIENTO}\n${RENDIMIENTO}\n`, "2026-10-17T00:00:00Z");
  const a2 = archivo(2, "nuevo.csv", `${CAB}\n${PAGO}\n${RENDIMIENTO}\n${RENDIMIENTO}\n${TRANSF}\n`, "2026-10-18T00:00:00Z");
  const pagos = archivo(3, "payments_hechos-2026-09.json", JSON.stringify([{ id: 176725980154, operation_type: "regular_payment", status: "approved", description: "Tablet", collector_id: 9, transaction_details: { total_paid_amount: 130949 } }]), "2026-10-18T00:00:00Z", "payments_hechos");
  const datos: DatosExport[] = [{
    cuenta: { id: 1, mpUserId: 1, alias: "PERSONAL", titular: "X", documento: null, ambito: "personal" },
    archivos: [a1, a2, pagos], cola: [],
  }];
  const { movimientos } = await normalizar(datos, new Date("2026-10-18T05:00:00Z"));
  assert.equal(movimientos.length, 4);
  assert.equal(movimientos.filter((m) => m.movimiento_id === "1750794498405").length, 2);
  assert.ok(movimientos.every((m) => m.archivo === "nuevo.csv"), "toma las filas del archivo bajado más recientemente");
  const tablet = movimientos.find((m) => m.movimiento_id === "176725980154")!;
  assert.equal(tablet.direccion, "salida");
  assert.equal(tablet.api_descripcion, "Tablet");
  assert.equal(tablet.mes, "2026-09");
  assert.equal(tablet.tramo, "año comparable");
  const transf = movimientos.find((m) => m.movimiento_id === "181684466788")!;
  assert.equal(transf.importe_neto, -855100);
  assert.equal(transf.fecha_operacion, "2026-09-30T18:01:43-03:00", "pasa la hora de -04:00 a hora argentina");
  assert.equal(new Set(movimientos.map((m) => m.clave_dedup)).size, 4);
});

test("el control del mes cierra contra Liquidaciones (retiros tomados de Liquidaciones si el reporte no los trae)", async () => {
  const todas = archivo(1, "todas.csv", `${CAB}\n${PAGO}\n${RENDIMIENTO}\n`, "2026-10-18T00:00:00Z");
  const liq = archivo(2, "liq.csv", [
    "DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT;BALANCE_AMOUNT",
    "2026-09-01T00:00:00.000-03:00;;;200000.00;0.00;200000.00",
    "2026-09-01T10:00:00.000-03:00;176725980154;payment;0.00;130949.00;69051.00",
    "2026-09-30T01:08:42.000-03:00;1750794498405;asset_management;47.64;0.00;69098.64",
    "2026-09-30T12:00:00.000-03:00;99;payout;0.00;60000.00;9098.64",
    ";;;9098.64;0.00;0.00",
  ].join("\n"), "2026-10-18T00:00:00Z", "release_report");
  const cola = [{ fuente: "release_report", etiqueta: "2026-09", desde: liq.desde, hasta: liq.hasta, estado: "listo", mensaje: null, archivos: ["liq.csv"], actualizado: new Date() },
    { fuente: "settlement_report", etiqueta: "2026-09", desde: liq.desde, hasta: liq.hasta, estado: "listo", mensaje: null, archivos: ["todas.csv"], actualizado: new Date() }];
  const { controles, cobertura } = await normalizar([{ cuenta: { id: 1, mpUserId: 1, alias: "P", titular: null, documento: null, ambito: "personal" }, archivos: [todas, liq], cola }], new Date("2026-10-18T05:00:00Z"));
  const c = controles.find((x) => x.mes === "2026-09")!;
  assert.equal(c.saldo_inicial, 200000);
  assert.equal(c.saldo_final, 9098.64);
  assert.equal(c.retiros_liquidaciones, 60000);
  assert.equal(c.diferencia, 0);
  assert.equal(c.nota, "cierra");
  assert.equal(cobertura.find((x) => x.fuente === "Todas las transacciones")!.filas, 2);
});

test("tramos: año comparable, mes en curso y anterior", () => {
  const hoy = new Date("2026-10-18T05:00:00Z");
  assert.equal(tramoDe("2025-10", hoy), "año comparable");
  assert.equal(tramoDe("2026-09", hoy), "año comparable");
  assert.equal(tramoDe("2026-10", hoy), "mes en curso (parcial)");
  assert.equal(tramoDe("2025-09", hoy), "anterior");
});

// Lee un .zip (guardado o deflate) para los tests: nombre → contenido.
import { inflateRawSync } from "node:zlib";
import { paqueteExportacion } from "@/lib/mercadopago/normalizar";
function leerZip(z: Buffer) {
  const salida = new Map<string, Buffer>();
  let i = 0;
  while (z.readUInt32LE(i) === 0x04034b50) {
    const metodo = z.readUInt16LE(i + 8), largo = z.readUInt32LE(i + 18), largoNombre = z.readUInt16LE(i + 26), extra = z.readUInt16LE(i + 28);
    const nombre = z.subarray(i + 30, i + 30 + largoNombre).toString("utf8");
    const datos = z.subarray(i + 30 + largoNombre + extra, i + 30 + largoNombre + extra + largo);
    salida.set(nombre, metodo === 8 ? inflateRawSync(datos) : datos);
    i += 30 + largoNombre + extra + largo;
  }
  return salida;
}

test("paquete: consolidado de varias cuentas sin duplicados, retiros que faltan tomados de Liquidaciones y originales tal cual", async () => {
  const desde = new Date("2025-10-01T03:00:00Z"), hasta = new Date("2025-11-01T02:59:59Z");
  const todas = archivo(1, "todas.csv", `${CAB}\n${PAGO.replaceAll("2026-09-01", "2025-10-01")}\n`, "2026-10-18T00:00:00Z");
  const liq = archivo(2, "liq.csv", [
    "DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT;BALANCE_AMOUNT",
    "2025-10-01T00:00:00.000-03:00;;;500000.00;0.00;500000.00",
    "2025-10-01T10:00:00.000-03:00;176725980154;payment;0.00;130949.00;369051.00",
    "2025-10-20T12:00:00.000-03:00;555;payout;0.00;100000.00;269051.00",
    ";;;269051.00;0.00;0.00",
  ].join("\n"), "2026-10-18T00:00:00Z", "release_report");
  const cola = [{ fuente: "release_report", etiqueta: "2025-10", desde, hasta, estado: "listo", mensaje: null, archivos: ["liq.csv"], actualizado: new Date() },
    { fuente: "settlement_report", etiqueta: "2025-10", desde, hasta, estado: "listo", mensaje: null, archivos: ["todas.csv"], actualizado: new Date() }];
  const datos: DatosExport[] = [
    { cuenta: { id: 1, mpUserId: 1, alias: "PERSONAL", titular: "Persona", documento: "20111", ambito: "personal" }, archivos: [todas, liq], cola },
    { cuenta: { id: 2, mpUserId: 2, alias: "EMPRESA", titular: "EMPRESA SA", documento: "30999", ambito: "empresa" }, archivos: [], cola: [] },
  ];
  const p = await paqueteExportacion(datos, "prueba", "movimientos");
  const z = leerZip(p.zip);
  const consolidado = z.get("movimientos_consolidado.csv")!.toString("utf8");
  const filas = consolidado.trim().split("\n");
  assert.equal(filas.length, 3, "cabecera + el pago + el retiro tomado de Liquidaciones");
  assert.ok(filas[0].includes("titular_documento") && filas[0].includes("destino"));
  const retiro = filas.find((f) => f.includes("Liquidaciones"))!;
  assert.ok(retiro.includes(",555,") && retiro.includes("-100000") && retiro.includes("no informado por Mercado Pago"));
  assert.ok(z.has("por_cuenta/movimientos_Persona_1.csv") && z.has("por_cuenta/movimientos_EMPRESA_SA_2.csv"));
  const cob = z.get("cobertura_por_cuenta_y_mes.csv")!.toString("utf8");
  assert.ok(cob.includes("completo"), cob);

  const o = await paqueteExportacion(datos, "prueba", "originales", 1);
  const zo = leerZip(o.zip);
  assert.equal(zo.get("originales_Persona_1/liquidaciones/liq.csv")!.toString("utf8"), liq.contenido.toString("utf8"));
  assert.ok(zo.has("originales_Persona_1/lista_de_originales.csv"));
});
