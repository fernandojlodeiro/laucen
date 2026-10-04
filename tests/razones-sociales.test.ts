// Tests de varias razones sociales (CUIT) en una misma organización: el stock
// y los terceros se comparten; lo fiscal y lo contable se separa. Mismas
// reglas que tests/administracion.test.ts: cada test arma su organización y no borra nada.

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
  facturar: typeof import("@/lib/arca/facturar");
  compras: typeof import("@/lib/administracion/compras");
  cc: typeof import("@/lib/administracion/cc");
  tes: typeof import("@/lib/administracion/tesoreria");
  cont: typeof import("@/lib/administracion/contabilidad");
  iva: typeof import("@/lib/administracion/libro-iva-base");
  rs: typeof import("@/lib/razon-social");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    facturar: await import("@/lib/arca/facturar"),
    compras: await import("@/lib/administracion/compras"),
    cc: await import("@/lib/administracion/cc"),
    tes: await import("@/lib/administracion/tesoreria"),
    cont: await import("@/lib/administracion/contabilidad"),
    iva: await import("@/lib/administracion/libro-iva-base"),
    rs: await import("@/lib/razon-social"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);
const hoy = new Date().toISOString().slice(0, 10);

/** Una organización con dos razones sociales (la primera, principal), un depósito, un proveedor, un cliente y una cuenta de fondos de cada una. */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date - 1, 1000, 'test')", [org]);
  const a = await id("insert into emisor (organizacion_id, nombre, cuit, razon_social, punto_venta) values ($1, 'Uno', '30500010912', 'Uno SA', 1) returning id", [org]);
  const b = await id("insert into emisor (organizacion_id, nombre, cuit, razon_social, punto_venta) values ($1, 'Dos', '30711111118', 'Dos SRL', 1) returning id", [org]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const proveedor = await id("insert into proveedor (organizacion_id, nombre) values ($1, 'Proveedor SA') returning id", [org]);
  const cliente = await id("insert into cliente (organizacion_id, nombre, cuenta_corriente) values ($1, 'Cliente SRL', true) returning id", [org]);
  const bancoA = await id("insert into cuenta_fondos (organizacion_id, nombre, tipo, emisor_id) values ($1, 'Banco Uno', 'banco', $2) returning id", [org, a]);
  const bancoB = await id("insert into cuenta_fondos (organizacion_id, nombre, tipo, emisor_id) values ($1, 'Banco Dos', 'banco', $2) returning id", [org, b]);
  const p = await id("insert into producto (organizacion_id, sku_base, titulo, tipo) values ($1, 'RS1', 'Producto RS1', 'simple') returning id", [org]);
  const variacion = await id("select id from variacion where producto_id = $1 and es_default", [p]);
  return { org, a, b, deposito, proveedor, cliente, bancoA, bancoB, variacion };
}

const stockDe = async (org: string, v: number) => Number((await q<{ n: string }>("select coalesce(sum(cantidad), 0) n from stock where organizacion_id = $1 and variacion_id = $2", [org, v]))[0].n);

test("la primera razón social nace principal; el resto no; una fila sin razón social toma la principal", async () => {
  const e = await escenario();
  const filas = await q<{ id: string; es_principal: boolean }>("select id, es_principal from emisor where organizacion_id = $1 order by id", [e.org]);
  assert.deepEqual(filas.map((f) => f.es_principal), [true, false]);
  assert.equal((await m.facturar.emisorDe(e.org))?.id, e.a);
  assert.equal((await m.facturar.emisorDe(e.org, e.b))?.id, e.b);
  // Una factura de compra que nace sin razón social es de la principal.
  const f = await id("insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha) values ($1, $2, 'A', 1, 1, $3) returning id", [e.org, e.proveedor, hoy]);
  assert.equal(Number((await q<{ e: string }>("select emisor_id e from factura_compra where id = $1", [f]))[0].e), e.a);
  // Y no se puede tener dos principales.
  await assert.rejects(q("update emisor set es_principal = true where id = $1", [e.b]));
});

test("con qué razón social se factura un canal: la de su cuenta de ML o, si no tiene, la principal", async () => {
  const e = await escenario();
  const ml = await id("insert into canal (organizacion_id, nombre, tipo, emisor_id) values ($1, 'ML dos', 'mercadolibre', $2) returning id", [e.org, e.b]);
  const web = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Web', 'web_minorista') returning id", [e.org]);
  assert.equal((await m.facturar.emisorDeCanal(e.org, ml))?.id, e.b);
  assert.equal((await m.facturar.emisorDeCanal(e.org, web))?.id, e.a);
  assert.equal((await m.facturar.emisorDeCanal(e.org, null))?.id, e.a);
  const p = await id("insert into pedido (organizacion_id, canal_id, estado) values ($1, $2, 'pagado') returning id", [e.org, ml]);
  const sql = m.facturar.sqlEmisorDePedido("p");
  assert.equal(Number((await q<{ e: string }>(`select ${sql} e from pedido p where p.id = $1`, [p]))[0].e), e.b);
});

test("la numeración de comprobantes es de cada razón social: el mismo punto de venta y número no choca entre las dos", async () => {
  const e = await escenario();
  const cbte = (emisor: number, numero: number) => q(`insert into comprobante (organizacion_id, emisor_id, ambiente, tipo_cbte, punto_venta, numero, doc_tipo, doc_nro, importe_total, importe_neto, estado)
    values ($1, $2, 'produccion', 6, 1, $3, 99, '0', 100, 100, 'autorizado')`, [e.org, emisor, numero]);
  await cbte(e.a, 1);
  await cbte(e.b, 1);
  await assert.rejects(cbte(e.a, 1));
});

test("las credenciales y los tickets de ARCA son de cada razón social", async () => {
  const e = await escenario();
  await q("insert into arca_credencial (organizacion_id, emisor_id, ambiente, clave_privada, csr) values ($1, $2, 'produccion', 'k', 'c'), ($1, $3, 'produccion', 'k2', 'c2')", [e.org, e.a, e.b]);
  const { estadoCredencial } = await import("@/lib/arca/credenciales");
  assert.equal((await estadoCredencial(e.a, "produccion"))?.csr, "c");
  assert.equal((await estadoCredencial(e.b, "produccion"))?.csr, "c2");
  const conPadron = await m.facturar.emisorConPadron(e.org);
  assert.equal(conPadron, null); // ninguna tiene certificado todavía
  await q("update arca_credencial set certificado = 'x' where emisor_id = $1", [e.b]);
  await q("update emisor set ambiente = 'produccion' where id = $1", [e.b]);
  assert.equal((await m.facturar.emisorConPadron(e.org))?.id, e.b);
});

test("factura de compra a nombre de la segunda: el stock entra al general y la cuenta corriente es de esa razón social", async () => {
  const e = await escenario();
  const f1 = await id("insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha, deposito_id, emisor_id) values ($1, $2, 'A', 1, 101, $3, $4, $5) returning id", [e.org, e.proveedor, hoy, e.deposito, e.a]);
  const f2 = await id("insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha, deposito_id, emisor_id) values ($1, $2, 'A', 1, 102, $3, $4, $5) returning id", [e.org, e.proveedor, hoy, e.deposito, e.b]);
  await m.compras.agregarLineaFactura(e.org, f1, { variacionId: e.variacion, descripcion: "RS1", cantidad: 10, costoUnit: 1000, ivaPct: 21 });
  await m.compras.agregarLineaFactura(e.org, f2, { variacionId: e.variacion, descripcion: "RS1", cantidad: 5, costoUnit: 1000, ivaPct: 21 });
  await m.compras.registrarFactura(e.org, f1, "u1");
  await m.compras.registrarFactura(e.org, f2, "u1");
  // El stock es uno solo.
  assert.equal(await stockDe(e.org, e.variacion), 15);
  // Cada razón social tiene su deuda con el proveedor.
  const saldo = async (rs: number) => Number((await q<{ s: string }>("select coalesce(sum(importe_ars), 0) s from cc_movimiento where organizacion_id = $1 and tercero_tipo = 'proveedor' and emisor_id = $2", [e.org, rs]))[0].s);
  assert.equal(await saldo(e.a), 12100);
  assert.equal(await saldo(e.b), 6050);
  const saldos = await m.cc.saldos(e.org, "proveedor", e.b);
  assert.equal(saldos[0].saldo, 6050);
  assert.equal((await m.cc.saldos(e.org, "proveedor"))[0].saldo, 18150);
});

test("recibos y órdenes de pago: de la razón social de las cuentas; un pago de una no cancela la deuda con la otra", async () => {
  const e = await escenario();
  const compra = async (rs: number, numero: number) => {
    const f = await id("insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha, emisor_id) values ($1, $2, 'A', 1, $3, $4, $5) returning id", [e.org, e.proveedor, numero, hoy, rs]);
    await m.compras.agregarLineaFactura(e.org, f, { descripcion: "Servicio", cantidad: 1, costoUnit: 10000, ivaPct: 21 });
    await m.compras.registrarFactura(e.org, f, "u1");
  };
  await compra(e.a, 1);
  await compra(e.b, 2);
  // Un recibo con medios de dos razones sociales no se puede.
  await assert.rejects(m.tes.emitirRecibo(e.org, { tipo: "pago", terceroId: e.proveedor, fecha: hoy, usuarioId: "u1",
    medios: [{ cuentaId: e.bancoA, importe: 100 }, { cuentaId: e.bancoB, importe: 100 }] }), /razones sociales distintas/);
  // Una orden de pago por la cuenta de la segunda sólo cancela la deuda de la segunda.
  await m.tes.emitirRecibo(e.org, { tipo: "pago", terceroId: e.proveedor, fecha: hoy, usuarioId: "u1", medios: [{ cuentaId: e.bancoB, importe: 12100 }] });
  const pend = await q<{ emisor_id: string; pendiente: string }>("select emisor_id, pendiente from cc_movimiento where organizacion_id = $1 and tipo = 'factura' order by id", [e.org]);
  assert.deepEqual(pend.map((x) => [Number(x.emisor_id), Number(x.pendiente)]), [[e.a, 12100], [e.b, 0]]);
  const rec = (await q<{ emisor_id: string }>("select emisor_id from recibo where organizacion_id = $1", [e.org]))[0];
  assert.equal(Number(rec.emisor_id), e.b);
  // Imputar a mano entre razones sociales distintas tampoco.
  await m.tes.emitirRecibo(e.org, { tipo: "pago", terceroId: e.proveedor, fecha: hoy, usuarioId: "u1", medios: [{ cuentaId: e.bancoB, importe: 5000 }] });
  const mov = await q<{ id: string; tipo: string; emisor_id: string }>("select id, tipo, emisor_id from cc_movimiento where organizacion_id = $1 order by id", [e.org]);
  const debitoA = mov.find((x) => x.tipo === "factura" && Number(x.emisor_id) === e.a)!;
  const creditoB = mov.filter((x) => x.tipo === "pago" && Number(x.emisor_id) === e.b).at(-1)!;
  await assert.rejects(m.cc.imputar(e.org, Number(debitoA.id), Number(creditoB.id), null), /razones sociales distintas/);
});

test("no se transfiere entre cuentas de razones sociales distintas", async () => {
  const e = await escenario();
  const bancoA2 = await id("insert into cuenta_fondos (organizacion_id, nombre, tipo, emisor_id) values ($1, 'Caja Uno', 'caja', $2) returning id", [e.org, e.a]);
  await m.tes.transferir(e.org, { origenId: e.bancoA, destinoId: bancoA2, fecha: hoy, importe: 100, usuarioId: "u1" });
  await assert.rejects(m.tes.transferir(e.org, { origenId: e.bancoA, destinoId: e.bancoB, fecha: hoy, importe: 100, usuarioId: "u1" }), /razones sociales distintas/);
  assert.equal((await m.tes.cuentasConSaldo(e.org, e.b)).length, 1);
  assert.equal((await m.tes.cuentasConSaldo(e.org)).length, 3);
});

test("los asientos son de la razón social del documento y los libros se filtran por ella; el libro de IVA es de una sola", async () => {
  const e = await escenario();
  const compra = async (rs: number, numero: number, neto: number) => {
    const f = await id("insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha, emisor_id) values ($1, $2, 'A', 1, $3, $4, $5) returning id", [e.org, e.proveedor, numero, hoy, rs]);
    await m.compras.agregarLineaFactura(e.org, f, { descripcion: "Servicio", cantidad: 1, costoUnit: neto, ivaPct: 21 });
    await m.compras.registrarFactura(e.org, f, "u1");
  };
  await compra(e.a, 1, 1000);
  await compra(e.b, 2, 2000);
  const r = await m.cont.contabilizarPendientes(e.org);
  assert.deepEqual(r.errores, []);
  // Cada asiento quedó con la razón social de su factura.
  const asientos = await q<{ emisor_id: string; numero: string }>("select emisor_id, numero from asiento where organizacion_id = $1 and origen = 'compra' order by numero", [e.org]);
  assert.deepEqual(asientos.map((x) => Number(x.emisor_id)), [e.a, e.b]);
  // La numeración es una sola para la organización.
  assert.deepEqual(asientos.map((x) => Number(x.numero)), [1, 2]);
  // Libro diario: de todas y de una.
  assert.equal((await m.cont.libroDiario(e.org, hoy, hoy)).length, 2);
  assert.equal((await m.cont.libroDiario(e.org, hoy, hoy, e.b)).length, 1);
  // Sumas y saldos: el IVA crédito de cada una.
  const iva = async (rs: number | null) => (await m.cont.sumasYSaldos(e.org, hoy, hoy, rs)).find((x) => x.nombre === "IVA crédito fiscal")?.saldo ?? 0;
  assert.equal(await iva(null), 630);
  assert.equal(await iva(e.a), 210);
  assert.equal(await iva(e.b), 420);
  // Libro de IVA compras: cada razón social el suyo.
  const desde = `${hoy.slice(0, 8)}01`, hasta = `${hoy.slice(0, 8)}31`;
  assert.equal((await m.iva.comprasDelPeriodo(e.org, desde, hasta, e.a)).compras.length, 1);
  assert.equal((await m.iva.comprasDelPeriodo(e.org, desde, hasta, e.b)).compras.length, 1);
  assert.equal((await m.iva.comprasDelPeriodo(e.org, desde, hasta)).compras.length, 2);
});

test("elegir la razón social de una pantalla: todas o una; el libro de IVA, la principal sin elegir; con una sola no hay selector", async () => {
  const e = await escenario();
  const todas = await m.rs.elegirRazonSocial(e.org, undefined);
  assert.equal(todas.multi, true);
  assert.equal(todas.id, null);
  assert.equal((await m.rs.elegirRazonSocial(e.org, String(e.b))).id, e.b);
  assert.equal((await m.rs.elegirRazonSocial(e.org, "todas")).id, null);
  assert.equal((await m.rs.elegirRazonSocial(e.org, undefined, { todas: false })).id, e.a);
  assert.equal((await m.rs.elegirRazonSocial(e.org, "99999999", { todas: false })).id, e.a);
  const sola = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, 'Sola')", [sola]);
  const unica = await id("insert into emisor (organizacion_id, cuit, razon_social) values ($1, '30500010912', 'Sola SA') returning id", [sola]);
  const r = await m.rs.elegirRazonSocial(sola, undefined);
  assert.equal(r.multi, false);
  assert.equal((await m.rs.elegirRazonSocial(sola, undefined, { todas: false })).id, unica);
});

test("preparar la factura de un pedido: sale con la razón social de su canal (o la principal) y su punto de venta", async () => {
  const e = await escenario();
  await q("update emisor set punto_venta = 7 where id = $1", [e.b]);
  const ml = await id("insert into canal (organizacion_id, nombre, tipo, emisor_id) values ($1, 'ML dos', 'mercadolibre', $2) returning id", [e.org, e.b]);
  const web = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Web', 'web_minorista') returning id", [e.org]);
  const pedido = async (canal: number) => {
    const p = await id("insert into pedido (organizacion_id, canal_id, estado, estado_pago, total_ars, cliente_id) values ($1, $2, 'pagado', 'pagado', 1210, $3) returning id", [e.org, canal, e.cliente]);
    await q("insert into pedido_linea (organizacion_id, pedido_id, variacion_id, cantidad, precio_unit_ars, precio_unit_usd, titulo) values ($1, $2, $3, 1, 1210, 1.21, 'Producto RS1')", [e.org, p, e.variacion]);
    return p;
  };
  const cMl = await m.facturar.prepararFactura(e.org, await pedido(ml), "u1");
  const cWeb = await m.facturar.prepararFactura(e.org, await pedido(web), "u1");
  const fila = async (c: number) => (await q<{ emisor_id: string; punto_venta: number }>("select emisor_id, punto_venta from comprobante where id = $1", [c]))[0];
  assert.deepEqual([Number((await fila(cMl)).emisor_id), (await fila(cMl)).punto_venta], [e.b, 7]);
  assert.deepEqual([Number((await fila(cWeb)).emisor_id), (await fila(cWeb)).punto_venta], [e.a, 1]);
  // La nota de crédito sale con la razón social de la factura (aunque la principal cambie después).
  await q("update comprobante set estado = 'autorizado', numero = 1 where id = $1", [cMl]);
  await q("update emisor set es_principal = false where id = $1", [e.a]);
  await q("update emisor set es_principal = true where id = $1", [e.b]);
  const nc = await m.facturar.prepararNotaCredito(e.org, cMl, "u1");
  assert.equal(Number((await fila(nc)).emisor_id), e.b);
});
