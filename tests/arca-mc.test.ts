// Tests de "Importar de ARCA (Mis Comprobantes – Recibidos)": las dos
// versiones de columnas, el signo de las notas de crédito, los proveedores
// nuevos, la cuenta de gasto recordada, que importar dos veces no duplique y
// que lo cargado a mano distinto no se toque. Cada test arma su propia
// organización y no borra nada (mismas reglas que tests/cimiento.test.ts).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("TEST_DATABASE_URL no está cargada: no corren los tests de la base.");
  process.exit(0);
}
process.env.DATABASE_URL = url;

type Mods = {
  db: typeof import("@/db");
  esquema: typeof import("@/lib/erp/esquema");
  leer: typeof import("@/lib/administracion/arca-mc-leer");
  mc: typeof import("@/lib/administracion/arca-mc");
  cont: typeof import("@/lib/administracion/contabilidad");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    leer: await import("@/lib/administracion/arca-mc-leer"),
    mc: await import("@/lib/administracion/arca-mc"),
    cont: await import("@/lib/administracion/contabilidad"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const VIEJA = readFileSync(path.join(process.cwd(), "tests/datos/arca-mc-vieja.csv"), "utf8");
const NUEVA = readFileSync(path.join(process.cwd(), "tests/datos/arca-mc-nueva.csv"), "utf8");

async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, '2026-01-01', 1300, 'test')", [org]);
  await m.cont.asegurarPlan(org);
  const rol = async (r: string) => Number((await q<{ id: string }>("select id from plan_cuenta where organizacion_id = $1 and rol = $2", [org, r]))[0].id);
  return { org, rol };
}

test("lee la versión vieja: título arriba, alícuota deducida (y mezcla 21 + 10,5), NC, B y C, tipo desconocido", () => {
  const l = m.leer.leerCsvArca(VIEJA);
  assert.equal(l.version, "vieja");
  assert.equal(l.comprobantes.length, 5);
  assert.equal(l.errores.length, 1, "el tipo 99 no se conoce");
  const [ml, fa, nc, fc, fb] = l.comprobantes;
  assert.deepEqual([ml.letra, ml.puntoVenta, ml.numero, ml.cuit, ml.total, ml.fecha], ["A", 3, 1234, "30703088534", 12400, "2026-09-05"]);
  assert.deepEqual(ml.alicuotas, [{ pct: 21, neto: 10000, iva: 2100 }]);
  assert.equal(ml.otrosTributos, 300);
  assert.deepEqual(fa.alicuotas.map((a) => [a.pct, a.neto, a.iva]), [[21, 1000, 210], [10.5, 2000, 210]]);
  assert.ok(nc.nc && !nc.nd && nc.tipo === 3);
  assert.equal(fc.letra, "C");
  assert.equal(fb.letra, "B");
  const armada = m.leer.armarFactura(fb);
  assert.deepEqual(armada.lineas.map((x) => [x.neto, x.iva]), [[12100, 0]], "en una B el total entero es gasto");
  const ama = m.leer.armarFactura(ml);
  assert.equal(ama.otrosImpuestos, 300);
  assert.equal(ama.error, null);
});

test("lee la versión nueva: IVA por alícuota, no gravado, otros tributos, dólares y nota de débito", () => {
  const l = m.leer.leerCsvArca(NUEVA);
  assert.equal(l.version, "nueva");
  assert.equal(l.errores.length, 0);
  const [a, usd, , nd] = l.comprobantes;
  assert.deepEqual(a.alicuotas.map((x) => [x.pct, x.neto, x.iva]), [[21, 1000, 210], [10.5, 500, 52.5]]);
  assert.deepEqual([a.noGravado, a.otrosTributos, a.total, a.fecha], [100, 50, 1912.5, "2026-09-20"]);
  assert.deepEqual([usd.moneda, usd.cotizacion, usd.total], ["USD", 1350.5, 121]);
  assert.ok(nd.nd && !nd.nc && nd.numero === 777);
  assert.equal(m.leer.armarFactura(a).error, null);
  // Un archivo de emitidos se rechaza.
  const emitidos = m.leer.leerCsvArca('"Fecha";"Tipo";"Punto de Venta";"Número Desde";"Nro. Doc. Receptor";"Denominación Receptor";"Imp. Total"\n"01/09/2026";"1";"1";"1";"20111111112";"X";"10"');
  assert.match(emitidos.errores[0], /EMITIDOS/);
});

test("importa: proveedores nuevos, cuenta recordada, NC resta, asientos que balancean; dos veces no duplica; lo distinto no se toca", async () => {
  const e = await escenario();
  const fletes = await e.rol("fletes"), varios = await e.rol("gastos_varios"), comisiones = await e.rol("comisiones");
  // Un proveedor que ya existe, con su cuenta recordada.
  const norte = Number((await q<{ id: string }>("insert into proveedor (organizacion_id, nombre, cuit, cuenta_gasto_id) values ($1, 'Distribuidora Norte', '30-71234567-1', $2) returning id", [e.org, fletes]))[0].id);
  // Una factura cargada a mano con otro total (la C de Pérez): no se toca.
  const perez = Number((await q<{ id: string }>("insert into proveedor (organizacion_id, nombre, cuit) values ($1, 'Juan Pérez', '20255556666') returning id", [e.org]))[0].id);
  await q(`insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha, total, total_ars, estado)
           values ($1, $2, 'C', 2, 45, '2026-09-12', 7000, 7000, 'registrada')`, [e.org, perez]);

  const lote = await m.mc.guardarLote(e.org, "vieja.csv", m.leer.leerCsvArca(VIEJA), "u1");
  const v = (await m.mc.vistaPrevia(e.org, lote))!;
  const estados = v.filas.map((f) => f.estado);
  assert.deepEqual(estados, ["nueva", "nueva", "nueva", "distinta", "nueva"]);
  const pNorte = v.proveedores.find((p) => p.cuit === "30712345671")!;
  assert.equal(pNorte.proveedorId, norte);
  assert.equal(pNorte.cuentaId, fletes, "propone la cuenta recordada");
  const pMl = v.proveedores.find((p) => p.cuit === "30703088534")!;
  assert.ok(pMl.mercadoLibre && pMl.proveedorId == null);
  assert.equal(pMl.cuentaId, comisiones, "Mercado Libre va a comisiones");
  assert.equal(v.proveedores.find((p) => p.cuit === "30709998885")!.cuentaId, varios);

  // Elige otra cuenta para Fletes Rápidos: queda recordada.
  const r = await m.mc.importarLote(e.org, lote, { "30709998885": fletes }, "u1");
  assert.deepEqual([r.cargadas, r.yaEstaban, r.distintas, r.errores.length, r.proveedoresNuevos], [4, 0, 1, 0, 2]);
  const fr = await q<{ id: string; cuenta_gasto_id: string }>("select id, cuenta_gasto_id from proveedor where organizacion_id = $1 and cuit = '30709998885'", [e.org]);
  assert.equal(fr.length, 1);
  assert.equal(Number(fr[0].cuenta_gasto_id), fletes);
  // La C cargada a mano sigue igual (7000) y sola.
  const cs = await q<{ total: string }>("select total from factura_compra where organizacion_id = $1 and proveedor_id = $2", [e.org, perez]);
  assert.deepEqual(cs.map((x) => Number(x.total)), [7000]);

  // Registradas, con su cuenta corriente: la NC resta.
  const saldoNorte = Number((await q<{ s: string }>("select sum(importe_ars) s from cc_movimiento where organizacion_id = $1 and tercero_tipo = 'proveedor' and tercero_id = $2", [e.org, norte]))[0].s);
  assert.equal(saldoNorte, 3420 - 605);
  const fa = (await q<{ neto: string; iva: string; iva_detalle: { pct: number; base: number }[]; origen: string; cae: string; estado: string; cuenta_gasto_id: string }>(
    "select neto, iva, iva_detalle, origen, cae, estado, cuenta_gasto_id from factura_compra where organizacion_id = $1 and proveedor_id = $2 and numero = 777", [e.org, norte]))[0];
  assert.deepEqual([Number(fa.neto), Number(fa.iva), fa.origen, fa.cae, fa.estado, Number(fa.cuenta_gasto_id)], [3000, 420, "arca_mc", "76123456789013", "registrada", fletes]);
  assert.equal(fa.iva_detalle.length, 2);
  // La B: el total entero como gasto, sin IVA.
  const fb = (await q<{ neto: string; iva: string; total: string }>("select f.neto, f.iva, f.total from factura_compra f join proveedor p on p.id = f.proveedor_id where f.organizacion_id = $1 and p.cuit = '30709998885'", [e.org]))[0];
  assert.deepEqual([Number(fb.neto), Number(fb.iva), Number(fb.total)], [12100, 0, 12100]);

  // Asientos: cada factura el suyo, balanceados; la de ML a comisiones y con "otros impuestos".
  const asientos = await q<{ d: string; h: string }>(`select sum(l.debe) d, sum(l.haber) h from asiento a join asiento_linea l on l.asiento_id = a.id
    where a.organizacion_id = $1 and a.origen = 'compra' group by a.id`, [e.org]);
  assert.equal(asientos.length, 4);
  for (const a of asientos) assert.equal(Number(a.d).toFixed(2), Number(a.h).toFixed(2));
  const deMl = await q<{ rol: string | null; debe: string }>(`select p.rol, l.debe from asiento a join asiento_linea l on l.asiento_id = a.id join plan_cuenta p on p.id = l.cuenta_id
    where a.organizacion_id = $1 and a.origen = 'compra' and a.concepto like '%00003-1234 ·%' and l.debe > 0`, [e.org]);
  assert.deepEqual(Object.fromEntries(deMl.map((x) => [x.rol, Number(x.debe)])), { comisiones: 10000, iva_credito: 2100, impuestos: 300 });

  // Dos veces el mismo archivo: nada nuevo.
  const lote2 = await m.mc.guardarLote(e.org, "vieja.csv", m.leer.leerCsvArca(VIEJA), "u1");
  const v2 = (await m.mc.vistaPrevia(e.org, lote2))!;
  assert.deepEqual(v2.filas.map((f) => f.estado), ["ya_cargada", "ya_cargada", "ya_cargada", "distinta", "ya_cargada"]);
  assert.equal(v2.proveedores.find((p) => p.cuit === "30709998885")!.cuentaId, fletes, "la cuenta quedó recordada");
  const r2 = await m.mc.importarLote(e.org, lote2, {}, "u1");
  assert.deepEqual([r2.cargadas, r2.yaEstaban], [0, 4]);

  // La versión nueva: la FA 777 ya estaba; la ND 777 es otra (numeración propia); la de dólares entra.
  const lote3 = await m.mc.guardarLote(e.org, "nueva.csv", m.leer.leerCsvArca(NUEVA), "u1");
  const v3 = (await m.mc.vistaPrevia(e.org, lote3))!;
  assert.deepEqual(v3.filas.map((f) => f.estado), ["nueva", "nueva", "ya_cargada", "nueva"]);
  const r3 = await m.mc.importarLote(e.org, lote3, {}, "u1");
  assert.deepEqual([r3.cargadas, r3.yaEstaban, r3.errores.length], [3, 1, 0]);
  const usd = (await q<{ moneda: string; total_ars: string }>("select f.moneda, f.total_ars from factura_compra f join proveedor p on p.id = f.proveedor_id where f.organizacion_id = $1 and p.cuit = '33698765432'", [e.org]))[0];
  assert.deepEqual([usd.moneda, Number(usd.total_ars)], ["USD", 163410.5]);
  const nd = await q("select 1 from factura_compra where organizacion_id = $1 and proveedor_id = $2 and es_nota_debito and numero = 777", [e.org, norte]);
  assert.equal(nd.length, 1);
});
