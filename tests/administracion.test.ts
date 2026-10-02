// Tests de Administración (sesión 5): factura de compra → stock, costo y
// cuenta corriente; despacho con prorrateo; orden de pago y recibo con
// imputación; transferencias; conciliación; asientos automáticos que
// balancean. Mismas reglas que tests/cimiento.test.ts: cada test arma su
// propia organización y no borra nada.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("TEST_DATABASE_URL no está cargada: no corren los tests de la base.");
  process.exit(0);
}
process.env.DATABASE_URL = url;

type Mods = {
  db: typeof import("@/db");
  esquema: typeof import("@/lib/erp/esquema");
  compras: typeof import("@/lib/administracion/compras");
  cc: typeof import("@/lib/administracion/cc");
  tes: typeof import("@/lib/administracion/tesoreria");
  cont: typeof import("@/lib/administracion/contabilidad");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    compras: await import("@/lib/administracion/compras"),
    cc: await import("@/lib/administracion/cc"),
    tes: await import("@/lib/administracion/tesoreria"),
    cont: await import("@/lib/administracion/contabilidad"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);
const hoy = new Date().toISOString().slice(0, 10);

async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date - 1, 1000, 'test')", [org]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const proveedor = await id("insert into proveedor (organizacion_id, nombre) values ($1, 'Proveedor SA') returning id", [org]);
  const cliente = await id("insert into cliente (organizacion_id, nombre, cuenta_corriente) values ($1, 'Cliente SRL', true) returning id", [org]);
  const banco = await id("insert into cuenta_fondos (organizacion_id, nombre, tipo) values ($1, 'Banco', 'banco') returning id", [org]);
  const caja = await id("insert into cuenta_fondos (organizacion_id, nombre, tipo, saldo_inicial) values ($1, 'Caja', 'caja', 50000) returning id", [org]);
  const producto = async (sku: string) => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo, tipo) values ($1, $2, $3, 'simple') returning id", [org, sku, `Producto ${sku}`]);
    return id("select id from variacion where producto_id = $1 and es_default", [p]);
  };
  return { org, deposito, proveedor, cliente, banco, caja, producto };
}

const stockDe = async (org: string, v: number) => Number((await q<{ n: string }>("select coalesce(sum(cantidad), 0) n from stock where organizacion_id = $1 and variacion_id = $2", [org, v]))[0].n);
const saldoCc = async (org: string, t: string, tid: number) =>
  Number((await q<{ s: string }>("select coalesce(sum(importe_ars), 0) s from cc_movimiento where organizacion_id = $1 and tercero_tipo = $2 and tercero_id = $3", [org, t, tid]))[0].s);
const balancea = async (org: string) => {
  const r = await q<{ d: string; h: string; n: string }>(`select coalesce(sum(l.debe), 0) d, coalesce(sum(l.haber), 0) h, count(distinct a.id) n
    from asiento a join asiento_linea l on l.asiento_id = a.id where a.organizacion_id = $1 and a.estado = 'vigente'`, [org]);
  assert.equal(Number(r[0].d).toFixed(2), Number(r[0].h).toFixed(2), "el debe y el haber totales tienen que coincidir");
  const desb = await q("select a.id from asiento a join asiento_linea l on l.asiento_id = a.id where a.organizacion_id = $1 group by a.id having sum(l.debe) <> sum(l.haber)", [org]);
  assert.equal(desb.length, 0, "cada asiento balancea");
  return Number(r[0].n);
};

test("factura de compra: ingresa stock, costo promedio y deuda; la orden de pago la cancela", async () => {
  const e = await escenario();
  const v = await e.producto("A1");
  // Primera compra: 10 a $1.000 neto.
  const f1 = await id("insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha, deposito_id) values ($1, $2, 'A', 1, 101, $3, $4) returning id", [e.org, e.proveedor, hoy, e.deposito]);
  await m.compras.agregarLineaFactura(e.org, f1, { variacionId: v, descripcion: "A1", cantidad: 10, costoUnit: 1000, ivaPct: 21 });
  await m.compras.registrarFactura(e.org, f1, "u1");
  assert.equal(await stockDe(e.org, v), 10);
  assert.equal(await saldoCc(e.org, "proveedor", e.proveedor), 12100);
  // Segunda: 10 a $2.000 → promedio 1.500.
  const f2 = await id("insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha, deposito_id) values ($1, $2, 'A', 1, 102, $3, $4) returning id", [e.org, e.proveedor, hoy, e.deposito]);
  await m.compras.agregarLineaFactura(e.org, f2, { variacionId: v, descripcion: "A1", cantidad: 10, costoUnit: 2000, ivaPct: 21 });
  await m.compras.registrarFactura(e.org, f2, "u1");
  const c = (await q<{ p: string; u: string }>("select costo_promedio_ars p, costo_ultimo_ars u from variacion where id = $1", [v]))[0];
  assert.equal(Number(c.p), 1500);
  assert.equal(Number(c.u), 2000);
  await assert.rejects(m.compras.registrarFactura(e.org, f2, "u1"), /ya estaba registrada/);

  // Orden de pago: 20.000 del banco + 1.000 de retención → paga la primera entera y parte de la segunda.
  await m.tes.emitirRecibo(e.org, { tipo: "pago", terceroId: e.proveedor, fecha: hoy, medios: [{ cuentaId: e.banco, importe: 20000 }],
    retenciones: [{ concepto: "Ret. IIBB", importe: 1000 }], usuarioId: "u1" });
  assert.equal(await saldoCc(e.org, "proveedor", e.proveedor), 36300 - 21000);
  const pend = await q<{ pendiente: string }>("select pendiente from cc_movimiento where organizacion_id = $1 and tipo = 'factura' order by id", [e.org]);
  assert.deepEqual(pend.map((x) => Number(x.pendiente)), [0, 15300]);
  const saldoBanco = (await m.tes.cuentasConSaldo(e.org)).find((x) => x.id === e.banco)!.saldo;
  assert.equal(saldoBanco, -20000);

  const r = await m.cont.contabilizarPendientes(e.org);
  assert.deepEqual(r.errores, []);
  assert.equal(await balancea(e.org), 3);
  // Mercaderías = 30.000; IVA crédito = 6.300; proveedores = 36.300 - 21.000.
  const ss = await m.cont.sumasYSaldos(e.org, hoy, hoy);
  const s = (n: string) => ss.find((x) => x.nombre === n)?.saldo ?? 0;
  assert.equal(s("Mercaderías"), 30000);
  assert.equal(s("IVA crédito fiscal"), 6300);
  assert.equal(s("Proveedores"), -15300);
  assert.equal(s("Retenciones a depositar"), -1000);
  // Contabilizar de nuevo no duplica.
  await m.cont.contabilizarPendientes(e.org);
  assert.equal(await balancea(e.org), 3);
});

test("despacho: prorratea flete, seguro y gastos por FOB; asiento contra importaciones en curso", async () => {
  const e = await escenario();
  const a = await e.producto("D1"), b = await e.producto("D2");
  const d = await id(`insert into despacho_importacion (organizacion_id, numero, fecha, cotizacion, flete_usd, seguro_usd, gastos, impuestos, deposito_id)
    values ($1, '26001IC0400001X', $2, 1000, 100, 0, '[{"concepto":"Derechos","importe_ars":300000}]', '[{"concepto":"IVA","importe_ars":50000},{"concepto":"IVA adicional","importe_ars":20000}]', $3) returning id`,
    [e.org, hoy, e.deposito]);
  await q("insert into despacho_linea (organizacion_id, despacho_id, variacion_id, descripcion, cantidad, fob_unit_usd) values ($1, $2, $3, 'D1', 100, 3), ($1, $2, $4, 'D2', 50, 2)", [e.org, d, a, b]);
  // FOB 300 + 100 = 400 USD; extra = 100.000 + 300.000 = 400.000 → D1 se lleva 75 %.
  const calc = await m.compras.registrarDespacho(e.org, d, "u1");
  assert.equal(calc.lineas[0].costoUnitArs, 6000);   // (300.000 + 300.000) / 100
  assert.equal(calc.lineas[1].costoUnitArs, 4000);   // (100.000 + 100.000) / 50
  assert.equal(await stockDe(e.org, a), 100);
  await m.cont.contabilizarPendientes(e.org);
  assert.equal(await balancea(e.org), 1);
  const ss = await m.cont.sumasYSaldos(e.org, hoy, hoy);
  const s = (n: string) => ss.find((x) => x.nombre === n)?.saldo ?? 0;
  assert.equal(s("Mercaderías"), 800000);
  assert.equal(s("IVA crédito fiscal"), 50000);
  assert.equal(s("Percepciones de IVA"), 20000);
  assert.equal(s("Importaciones en curso"), -870000);
});

test("cobro a cliente en dos cuentas, transferencia, movimiento suelto y conciliación", async () => {
  const e = await escenario();
  await q("insert into cc_movimiento (organizacion_id, tercero_tipo, tercero_id, fecha, tipo, importe, importe_ars, importe_usd, pendiente, descripcion) values ($1, 'cliente', $2, $3, 'saldo_inicial', 30000, 30000, 30, 30000, 'Saldo inicial')",
    [e.org, e.cliente, hoy]);
  const rec = await m.tes.emitirRecibo(e.org, { tipo: "cobro", terceroId: e.cliente, fecha: hoy, medios: [{ cuentaId: e.banco, importe: 20000 }, { cuentaId: e.caja, importe: 10000 }], usuarioId: "u1" });
  assert.equal(rec.numero, 1);
  assert.equal(await saldoCc(e.org, "cliente", e.cliente), 0);
  await m.tes.transferir(e.org, { origenId: e.caja, destinoId: e.banco, fecha: hoy, importe: 5000, usuarioId: "u1" });
  const mov = await m.tes.movimientoManual(e.org, { cuentaId: e.banco, fecha: hoy, importe: -150, concepto: "Comisión", cuentaContableId: null, usuarioId: "u1" });
  const saldos = await m.tes.cuentasConSaldo(e.org);
  assert.equal(saldos.find((x) => x.id === e.banco)!.saldo, 24850);
  assert.equal(saldos.find((x) => x.id === e.caja)!.saldo, 55000);

  const csv = `Fecha;Concepto;Importe\n${hoy.split("-").reverse().join("/")};Transferencia recibida;20.000,00\n${hoy.split("-").reverse().join("/")};Comision mantenimiento;-150,00\n${hoy.split("-").reverse().join("/")};Impuesto ley 25413;-120,00\n`;
  assert.deepEqual(await m.tes.importarExtracto(e.org, e.banco, csv), { leidas: 3, nuevas: 3 });
  assert.deepEqual(await m.tes.importarExtracto(e.org, e.banco, csv), { leidas: 3, nuevas: 0 });
  assert.equal(await m.tes.conciliarAutomatico(e.org, e.banco), 2);
  const pendiente = (await m.tes.extracto(e.org, e.banco, true))[0];
  assert.equal(pendiente.importe, -120);
  await m.tes.crearDesdeExtracto(e.org, pendiente.id, null, "u1");
  assert.equal((await m.tes.extracto(e.org, e.banco, true)).length, 0);
  await assert.rejects(m.tes.borrarMovimiento(e.org, mov), /conciliado/);

  await m.cont.contabilizarPendientes(e.org);
  assert.equal(await balancea(e.org), 4); // recibo, transferencia, 2 movimientos
  // Anular el recibo devuelve la deuda y anula su asiento.
  await assert.rejects(m.tes.anularRecibo(e.org, rec.id), /conciliados/);
  const ext = (await m.tes.extracto(e.org, e.banco, false)).find((x) => x.importe === 20000)!;
  await m.tes.desconciliar(e.org, ext.id);
  await m.tes.anularRecibo(e.org, rec.id);
  assert.equal(await saldoCc(e.org, "cliente", e.cliente), 30000);
  assert.equal(await balancea(e.org), 3);
});

test("asiento manual: tiene que balancear", async () => {
  const e = await escenario();
  await m.cont.asegurarPlan(e.org);
  const ctas = await m.cont.cuentasImputables(e.org);
  const caja = ctas.find((x) => x.nombre === "Caja")!.id, capital = ctas.find((x) => x.nombre === "Capital")!.id;
  await assert.rejects(m.cont.asientoManual(e.org, { fecha: hoy, concepto: "Apertura", usuarioId: "u1", lineas: [{ cuentaId: caja, debe: 100 }, { cuentaId: capital, haber: 90 }] }), /no balancea/);
  await m.cont.asientoManual(e.org, { fecha: hoy, concepto: "Apertura", usuarioId: "u1", apertura: true, lineas: [{ cuentaId: caja, debe: 100 }, { cuentaId: capital, haber: 100 }] });
  const res = await m.cont.estadoDeResultados(e.org, hoy, hoy);
  assert.equal(res.resultado, 0);
  assert.equal(await balancea(e.org), 1);
});

test("leerImporte: formatos de extracto", () => {
  assert.equal(m.tes.leerImporte("1.234,56"), 1234.56);
  assert.equal(m.tes.leerImporte("-1,234.56"), -1234.56);
  assert.equal(m.tes.leerImporte("$ 20.000"), 20000);
  assert.equal(m.tes.leerImporte("(150,00)"), -150);
  assert.equal(m.tes.leerImporte("12.5"), 12.5);
});
