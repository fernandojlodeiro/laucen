// Tests de las funciones únicas del cimiento (orden 136): convertir,
// precioDe, moverStock, cambiarEstado y crearPedido.
//
// Corren contra una base de verdad (TEST_DATABASE_URL), nunca contra la de
// producción por accidente: sin esa variable no corren. Pueden correr en
// paralelo contra la misma base (AGENTS.md → "Tests en paralelo"): cada test
// arma su PROPIA organización y todo lo que crea cuelga de ella; nadie borra
// nada al terminar ni vacía tablas. Lo único compartido es crear las tablas,
// y eso va con candado (pg_advisory_xact_lock en lib/erp/esquema.ts).
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
  esquema: typeof import("@/lib/erp/esquema");
  moneda: typeof import("@/lib/moneda");
  precios: typeof import("@/lib/precios");
  stock: typeof import("@/lib/stock");
  pedidos: typeof import("@/lib/pedidos");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    moneda: await import("@/lib/moneda"),
    precios: await import("@/lib/precios"),
    stock: await import("@/lib/stock"),
    pedidos: await import("@/lib/pedidos"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

/** Una organización nueva con tipo de cambio propio (1 USD = 1000 ARS), un
 *  depósito, una lista "Web" y un canal que vende desde ese depósito. */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date - 1, 1000, 'test')", [org]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [deposito]);
  const lista = await id("insert into lista_precios (organizacion_id, nombre) values ($1, 'Web') returning id", [org]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo, lista_precios_id) values ($1, 'Web', 'web_minorista', $2) returning id", [org, lista]);
  await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, canal, deposito]);
  const producto = async (sku: string, tipo = "simple", familia: number | null = null) => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo, tipo, familia_id) values ($1, $2, $3, $4, $5) returning id", [org, sku, `Producto ${sku}`, tipo, familia]);
    return id("select id from variacion where producto_id = $1 and es_default", [p]);
  };
  return { org, deposito, general, lista, canal, producto };
}

test("convertir: usa el tipo de cambio del día y redondea a centavos", async () => {
  const e = await escenario();
  assert.equal(await m.moneda.convertir(e.org, 5000, "ARS", "USD"), 5);
  assert.equal(await m.moneda.convertir(e.org, 12.345, "USD", "ARS"), 12345);
  assert.equal(await m.moneda.convertir(e.org, 7, "USD", "USD"), 7);
  const sinTc = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, 'sin tc')", [sinTc]);
  // Sin tipo de cambio propio, usa el global si hay; si no hay ninguno, error en criollo.
  const global = await q("select 1 from tipo_cambio where organizacion_id is null limit 1");
  if (!global.length) await assert.rejects(m.moneda.convertir(sinTc, 1, "ARS", "USD"), /tipo de cambio/);
});

test("producto simple nace con su variación default; precioDe hereda el descuento de la familia padre", async () => {
  const e = await escenario();
  const abuela = await id("insert into familia (organizacion_id, nombre, descuento_pct) values ($1, 'Electrónica', 20) returning id", [e.org]);
  const madre = await id("insert into familia (organizacion_id, nombre, padre_id) values ($1, 'Fuentes', $2) returning id", [e.org, abuela]);
  const v = await e.producto("FU-1", "simple", madre);
  const vars = await q<{ sku: string }>("select sku from variacion where id = $1", [v]);
  assert.equal(vars[0].sku, "FU-1");

  await m.precios.guardarPrecio(e.org, { listaId: e.lista, variacionId: v, importe: 10000, moneda: "ARS" });
  let p = await m.precios.precioDe(e.org, v, e.lista);
  assert.ok(p);
  assert.deepEqual(p.lista, { ars: 10000, usd: 10 });
  assert.equal(p.descuentoPct, 20);
  assert.deepEqual(p.venta, { ars: 8000, usd: 8 });

  // El del producto gana al de la familia; el de la variación, al del producto.
  await q("update producto set descuento_pct = 10 where id = (select producto_id from variacion where id = $1)", [v]);
  p = await m.precios.precioDe(e.org, v, e.lista);
  assert.equal(p!.descuentoPct, 10);
  await q("update variacion set descuento_pct = 0 where id = $1", [v]);
  p = await m.precios.precioDe(e.org, v, e.lista);
  assert.equal(p!.descuentoPct, 0);
  assert.equal(p!.venta.ars, 10000);

  // Otra organización no ve el precio.
  const otra = await escenario();
  assert.equal(await m.precios.precioDe(otra.org, v, e.lista), null);
});

test("precio en dólares: el peso queda congelado; carga masiva por porcentaje", async () => {
  const e = await escenario();
  const v = await e.producto("USD-1");
  await m.precios.guardarPrecio(e.org, { listaId: e.lista, variacionId: v, importe: 50, moneda: "USD" });
  const mayorista = await id("insert into lista_precios (organizacion_id, nombre) values ($1, 'Mayorista') returning id", [e.org]);
  const n = await m.precios.precioMasivoPorPorcentaje(e.org, { listaDestinoId: mayorista, listaOrigenId: e.lista, porcentaje: -25 });
  assert.equal(n, 1);
  const p = await m.precios.precioDe(e.org, v, mayorista);
  assert.equal(p!.monedaOrigen, "USD");
  assert.deepEqual(p!.lista, { ars: 37500, usd: 37.5 });
  // Cambia el tipo de cambio: el precio ya cargado no se recalcula.
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date, 2000, 'test')", [e.org]);
  const p2 = await m.precios.precioDe(e.org, v, mayorista);
  assert.equal(p2!.lista.ars, 37500);
});

test("moverStock: valida, actualiza stock y deja el movimiento", async () => {
  const e = await escenario();
  const v = await e.producto("ST-1");
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "ingreso", cantidad: 10, destinoId: e.general });
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "ajuste", cantidad: 3, origenId: e.general, nota: "rotura" });
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), 7);
  await assert.rejects(m.stock.moverStock(e.org, { variacionId: v, tipo: "ingreso", cantidad: 1, origenId: e.general }), /destino/);
  await assert.rejects(m.stock.moverStock(e.org, { variacionId: v, tipo: "ingreso", cantidad: 0, destinoId: e.general }), /mayor que cero/);
  // Una ubicación de otra organización no sirve.
  const otra = await escenario();
  await assert.rejects(m.stock.moverStock(e.org, { variacionId: v, tipo: "ingreso", cantidad: 1, destinoId: otra.general }), /no existe/);
  const movs = await q("select tipo from movimiento_stock where variacion_id = $1 order by id", [v]);
  assert.deepEqual(movs.map((x) => x.tipo), ["ingreso", "ajuste"]);
});

test("kits: su stock se calcula de los componentes y venderlo descuenta cada componente", async () => {
  const e = await escenario();
  const a = await e.producto("K-A");
  const b = await e.producto("K-B");
  const kit = await e.producto("K-KIT", "kit");
  await q("insert into kit_componente (organizacion_id, variacion_kit_id, variacion_componente_id, cantidad) values ($1, $2, $3, 2), ($1, $2, $4, 1)", [e.org, kit, a, b]);
  await m.stock.moverStock(e.org, { variacionId: a, tipo: "ingreso", cantidad: 7, destinoId: e.general });
  await m.stock.moverStock(e.org, { variacionId: b, tipo: "ingreso", cantidad: 5, destinoId: e.general });
  assert.equal(await m.stock.disponibleCanal(e.org, kit, e.canal), 3); // min(7/2, 5/1)
  await m.stock.moverStock(e.org, { variacionId: kit, tipo: "egreso", cantidad: 2, origenId: e.general });
  assert.equal(await m.stock.disponibleCanal(e.org, a, e.canal), 3);
  assert.equal(await m.stock.disponibleCanal(e.org, b, e.canal), 3);
  assert.equal(await m.stock.disponibleCanal(e.org, kit, e.canal), 1);
  const kitStock = await q("select 1 from stock where variacion_id = $1", [kit]);
  assert.equal(kitStock.length, 0, "el kit no guarda stock propio");
});

test("umbral de pausa: avisa una sola vez al cruzarlo, con el umbral de la publicación", async () => {
  const e = await escenario();
  const v = await e.producto("UM-1");
  await q("insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, umbral_pausa) values ($1, $2, $3, 'MLA1', 2)", [e.org, v, e.canal]);
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "ingreso", cantidad: 5, destinoId: e.general });
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "egreso", cantidad: 2, origenId: e.general }); // 3: arriba
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "egreso", cantidad: 1, origenId: e.general }); // 2: cruza
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "egreso", cantidad: 1, origenId: e.general }); // 1: sigue abajo
  const ev = await q<{ payload: { disponible: number; umbral: number; canal_id: number } }>(
    "select payload from evento where organizacion_id = $1 and tipo = 'stock_bajo_umbral'", [e.org]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].payload.disponible, 2);
  assert.equal(ev[0].payload.umbral, 2);
  assert.equal(ev[0].payload.canal_id, e.canal);
});

test("crearPedido + cambiarEstado: reserva al pagar, vende al despachar, no duplica, valida transiciones", async () => {
  const e = await escenario();
  const v = await e.producto("PE-1");
  await m.precios.guardarPrecio(e.org, { listaId: e.lista, variacionId: v, importe: 1500, moneda: "ARS" });
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "ingreso", cantidad: 4, destinoId: e.general });

  const entrada = {
    canalId: e.canal, id_externo: "W-1",
    cliente: { id_externo: "comprador-9", nombre: "Juana Pérez", email: "juana@example.com", documento_tipo: "DNI", documento_numero: "30.123.456" },
    lineas: [{ sku: "PE-1", cantidad: 3 }],
  };
  const r = await m.pedidos.crearPedido(e.org, entrada, "sistema");
  assert.equal(r.creado, true);
  assert.deepEqual(r.total, { ars: 4500, usd: 4.5 });
  const otra = await m.pedidos.crearPedido(e.org, entrada, "sistema");
  assert.equal(otra.creado, false);
  assert.equal(otra.pedidoId, r.pedidoId);

  // El mismo comprador en otro pedido se enlaza al mismo cliente.
  const r2 = await m.pedidos.crearPedido(e.org, { ...entrada, id_externo: "W-2", cliente: { id_externo: "comprador-9" }, lineas: [{ variacion_id: v, cantidad: 1, precio_unitario: 999 }] }, "sistema");
  assert.equal(r2.clienteId, r.clienteId);
  assert.deepEqual(r2.total, { ars: 999, usd: 1 });

  await m.pedidos.cambiarEstado(e.org, r.pedidoId, "pagado", "sistema");
  let s = await q<{ cantidad: number; reservado: number }>("select cantidad, reservado from stock where variacion_id = $1", [v]);
  assert.deepEqual(s[0], { cantidad: 4, reservado: 3 });
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), 1);

  await assert.rejects(m.pedidos.cambiarEstado(e.org, r.pedidoId, "nuevo", "sistema"), /no puede volver/);
  await m.pedidos.cambiarEstado(e.org, r.pedidoId, "despachado", "sistema");
  s = await q("select cantidad, reservado from stock where variacion_id = $1", [v]);
  assert.deepEqual(s[0], { cantidad: 1, reservado: 0 });
  assert.equal(await m.pedidos.cambiarEstado(e.org, r.pedidoId, "despachado", "sistema"), "despachado", "repetir no hace nada");

  // Otro pedido pagado y cancelado: libera la reserva.
  await m.pedidos.cambiarEstado(e.org, r2.pedidoId, "pagado", "sistema");
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), 0);
  await m.pedidos.cambiarEstado(e.org, r2.pedidoId, "cancelado", "sistema");
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), 1);
  await assert.rejects(m.pedidos.cambiarEstado(e.org, r2.pedidoId, "pagado", "sistema"), /no cambia más/);

  const hist = await q("select estado_nuevo from pedido_estado_historial where pedido_id = $1 order by id", [r.pedidoId]);
  assert.deepEqual(hist.map((h) => h.estado_nuevo), ["nuevo", "pagado", "despachado"]);
  const ev = await q("select count(*)::int n from evento where organizacion_id = $1 and tipo = 'pedido_estado_cambiado'", [e.org]);
  assert.equal(ev[0].n, 6);
});

test("pedido sin stock: se reserva igual y el disponible queda negativo", async () => {
  const e = await escenario();
  const v = await e.producto("SS-1");
  const r = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 2, precio_unitario: 100 }] }, "sistema");
  await m.pedidos.cambiarEstado(e.org, r.pedidoId, "pagado", "sistema");
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), -2);
});

test("venta histórica: nace entregada y no toca stock", async () => {
  const e = await escenario();
  const v = await e.producto("HI-1");
  // Las históricas convierten con el tipo de cambio de su fecha (la historia
  // se carga desde Configuración → Tipo de cambio).
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, '2019-05-01', 45, 'test')", [e.org]);
  const r = await m.pedidos.crearPedido(e.org, {
    canalId: e.canal, id_externo: "VS-1", fecha: "2019-05-02", afecta_stock: false, estado_inicial: "entregado",
    lineas: [{ variacion_id: v, cantidad: 1, precio_unitario: 100 }],
  }, "sistema");
  const p = await q<{ estado: string; total_usd: string }>("select estado, total_usd from pedido where id = $1", [r.pedidoId]);
  assert.equal(p[0].estado, "entregado");
  assert.equal(Number(p[0].total_usd), 2.22);
  const s = await q("select 1 from movimiento_stock where variacion_id = $1", [v]);
  assert.equal(s.length, 0);
});

test("picking: lote desde las reservas, escaneo por código, terminar deja preparado", async () => {
  const e = await escenario();
  const v = await e.producto("PK-1");
  await q("update variacion set codigo_barras = '7790000000017' where id = $1", [v]);
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "ingreso", cantidad: 5, destinoId: e.general });
  const r = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 2, precio_unitario: 100 }] }, "sistema");
  await m.pedidos.cambiarEstado(e.org, r.pedidoId, "pagado", "sistema");
  const pk = await import("@/lib/deposito/picking");
  const para = await pk.pedidosParaPreparar(e.org, e.deposito);
  assert.deepEqual(para.map((p) => p.id), [r.pedidoId]);
  const lote = await pk.crearLote(e.org, e.deposito, [r.pedidoId], "u1");
  assert.equal((await q<{ estado: string }>("select estado from pedido where id = $1", [r.pedidoId]))[0].estado, "en_preparacion");
  await assert.rejects(pk.escanear(e.org, lote, "OTRO"), /no es de este picking/);
  await pk.escanear(e.org, lote, "7790000000017");
  const x = await pk.escanear(e.org, lote, "pk-1");
  assert.equal(x.completo, true);
  await assert.rejects(pk.escanear(e.org, lote, "PK-1"), /sobra/);
  const fin = await pk.terminarLote(e.org, lote, "u1");
  assert.deepEqual(fin.preparados, [r.pedidoId]);
  assert.equal((await q<{ estado: string }>("select estado from pedido where id = $1", [r.pedidoId]))[0].estado, "preparado");
});

test("recepción: ingreso a una ubicación por código y devolución que deja el pedido devuelto", async () => {
  const e = await escenario();
  const v = await e.producto("RC-1");
  await q("insert into ubicacion (organizacion_id, deposito_id, codigo, orden_recorrido) values ($1, $2, 'A-01', 1)", [e.org, e.deposito]);
  const rc = await import("@/lib/deposito/recepcion");
  const id = await rc.crearRecepcion(e.org, { tipo: "compra", depositoId: e.deposito, documento: "R-0001" }, "u1");
  const r = await rc.recibir(e.org, id, { codigo: "RC-1", cantidad: 3, ubicacion: "a-01" }, "u1");
  assert.equal(r.ubicacion, "A-01");
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), 3);
  await rc.cerrarRecepcion(e.org, id, "u1");
  await assert.rejects(rc.recibir(e.org, id, { codigo: "RC-1", cantidad: 1 }, "u1"), /cerrada/);
  // Devolución de un pedido entregado.
  const p = await m.pedidos.crearPedido(e.org, { canalId: e.canal, lineas: [{ variacion_id: v, cantidad: 1, precio_unitario: 10 }] }, "sistema");
  await m.pedidos.cambiarEstado(e.org, p.pedidoId, "pagado", "sistema");
  await m.pedidos.cambiarEstado(e.org, p.pedidoId, "entregado", "sistema");
  const dev = await rc.crearRecepcion(e.org, { tipo: "devolucion", depositoId: e.deposito, pedidoId: p.pedidoId }, "u1");
  await rc.recibir(e.org, dev, { codigo: "RC-1", cantidad: 1 }, "u1");
  await rc.cerrarRecepcion(e.org, dev, "u1");
  assert.equal((await q<{ estado: string }>("select estado from pedido where id = $1", [p.pedidoId]))[0].estado, "devuelto");
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), 3);
});
