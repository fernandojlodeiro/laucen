// Tests del pedido cargado a mano (la parte que vive en crearPedido): precio
// de la lista con un descuento extra, precio escrito con descuento, y que un
// canal sin lista exige el precio.
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
  precios: typeof import("@/lib/precios");
  pedidos: typeof import("@/lib/pedidos");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    precios: await import("@/lib/precios"),
    pedidos: await import("@/lib/pedidos"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

test("pedido a mano: precio de lista con descuento extra, precio escrito con descuento", async () => {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date - 1, 1000, 'test')", [org]);
  await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const lista = await id("insert into lista_precios (organizacion_id, nombre) values ($1, 'Local') returning id", [org]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo, lista_precios_id) values ($1, 'Local', 'local', $2) returning id", [org, lista]);
  const p = await id("insert into producto (organizacion_id, sku_base, titulo) values ($1, 'MAN-1', 'Producto manual') returning id", [org]);
  const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
  await m.precios.guardarPrecio(org, { listaId: lista, variacionId: v, importe: 1000, moneda: "ARS" });

  const r = await m.pedidos.crearPedido(org, {
    canalId: canal, lineas: [
      { variacion_id: v, cantidad: 2, descuento_pct: 10 },
      { variacion_id: v, cantidad: 1, precio_unitario: 800, descuento_pct: 25 },
    ], estado_pago: "a_convenir",
  }, "usuario-prueba");
  assert.equal(r.total.ars, 2 * 900 + 600);
  const ls = await q<{ precio_lista_ars: string; descuento_pct: string; precio_unit_ars: string }>(
    "select precio_lista_ars, descuento_pct, precio_unit_ars from pedido_linea where pedido_id = $1 order by orden", [r.pedidoId]);
  assert.deepEqual(ls.map((l) => [Number(l.precio_lista_ars), Number(l.descuento_pct), Number(l.precio_unit_ars)]), [[1000, 10, 900], [800, 25, 600]]);

  await assert.rejects(m.pedidos.crearPedido(org, { canalId: canal, lineas: [{ variacion_id: v, cantidad: 1, descuento_pct: 120 }] }, "x"), /descuento/);
});
