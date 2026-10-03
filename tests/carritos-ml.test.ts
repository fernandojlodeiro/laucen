// Tests de los carritos de Mercado Libre (un pack = UN pedido): órdenes del
// mismo pack que llegan por separado, la orden suelta de siempre, una orden
// cancelada dentro del carrito, y el arreglo que une los pedidos que
// quedaron partidos. Nunca se llama a ML: las órdenes son de mentira y se
// cargan con cargarOrdenes (lo que hace importarOrden después de leerlas).
//
//   TEST_DATABASE_URL=postgresql://… npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { OrdenMl } from "@/lib/mercadolibre/pedidos";
import type { CuentaMl } from "@/lib/mercadolibre/api";

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
  ml: typeof import("@/lib/mercadolibre/pedidos");
  carritos: typeof import("@/lib/mercadolibre/carritos");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    stock: await import("@/lib/stock"),
    pedidos: await import("@/lib/pedidos"),
    ml: await import("@/lib/mercadolibre/pedidos"),
    carritos: await import("@/lib/mercadolibre/carritos"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

/** Organización con un canal de ML, su cuenta y un depósito con stock de dos productos publicados. */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [deposito]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'ML', 'mercadolibre') returning id", [org]);
  await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, canal, deposito]);
  const meliUser = Math.floor(Math.random() * 1e9);
  const cuentaId = await id(`insert into meli_cuenta (organizacion_id, canal_id, meli_user_id, nickname, access_token, refresh_token, expira_el)
           values ($1, $2, $3, 'prueba', 'x', 'x', now() + interval '1 day') returning id`, [org, canal, meliUser]);
  const cuenta: CuentaMl = { id: cuentaId, organizacionId: org, canalId: canal, meliUserId: meliUser, nickname: "prueba", estado: "activa" };
  const producto = async (sku: string, item: string) => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo) values ($1, $2, $3) returning id", [org, sku, `Producto ${sku}`]);
    const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
    await q("insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, estado) values ($1, $2, $3, $4, 'activa')", [org, v, canal, item]);
    await m.stock.moverStock(org, { variacionId: v, tipo: "ingreso", cantidad: 10, destinoId: general });
    return v;
  };
  const a = await producto(`A-${randomUUID().slice(0, 6)}`, "MLA1");
  const b = await producto(`B-${randomUUID().slice(0, 6)}`, "MLA2");
  return { org, canal, cuenta, a, b };
}

let siguiente = 2000000000 + Math.floor(Math.random() * 1e8);
/** Una orden de ML de mentira: un artículo, un comprador. */
function orden(item: string, o: { pack?: number | null; status?: string; cantidad?: number; precio?: number; fee?: number; comprador?: number } = {}): OrdenMl {
  const precio = o.precio ?? 1000;
  return {
    id: siguiente++, status: o.status ?? "paid", date_created: "2026-10-03T12:00:00.000-03:00", pack_id: o.pack ?? null,
    total_amount: precio * (o.cantidad ?? 1), currency_id: "ARS",
    order_items: [{ item: { id: item, title: `Artículo ${item}`, variation_id: null, seller_sku: null, seller_custom_field: null }, quantity: o.cantidad ?? 1, unit_price: precio, sale_fee: o.fee ?? 100 }],
    buyer: { id: o.comprador ?? 777, nickname: "COMPRADOR" }, shipping: { id: null }, payments: [{ payment_type: "account_money", status: "approved" }],
  };
}

const pedidosDelCanal = (canal: number) =>
  q<{ id: string; id_externo: string; estado: string; estado_pago: string; total_ars: string; comision_ars: string | null }>(
    "select id, id_externo, estado, estado_pago, total_ars, comision_ars from pedido where canal_id = $1 order by id", [canal]);
const lineas = (pedido: number | string) =>
  q<{ variacion_id: string; cantidad: number; orden_ml: string | null }>(
    "select variacion_id, cantidad, datos_externos #>> '{ml,order_id}' orden_ml from pedido_linea where pedido_id = $1 order by orden, id", [pedido]);
const reservado = async (v: number) => Number((await q<{ n: string }>("select coalesce(sum(reservado), 0) n from stock where variacion_id = $1", [v]))[0].n);

test("carrito de ML: dos órdenes del mismo pack que llegan por separado quedan en UN pedido con dos líneas", async () => {
  const e = await escenario();
  const pack = siguiente++;
  const o1 = orden("MLA1", { pack, cantidad: 2, precio: 1000, fee: 150 });
  const o2 = orden("MLA2", { pack, cantidad: 1, precio: 500, fee: 80 });

  const p1 = await m.ml.cargarOrdenes(e.cuenta, [o1], {}, null);
  let ps = await pedidosDelCanal(e.canal);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].id_externo, String(pack), "el pedido de un carrito lleva el pack_id");
  assert.equal(ps[0].estado, "pagado");
  assert.equal(await reservado(e.a), 2);

  // Llega la segunda orden del carrito: se suma al mismo pedido.
  const p2 = await m.ml.cargarOrdenes(e.cuenta, [o2], {}, null);
  assert.equal(p2, p1);
  ps = await pedidosDelCanal(e.canal);
  assert.equal(ps.length, 1, "no se crea un segundo pedido");
  assert.equal(Number(ps[0].total_ars), 2500);
  assert.equal(Number(ps[0].comision_ars), 230);
  assert.equal(ps[0].estado_pago, "pagado");
  const ls = await lineas(p1!);
  assert.equal(ls.length, 2);
  assert.deepEqual(ls.map((l) => l.orden_ml), [String(o1.id), String(o2.id)], "cada línea guarda su orden de ML");
  assert.equal(await reservado(e.b), 1, "la línea que llegó después también reserva (el pedido ya estaba pagado)");

  // Repetir las notificaciones (sueltas o juntas) no duplica nada.
  await m.ml.cargarOrdenes(e.cuenta, [o1], {}, null);
  await m.ml.cargarOrdenes(e.cuenta, [o2, o1], {}, null);
  assert.equal((await pedidosDelCanal(e.canal)).length, 1);
  assert.equal((await lineas(p1!)).length, 2);
  assert.equal(await reservado(e.a), 2);
  assert.equal(await reservado(e.b), 1);
  const datos = (await q<{ d: { ml: { ordenes: Record<string, unknown> } } }>("select datos_externos d from pedido where id = $1", [p1]))[0].d;
  assert.deepEqual(Object.keys(datos.ml.ordenes).sort(), [String(o1.id), String(o2.id)].sort());
});

test("carrito de ML: pagado sólo cuando están pagas todas las órdenes", async () => {
  const e = await escenario();
  const pack = siguiente++;
  const o1 = orden("MLA1", { pack });
  const o2 = orden("MLA2", { pack, status: "payment_required" });
  const p = await m.ml.cargarOrdenes(e.cuenta, [o1, o2], {}, null);
  let ps = await pedidosDelCanal(e.canal);
  assert.equal(ps[0].estado, "nuevo");
  assert.equal(ps[0].estado_pago, "pendiente");
  assert.equal((await lineas(p!)).length, 2);
  await m.ml.cargarOrdenes(e.cuenta, [{ ...o2, status: "paid" }], {}, null);
  ps = await pedidosDelCanal(e.canal);
  assert.equal(ps[0].estado, "pagado");
  assert.equal(ps[0].estado_pago, "pagado");
  assert.equal(await reservado(e.a), 1);
  assert.equal(await reservado(e.b), 1);
});

test("carrito de ML: una orden cancelada sale del pedido (libera su reserva); si se cancelan todas, el pedido se cancela", async () => {
  const e = await escenario();
  const pack = siguiente++;
  const o1 = orden("MLA1", { pack, precio: 1000 });
  const o2 = orden("MLA2", { pack, precio: 400 });
  const p = await m.ml.cargarOrdenes(e.cuenta, [o1, o2], {}, null);
  assert.equal(await reservado(e.b), 1);
  await m.ml.cargarOrdenes(e.cuenta, [{ ...o2, status: "cancelled" }], {}, null);
  const ls = await lineas(p!);
  assert.equal(ls.length, 1);
  assert.equal(ls[0].orden_ml, String(o1.id));
  assert.equal(await reservado(e.b), 0, "se liberó la reserva de la orden cancelada");
  assert.equal(await reservado(e.a), 1);
  let ps = await pedidosDelCanal(e.canal);
  assert.equal(Number(ps[0].total_ars), 1000);
  assert.equal(ps[0].estado, "pagado");
  await m.ml.cargarOrdenes(e.cuenta, [{ ...o1, status: "cancelled" }], {}, null);
  ps = await pedidosDelCanal(e.canal);
  assert.equal(ps[0].estado, "cancelado");
  assert.equal(await reservado(e.a), 0);
});

test("orden de ML sin carrito: un pedido por orden, como siempre", async () => {
  const e = await escenario();
  const o = orden("MLA1", { cantidad: 3, precio: 200 });
  const p = await m.ml.cargarOrdenes(e.cuenta, [o], {}, null);
  const ps = await pedidosDelCanal(e.canal);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].id_externo, String(o.id));
  assert.equal(Number(ps[0].total_ars), 600);
  const ls = await lineas(p!);
  assert.equal(ls.length, 1);
  assert.equal(ls[0].orden_ml, String(o.id));
  assert.equal(await reservado(e.a), 3);
  // Otra orden suelta del mismo comprador es otro pedido.
  await m.ml.cargarOrdenes(e.cuenta, [orden("MLA2")], {}, null);
  assert.equal((await pedidosDelCanal(e.canal)).length, 2);
});

test("unir carritos partidos: junta los pedidos viejos del mismo pack (reserva incluida) y deja los facturados", async () => {
  const e = await escenario();
  // Como entraban antes: un pedido por orden, con el pack en el envío.
  const viejo = async (orderId: string, pack: string, v: number, precio: number, pagar: boolean) => {
    const o = { ...orden(v === e.a ? "MLA1" : "MLA2", { pack: Number(pack), precio, fee: 10, status: pagar ? "paid" : "payment_required" }), id: Number(orderId) };
    const r = await m.pedidos.crearPedido(e.org, {
      canalId: e.canal, id_externo: orderId, cliente: { id_externo: "777", apodo_ml: "COMPRADOR" },
      lineas: [{ variacion_id: v, cantidad: 1, precio_unitario: precio }], envio: { pack_id: Number(pack) }, comision_ars: 10,
      estado_pago: pagar ? "pagado" : "pendiente", datos_externos: { ml: { orden: o } },
    }, "sistema");
    if (pagar) await m.pedidos.cambiarEstado(e.org, r.pedidoId, "pagado", "sistema");
    return r.pedidoId;
  };
  const pack = String(siguiente++);
  const p1 = await viejo(String(siguiente++), pack, e.a, 1000, false);
  const p2 = await viejo(String(siguiente++), pack, e.b, 500, true);
  assert.equal(await reservado(e.b), 1);

  // Otro carrito partido, pero uno de sus pedidos ya tiene factura: no se toca.
  const pack2 = String(siguiente++);
  const f1 = await viejo(String(siguiente++), pack2, e.a, 100, true);
  const f2 = await viejo(String(siguiente++), pack2, e.b, 100, true);
  await q(`insert into comprobante (organizacion_id, pedido_id, ambiente, tipo_cbte, punto_venta, doc_tipo, doc_nro, importe_total, importe_neto, estado)
           values ($1, $2, 'homologacion', 6, 1, 99, '0', 100, 100, 'autorizado')`, [e.org, f1]);

  assert.equal(await m.carritos.contarCarritosPartidos(e.org), 2);
  const r = await m.carritos.unirPedidosPartidos(e.org, "sistema");
  assert.equal(r.unidos.length, 1);
  assert.equal(r.unidos[0].pedidoId, p1);
  assert.deepEqual(r.unidos[0].absorbidos, [p2]);
  assert.equal(r.sinUnir.length, 1);
  assert.match(r.sinUnir[0].motivo, /factura/);
  assert.deepEqual(r.sinUnir[0].pedidos.sort(), [f1, f2].sort());

  const ps = await q<{ id: string; id_externo: string; estado: string; estado_pago: string; total_ars: string; comision_ars: string }>(
    "select id, id_externo, estado, estado_pago, total_ars, comision_ars from pedido where id = any($1::bigint[]) order by id", [[p1, p2]]);
  assert.equal(ps.length, 1, "el pedido absorbido ya no existe");
  assert.equal(ps[0].id_externo, pack);
  assert.equal(ps[0].estado, "pagado", "uno estaba pagado: el unido queda pagado");
  assert.equal(ps[0].estado_pago, "pendiente", "pagado sólo si estaban pagos todos");
  assert.equal(Number(ps[0].total_ars), 1500);
  assert.equal(Number(ps[0].comision_ars), 20);
  const ls = await lineas(p1);
  assert.equal(ls.length, 2);
  assert.ok(ls.every((l) => l.orden_ml), "cada línea quedó con su orden de ML");
  // Reservas: el carrito unido reservó A y B una vez cada uno; el facturado sigue con las suyas.
  assert.equal(await reservado(e.a), 2);
  assert.equal(await reservado(e.b), 2);

  // Repetirlo no hace nada más; y una orden nueva de ese pack entra al pedido unido.
  const r2 = await m.carritos.unirPedidosPartidos(e.org, "sistema");
  assert.equal(r2.unidos.length, 0);
  await m.ml.cargarOrdenes(e.cuenta, [orden("MLA2", { pack: Number(pack) })], {}, null);
  assert.equal((await lineas(p1)).length, 3);
});
