// Órdenes de compra al exterior y preventa (lib/compras/ordenes.ts, lib/preventa): de punta a punta contra una base de
// verdad (TEST_DATABASE_URL). Cada test arma su propia organización; nada se borra al terminar.
//
//   TEST_DATABASE_URL=postgresql://… npm test

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
  ordenes: typeof import("@/lib/compras/ordenes");
  preventa: typeof import("@/lib/preventa");
  pedidos: typeof import("@/lib/pedidos");
  recepcion: typeof import("@/lib/deposito/recepcion");
  stock: typeof import("@/lib/stock");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    ordenes: await import("@/lib/compras/ordenes"),
    preventa: await import("@/lib/preventa"),
    pedidos: await import("@/lib/pedidos"),
    recepcion: await import("@/lib/deposito/recepcion"),
    stock: await import("@/lib/stock"),
  };
  await (await import("@/lib/erp/esquema")).asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date - 1, 1000, 'test')", [org]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Córdoba') returning id", [org]);
  const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [deposito]);
  const lista = await id("insert into lista_precios (organizacion_id, nombre) values ($1, 'Web') returning id", [org]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo, lista_precios_id) values ($1, 'Web', 'web_minorista', $2) returning id", [org, lista]);
  await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, canal, deposito]);
  const proveedor = await id("insert into proveedor (organizacion_id, nombre) values ($1, 'Open Smart') returning id", [org]);
  const producto = async (sku: string, precio = 10000) => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo, tipo, preventa_web) values ($1, $2, $3, 'simple', true) returning id", [org, sku, `Producto ${sku}`]);
    const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
    await q("insert into precio (organizacion_id, lista_precios_id, variacion_id, importe, moneda) values ($1, $2, $3, $4, 'ARS')", [org, lista, v, precio]).catch(async () => {
      const { guardarPrecio } = await import("@/lib/precios");
      await guardarPrecio(org, { listaId: lista, variacionId: v, importe: precio, moneda: "ARS" });
    });
    return v;
  };
  return { org, deposito, general, lista, canal, proveedor, producto };
}

/** Un Excel de invoice como los de los proveedores: arriba la fecha y el número, abajo SKU, cantidad y precio. */
async function excelInvoice(filas: [string, number, number][], numero = `INV${Math.floor(Math.random() * 1e9)}`): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet("PI");
  h.addRow(["Invoice No.", numero]);
  h.addRow(["Date", "2026-11-01"]);
  h.addRow([]);
  h.addRow(["SKU", "Description", "QTY", "Unit Price", "Amount"]);
  for (const [sku, qty, precio] of filas) h.addRow([sku, `Producto ${sku}`, qty, precio, qty * precio]);
  const b = new Uint8Array(await libro.xlsx.writeBuffer() as unknown as ArrayBuffer);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function ordenConfirmada(e: Awaited<ReturnType<typeof escenario>>, filas: [string, number, number][], via: "aereo" | "maritimo" = "maritimo") {
  const o = await m.ordenes.crearOrdenDesdeExcel(e.org, { contenido: await excelInvoice(filas), archivo: "pi.xlsx", ruta: `${e.org}/x.xlsx`, proveedorId: e.proveedor, via, usuarioId: "test" });
  await m.ordenes.confirmarOrden(e.org, o.id);
  return o;
}

test("orden desde el Excel: código M + correlativo + año, FOB al confirmar, entrante con sus tres datos", async () => {
  const e = await escenario();
  const v = await e.producto("SKU00001");
  const o1 = await m.ordenes.crearOrdenDesdeExcel(e.org, { contenido: await excelInvoice([["SKU00001", 100, 1.25]]), archivo: "pi.xlsx", ruta: `${e.org}/a.xlsx`, proveedorId: e.proveedor, via: "maritimo", usuarioId: "test" });
  assert.equal(o1.codigo, "M0126");
  const o2 = await m.ordenes.crearOrdenDesdeExcel(e.org, { contenido: await excelInvoice([["SKU00001", 50, 1.3]]), archivo: "pi2.xlsx", ruta: `${e.org}/b.xlsx`, proveedorId: e.proveedor, via: "maritimo", usuarioId: "test" });
  assert.equal(o2.codigo, "M0226");
  const o3 = await m.ordenes.crearOrdenDesdeExcel(e.org, { contenido: await excelInvoice([["SKU00001", 10, 1.3]]), archivo: "pi3.xlsx", ruta: `${e.org}/c.xlsx`, proveedorId: e.proveedor, via: "aereo", usuarioId: "test" });
  assert.equal(o3.codigo, "A0126");
  // A revisar no cuenta como entrante.
  assert.equal((await m.ordenes.entrantePorVariacion(e.org, [v])).size, 0);
  await m.ordenes.confirmarOrden(e.org, o1.id);
  const fob = await q<{ costo_fob: string; costo_ultimo_usd: string | null }>("select costo_fob, costo_ultimo_usd from variacion where id = $1", [v]);
  assert.equal(Number(fob[0].costo_fob), 1.25);
  assert.equal(fob[0].costo_ultimo_usd, null, "no toca el costo último");
  const ent = (await m.ordenes.entrantePorVariacion(e.org, [v])).get(v)!;
  assert.deepEqual([ent.llegando, ent.prevendido, ent.saldo, ent.proxima_orden], [100, 0, 100, "M0126"]);
  const inv = await q<{ estado: string }>("select i.estado from compra_invoice i join orden_compra o on o.invoice_id = i.id where o.id = $1", [o1.id]);
  assert.equal(inv[0].estado, "confirmado");
  // El mismo Excel otra vez no crea otra orden con el mismo invoice.
  await assert.rejects(m.ordenes.borrarOrden(e.org, o1.id), /a revisar/);
  await m.ordenes.borrarOrden(e.org, o3.id);
  assert.equal((await q("select 1 from orden_compra where id = $1", [o3.id])).length, 0);
});

test("preventa: sólo con físico 0, una orden por vez (la primera publicada), margen de seguridad, sin mezclar", async () => {
  const e = await escenario();
  const v = await e.producto("SKU00010");
  const w = await e.producto("SKU00011");
  const o1 = await ordenConfirmada(e, [["SKU00010", 100, 1], ["SKU00011", 10, 1]]);
  const o2 = await ordenConfirmada(e, [["SKU00010", 100, 1]]);
  const canal = { id: e.canal, tipo: "web" as const };
  // Sin publicar en la web no hay preventa.
  assert.equal((await m.preventa.ofertasPreventa(e.org, [v], canal)).size, 0);
  await m.ordenes.publicarOrden(e.org, o2.id, "web", true); // la segunda se publica primero: es la que se ofrece
  await m.ordenes.publicarOrden(e.org, o1.id, "web", true);
  let of = (await m.preventa.ofertasPreventa(e.org, [v, w], canal));
  // Margen: el menor entre 5 u. y el 10 % (100 → 5; 10 → 1).
  assert.equal(of.get(v)!.ordenId, o2.id);
  assert.equal(of.get(v)!.cupo, 95);
  assert.equal(of.get(w)!.cupo, 9);
  // Con stock físico, no hay preventa.
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "ingreso", cantidad: 3, destinoId: e.general });
  assert.equal((await m.preventa.ofertasPreventa(e.org, [v], canal)).has(v), false);
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "egreso", cantidad: 3, origenId: e.general });
  // No se mezcla: v viene en o2, w sólo en o1.
  await assert.rejects(m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 1 }, { variacion_id: w, cantidad: 1 }], preventa: {} }, "test"), /órdenes de compra distintas/);
  // Más que el cupo, no.
  await assert.rejects(m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 96 }], preventa: {} }, "test"), /quedan 95/);
  // Se vende todo el cupo de la segunda: pasa a ofrecerse la primera.
  const p = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 95 }], preventa: {} }, "test");
  const ped = (await q<{ preventa_orden_id: string; total_ars: string }>("select preventa_orden_id, total_ars from pedido where id = $1", [p.pedidoId]))[0];
  assert.equal(Number(ped.preventa_orden_id), o2.id);
  assert.equal(Number(ped.total_ars), 95 * 10000, "sin descuento de preventa cargado, precio normal");
  // No reservó físico: reservó entrante.
  const st = await q<{ reservado: number }>("select coalesce(sum(reservado), 0)::int reservado from stock where variacion_id = $1", [v]);
  assert.equal(st[0].reservado, 0);
  const ent = (await m.ordenes.entrantePorVariacion(e.org, [v])).get(v)!;
  assert.equal(ent.prevendido, 95);
  of = await m.preventa.ofertasPreventa(e.org, [v], canal);
  assert.equal(of.get(v)!.ordenId, o1.id);
  // Un pedido de preventa no se prepara.
  await m.pedidos.cambiarEstado(e.org, p.pedidoId, "pagado", "test");
  await assert.rejects(m.pedidos.cambiarEstado(e.org, p.pedidoId, "en_preparacion", "test"), /preventa/);
  // La orden no se achica por debajo de lo vendido.
  const linea = (await q<{ id: number }>("select l.id::int from compra_invoice_linea l join orden_compra o on o.invoice_id = l.invoice_id where o.id = $1", [o2.id]))[0].id;
  await assert.rejects(m.ordenes.guardarLinea(e.org, linea, { sku: "SKU00010", cantidad: 90, precio: 1 }), /95 vendidas/);
  // Cancelar libera la reserva de entrante.
  await m.pedidos.cambiarEstado(e.org, p.pedidoId, "cancelado", "test");
  assert.equal((await m.ordenes.entrantePorVariacion(e.org, [v])).get(v)!.prevendido, 0);
});

test("descuento de preventa: el del producto gana al de la orden y al general; se aplica sobre el precio de lista", async () => {
  const e = await escenario();
  const v = await e.producto("SKU00020", 20000);
  const o = await ordenConfirmada(e, [["SKU00020", 50, 2]]);
  await q("update orden_compra set descuento_pct = 10 where id = $1", [o.id]);
  await m.ordenes.publicarOrden(e.org, o.id, "web", true);
  let p = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 1 }], preventa: { ordenId: o.id } }, "test");
  assert.equal(Number((await q<{ t: string }>("select total_ars t from pedido where id = $1", [p.pedidoId]))[0].t), 18000);
  await q("update producto set preventa_descuento_pct = 25 where id = (select producto_id from variacion where id = $1)", [v]);
  p = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 2 }], preventa: { ordenId: o.id } }, "test");
  assert.equal(Number((await q<{ t: string }>("select total_ars t from pedido where id = $1", [p.pedidoId]))[0].t), 30000);
  // La orden que vio el cliente ya no es la que se ofrece: falla con el motivo.
  await assert.rejects(m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 1 }], preventa: { ordenId: o.id + 999 } }, "test"), /Cambió la fecha/);
});

test("kit: entra en preventa si todos sus componentes vienen en la misma orden; el cupo lo marca el más escaso", async () => {
  const e = await escenario();
  const a = await e.producto("SKU00030");
  const b = await e.producto("SKU00031");
  const kit = await e.producto("SKU00032", 50000);
  await q("insert into kit_componente (organizacion_id, variacion_kit_id, variacion_componente_id, cantidad) values ($1, $2, $3, 2), ($1, $2, $4, 1)", [e.org, kit, a, b]);
  const o = await ordenConfirmada(e, [["SKU00030", 100, 1], ["SKU00031", 20, 1]]);
  await m.ordenes.publicarOrden(e.org, o.id, "web", true);
  const of = await m.preventa.ofertasPreventa(e.org, [kit], { id: e.canal, tipo: "web" });
  // a: 100 − 5 = 95 → 47 kits; b: 20 − 2 = 18 → 18 kits.
  assert.equal(of.get(kit)!.cupo, 18);
  const p = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: kit, cantidad: 3 }], preventa: {} }, "test");
  const r = await q<{ variacion_id: number; cantidad: number }>("select variacion_id::int, cantidad from preventa_reserva where pedido_id = $1 order by variacion_id", [p.pedidoId]);
  assert.deepEqual(r.map((x) => [x.variacion_id, x.cantidad]).sort((x, y) => x[0] - y[0]), [[a, 6], [b, 3]].sort((x, y) => x[0] - y[0]));
});

test("llegada: recepción por caja (la caja es la ubicación), lo vendido se reserva primero, sacar de la caja, orden recibida", async () => {
  const e = await escenario();
  const v = await e.producto("SKU00040");
  const w = await e.producto("SKU00041");
  const o = await ordenConfirmada(e, [["SKU00040", 10, 1], ["SKU00041", 4, 1]]);
  await m.ordenes.publicarOrden(e.org, o.id, "web", true);
  const p1 = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 4 }], preventa: {} }, "test");
  const p2 = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 5 }], preventa: {} }, "test");
  await m.ordenes.guardarPacking(e.org, o.id, "pl.xlsx", {
    cajas: [
      { numero: 1, peso_kg: 10, cbm: 0.05, largo_cm: 45, ancho_cm: 35, alto_cm: 30, items: [{ fila: 2, sku: "SKU00040", descripcion: null, cantidad: 6 }] },
      { numero: 2, peso_kg: 8, cbm: 0.04, largo_cm: 40, ancho_cm: 30, alto_cm: 30, items: [{ fila: 3, sku: "SKU00040", descripcion: null, cantidad: 4 }, { fila: 4, sku: "SKU00041", descripcion: null, cantidad: 4 }] },
    ], avisos: [], total: { unidades: 14, peso_kg: 18, cbm: 0.09 },
  });
  const cajas = await m.ordenes.cajasOrden(e.org, o.id);
  assert.deepEqual(cajas.map((k) => k.codigo), [`${o.codigo}-01`, `${o.codigo}-02`]);
  const rec = await m.recepcion.crearRecepcion(e.org, { tipo: "compra", depositoId: e.deposito, ordenCompraId: o.id }, "test");
  // Llega la caja 1 (6 de v): alcanza para el primero (4), no para el segundo (5).
  await m.recepcion.recibirCaja(e.org, rec, cajas[0].id, {}, "test");
  let est = await q<{ id: number; cubierto: boolean }>("select id::int, preventa_cubierto_ts is not null cubierto from pedido where id = any($1::bigint[]) order by id", [[p1.pedidoId, p2.pedidoId]]);
  assert.deepEqual(est.map((x) => x.cubierto), [true, false]);
  const enCaja = await q<{ cantidad: number; reservado: number; codigo: string }>(`select s.cantidad, s.reservado, u.codigo from stock s join ubicacion u on u.id = s.ubicacion_id where s.variacion_id = $1`, [v]);
  assert.deepEqual(enCaja.map((x) => [x.codigo, x.cantidad, x.reservado]), [[`${o.codigo}-01`, 6, 4]]);
  // Llega la caja 2: se cubre el segundo.
  await m.recepcion.recibirCaja(e.org, rec, cajas[1].id, {}, "test");
  est = await q("select id::int, preventa_cubierto_ts is not null cubierto from pedido where id = any($1::bigint[]) order by id", [[p1.pedidoId, p2.pedidoId]]);
  assert.deepEqual(est.map((x) => x.cubierto), [true, true]);
  // Un pedido cubierto ya se prepara.
  await m.pedidos.cambiarEstado(e.org, p1.pedidoId, "pagado", "test");
  await m.pedidos.cambiarEstado(e.org, p1.pedidoId, "en_preparacion", "test");
  // Sacar de la caja 2 las 4 de w a un estante; la caja 2 todavía tiene v reservado: no se archiva.
  await q("insert into ubicacion (organizacion_id, deposito_id, codigo) values ($1, $2, 'A1-01')", [e.org, e.deposito]);
  await assert.rejects(m.recepcion.sacarDeCaja(e.org, cajas[1].id, { variacionId: w, cantidad: 5, destino: "A1-01" }, "test"), /quedan 4/);
  await m.recepcion.sacarDeCaja(e.org, cajas[1].id, { variacionId: w, cantidad: 4, destino: "A1-01" }, "test");
  const est2 = await q<{ estado: string }>("select estado from ubicacion where codigo = $1 and deposito_id = $2", [`${o.codigo}-02`, e.deposito]);
  assert.equal(est2[0].estado, "activa");
  await m.recepcion.cerrarRecepcion(e.org, rec, "test");
  const oc = await q<{ estado: string }>("select estado from orden_compra where id = $1", [o.id]);
  assert.equal(oc[0].estado, "recibida");
  assert.equal((await m.ordenes.entrantePorVariacion(e.org, [v])).size, 0, "recibida ya no es entrante");
});

test("llega menos de lo vendido: el último en comprar queda sin cubrir; en espera, la próxima orden lo cubre primero", async () => {
  const e = await escenario();
  const v = await e.producto("SKU00050");
  const o = await ordenConfirmada(e, [["SKU00050", 20, 1]]);
  await m.ordenes.publicarOrden(e.org, o.id, "web", true);
  const p1 = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 10 }], preventa: {} }, "test");
  const p2 = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 8 }], preventa: {} }, "test");
  const rec = await m.recepcion.crearRecepcion(e.org, { tipo: "compra", depositoId: e.deposito, ordenCompraId: o.id }, "test");
  // Llegan 12 sueltas (sin packing list): entra el primero, el segundo no.
  await m.recepcion.recibir(e.org, rec, { codigo: "SKU00050", cantidad: 12 }, "test");
  await m.recepcion.cerrarRecepcion(e.org, rec, "test");
  const sc = await m.preventa.sinCubrir(e.org);
  assert.deepEqual(sc.map((x) => x.pedido_id), [p2.pedidoId]);
  assert.ok((await q("select 1 from pedido where id = $1 and preventa_cubierto_ts is not null", [p1.pedidoId])).length);
  // El segundo queda en espera; la próxima orden lo toma primero.
  await m.preventa.dejarEnEspera(e.org, p2.pedidoId, "test");
  const o2 = await ordenConfirmada(e, [["SKU00050", 30, 1]]);
  const ped = await q<{ preventa_orden_id: string }>("select preventa_orden_id from pedido where id = $1", [p2.pedidoId]);
  assert.equal(Number(ped[0].preventa_orden_id), o2.id);
  const ent = (await m.ordenes.entrantePorVariacion(e.org, [v])).get(v)!;
  assert.deepEqual([ent.llegando, ent.prevendido, ent.saldo], [30, 8, 22]);
});
