// Tests del aviso de stock al instante (db/stock.sql, "Stock que cambió"):
// todo cambio de stock anota la variación una sola vez en
// stock_cambio_pendiente y avisa a la app una sola vez por transacción (con un
// pg_net de mentira: un esquema `net` que sólo guarda la llamada);
// procesarCambiosStock encola la cantidad nueva en los canales de ML con el
// interruptor prendido (no en los apagados), pausa con prioridad al llegar al
// umbral y suma los kits que usan el componente. Nunca se llama a ML.
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
  stock: typeof import("@/lib/stock");
  pedidos: typeof import("@/lib/pedidos");
  sync: typeof import("@/lib/mercadolibre/stock");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    stock: await import("@/lib/stock"),
    pedidos: await import("@/lib/pedidos"),
    sync: await import("@/lib/mercadolibre/stock"),
  };
  await m.esquema.asegurarEsquemaErp();
  // pg_net de mentira: sólo anota a qué dirección se llamó.
  await m.db.pool.query(`
    drop schema if exists net cascade;
    create schema net;
    create table net.http_request_queue (id serial primary key, url text);
    create function net.http_get(url text, timeout_milliseconds int default 5000) returns bigint
      language sql as $$ insert into net.http_request_queue (url) values (url) returning id::bigint $$;`);
});

after(async () => {
  await m.db.pool.query("drop schema if exists net cascade");
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);
const llamadas = async () => Number((await q<{ n: string }>("select count(*) n from net.http_request_queue where url like '%/api/erp/stock?clave=%'"))[0].n);
const pendientes = async (org: string) => (await q<{ variacion_id: string }>(
  "select variacion_id from stock_cambio_pendiente where organizacion_id = $1 order by variacion_id", [org])).map((r) => Number(r.variacion_id));

/** Organización con dos cuentas de ML que venden del mismo depósito: A
 *  sincroniza stock, B no. Un producto (10 unidades) publicado en las dos y un
 *  kit (2 × el producto) publicado en A. Una tienda web con lista para crear
 *  pedidos. Arranca sin pendientes. */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date - 1, 1000, 'test')", [org]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [deposito]);
  const lista = await id("insert into lista_precios (organizacion_id, nombre) values ($1, 'Web') returning id", [org]);
  const web = await id("insert into canal (organizacion_id, nombre, tipo, lista_precios_id) values ($1, 'Web', 'web_minorista', $2) returning id", [org, lista]);
  await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, web, deposito]);
  const cuenta = async (nombre: string, sincroniza: boolean) => {
    const c = await id("insert into canal (organizacion_id, nombre, tipo, config) values ($1, $2, 'mercadolibre', $3::jsonb) returning id",
      [org, nombre, JSON.stringify({ sincronizar_stock: sincroniza })]);
    await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, c, deposito]);
    await q(`insert into meli_cuenta (organizacion_id, canal_id, meli_user_id, nickname, access_token, refresh_token, expira_el)
             values ($1, $2, $3, $4, 'x', 'x', now() + interval '1 day')`, [org, c, Math.floor(Math.random() * 1e9), nombre]);
    return c;
  };
  const canalA = await cuenta("ML A", true);
  const canalB = await cuenta("ML B", false);
  const producto = async (sku: string, tipo = "simple") => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo, tipo) values ($1, $2, $3, $4) returning id", [org, sku, `Producto ${sku}`, tipo]);
    return id("select id from variacion where producto_id = $1 and es_default", [p]);
  };
  const v = await producto("SI-1");
  const kit = await producto("SI-KIT", "kit");
  await q("insert into kit_componente (organizacion_id, variacion_kit_id, variacion_componente_id, cantidad) values ($1, $2, $3, 2)", [org, kit, v]);
  await m.stock.moverStock(org, { variacionId: v, tipo: "ingreso", cantidad: 10, destinoId: general });
  const publicar = (variacion: number, canal: number, item: string, cantidad: number) => id(`
    insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, estado, cantidad_publicada)
    values ($1, $2, $3, $4, 'activa', $5) returning id`, [org, variacion, canal, item, cantidad]);
  const pubA = await publicar(v, canalA, `MLA${Math.floor(Math.random() * 1e9)}`, 10);
  const pubB = await publicar(v, canalB, `MLA${Math.floor(Math.random() * 1e9)}`, 10);
  const pubKit = await publicar(kit, canalA, `MLA${Math.floor(Math.random() * 1e9)}`, 5);
  await q("delete from stock_cambio_pendiente where organizacion_id = $1", [org]);
  const cola = () => q<{ publicacion_id: string; canal_id: string; payload: { cantidad?: number; estado?: string }; prioridad: number }>(
    "select publicacion_id, canal_id, payload, prioridad from ml_cola where organizacion_id = $1 and estado = 'pendiente' and tipo = 'stock' order by publicacion_id", [org]);
  return { org, general, web, canalA, canalB, v, kit, pubA, pubB, pubKit, cola };
}

test("una reserva desde la función de la base (cambiar_estado → reservar_pedido) anota la variación una sola vez y avisa una sola vez", async () => {
  const e = await escenario();
  const r = await m.pedidos.crearPedido(e.org, {
    canalId: e.web, id_externo: `W-${randomUUID()}`, cliente: { nombre: "Juana" },
    // Dos líneas de la misma variación: dos movimientos en la misma transacción.
    lineas: [{ variacion_id: e.v, cantidad: 2, precio_unitario: 100 }, { variacion_id: e.v, cantidad: 1, precio_unitario: 100 }],
  }, "sistema");
  await q("delete from stock_cambio_pendiente where organizacion_id = $1", [e.org]);
  const antes = await llamadas();
  await m.pedidos.cambiarEstado(e.org, r.pedidoId, "pagado", "sistema");
  const s = await q<{ reservado: number }>("select reservado from stock where variacion_id = $1", [e.v]);
  assert.equal(s[0].reservado, 3);
  assert.deepEqual(await pendientes(e.org), [e.v], "una sola fila por variación");
  assert.equal(await llamadas(), antes + 1, "un solo aviso por transacción");

  // Otro cambio con la fila todavía pendiente: no duplica la fila, pero avisa (otra transacción).
  await m.stock.moverStock(e.org, { variacionId: e.v, tipo: "egreso", cantidad: 1, origenId: e.general });
  assert.deepEqual(await pendientes(e.org), [e.v]);
  assert.equal(await llamadas(), antes + 2);
});

test("procesarCambiosStock encola la cantidad nueva en las cuentas que sincronizan (no en las apagadas), con los kits del componente", async () => {
  const e = await escenario();
  await m.stock.moverStock(e.org, { variacionId: e.v, tipo: "reserva", cantidad: 3, origenId: e.general }); // disponible 7, kit 3
  const r = await m.sync.procesarCambiosStock(e.org);
  assert.equal(r.variaciones, 1);
  assert.ok(r.tiendas.includes(e.web), "invalida la copia del catálogo de la tienda");
  assert.deepEqual(await pendientes(e.org), [], "las toma todas");
  const cola = await e.cola();
  assert.deepEqual(cola.map((c) => [Number(c.publicacion_id), c.payload.cantidad]).sort(), [[e.pubA, 7], [e.pubKit, 3]].sort());
  assert.ok(cola.every((c) => Number(c.canal_id) === e.canalA), "la cuenta con el interruptor apagado no recibe nada");

  // Otro cambio antes de que salga: la cantidad nueva reemplaza a la pendiente.
  await m.stock.moverStock(e.org, { variacionId: e.v, tipo: "egreso", cantidad: 1, origenId: e.general }); // 6, kit 3
  await m.sync.procesarCambiosStock(e.org);
  const cola2 = await e.cola();
  assert.equal(cola2.filter((c) => Number(c.publicacion_id) === e.pubA).length, 1);
  assert.equal(cola2.find((c) => Number(c.publicacion_id) === e.pubA)?.payload.cantidad, 6);
});

test("al llegar al umbral la pausa entra con prioridad máxima (también el kit que se queda sin stock)", async () => {
  const e = await escenario();
  await m.stock.moverStock(e.org, { variacionId: e.v, tipo: "egreso", cantidad: 10, origenId: e.general }); // 0 = umbral (sin nada cargado); kit 0
  await m.sync.procesarCambiosStock(e.org);
  const cola = await e.cola();
  const pausa = cola.find((c) => Number(c.publicacion_id) === e.pubA);
  assert.equal(pausa?.payload.estado, "paused");
  assert.equal(pausa?.prioridad, 100);
  assert.equal(cola.find((c) => Number(c.publicacion_id) === e.pubKit)?.payload.estado, "paused");
  assert.ok(!cola.some((c) => Number(c.publicacion_id) === e.pubB));
});

test("una organización sin ML sincronizando ni tienda no anota nada", async () => {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [deposito]);
  await q("insert into canal (organizacion_id, nombre, tipo, config) values ($1, 'ML', 'mercadolibre', '{\"sincronizar_stock\": false}')", [org]);
  const p = await id("insert into producto (organizacion_id, sku_base, titulo) values ($1, 'NA-1', 'Nada') returning id", [org]);
  const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
  const antes = await llamadas();
  await m.stock.moverStock(org, { variacionId: v, tipo: "ingreso", cantidad: 5, destinoId: general });
  assert.deepEqual(await pendientes(org), []);
  assert.equal(await llamadas(), antes);
});
