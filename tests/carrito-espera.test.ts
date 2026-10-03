// Tests de la espera del carrito de Mercado Libre (Fer, 3/10): durante los 10
// minutos siguientes al último evento de un carrito (llegó una orden del pack,
// una cambió de estado, se sumaron o sacaron líneas) nadie lo toca —ni el
// operador ni la facturación automática—; pasada la espera, todo anda. Una
// orden suelta (sin carrito) no espera. Nunca se llama a ML ni a ARCA de
// verdad: las órdenes son de mentira y el emisor no tiene certificado.
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
  picking: typeof import("@/lib/deposito/picking");
  facturar: typeof import("@/lib/arca/facturar");
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
    picking: await import("@/lib/deposito/picking"),
    facturar: await import("@/lib/arca/facturar"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);
const ESPERA = /carrito de Mercado Libre recibió un cambio hace \d+ min: se puede tocar desde las \d\d:\d\d/;

/** Organización con canal de ML, cuenta, depósito con stock de dos productos
 *  publicados y emisor que factura solo al pasar a pagado (sin certificado). */
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
  for (const item of ["MLA1", "MLA2", "MLA3"]) {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo) values ($1, $2, $3) returning id", [org, `${item}-${randomUUID().slice(0, 6)}`, `Producto ${item}`]);
    const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
    await q("insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, estado) values ($1, $2, $3, $4, 'activa')", [org, v, canal, item]);
    await m.stock.moverStock(org, { variacionId: v, tipo: "ingreso", cantidad: 10, destinoId: general });
  }
  await q(`insert into emisor (organizacion_id, cuit, razon_social, condicion_iva, facturar_automatico, facturar_al)
           values ($1, '20123456786', 'Prueba', 'monotributo', true, 'pagado')`, [org]);
  return { org, canal, cuenta, deposito };
}

let siguiente = 3000000000 + Math.floor(Math.random() * 1e8);
function orden(item: string, pack: number | null): OrdenMl {
  return {
    id: siguiente++, status: "paid", date_created: new Date().toISOString(), pack_id: pack, total_amount: 1000, currency_id: "ARS",
    order_items: [{ item: { id: item, title: `Artículo ${item}`, variation_id: null, seller_sku: null, seller_custom_field: null }, quantity: 1, unit_price: 1000, sale_fee: 100 }],
    buyer: { id: 777, nickname: "COMPRADOR" }, shipping: { id: null }, payments: [{ payment_type: "account_money", status: "approved" }],
  };
}

const haceMin = (pid: number, min: number) => q("update pedido set carrito_ultimo_evento_ts = now() - make_interval(mins => $2) where id = $1", [pid, min]);
const eventoPagado = async (org: string, pid: number) =>
  (await q<{ procesado: boolean }>(`select procesado_ts is not null procesado from evento
     where organizacion_id = $1 and tipo = 'pedido_estado_cambiado' and payload ->> 'pedido_id' = $2 and payload ->> 'nuevo' = 'pagado'`, [org, String(pid)]))[0];
const comprobantes = async (pid: number) => Number((await q<{ n: string }>("select count(*) n from comprobante where pedido_id = $1", [pid]))[0].n);

test("carrito de ML en espera: nadie lo toca hasta 10 min después del último evento; después, todo anda", async () => {
  const e = await escenario();
  const pack = siguiente++;
  const pid = (await m.ml.cargarOrdenes(e.cuenta, [orden("MLA1", pack), orden("MLA2", pack)], {}, null))!;
  const p = (await q<{ estado: string; ts: Date | null }>("select estado, carrito_ultimo_evento_ts ts from pedido where id = $1", [pid]))[0];
  assert.equal(p.estado, "pagado");
  assert.ok(p.ts, "el carrito guarda el momento de su último evento");

  // ── Último evento hace 2 minutos: todo rechazado ──
  await haceMin(pid, 2);
  assert.ok(m.pedidos.carritoEnEspera({ carrito_ultimo_evento_ts: new Date(Date.now() - 120_000) }));
  await assert.rejects(m.pedidos.cambiarEstado(e.org, pid, "en_preparacion", "operador"), ESPERA, "el operador no le cambia el estado");
  await assert.rejects(m.facturar.prepararFactura(e.org, pid, "operador"), ESPERA, "no se factura a mano");
  await assert.rejects(m.picking.crearLote(e.org, e.deposito, [pid], "operador"), ESPERA, "no se arma picking");
  const lista = await m.picking.pedidosParaPreparar(e.org, e.deposito);
  assert.equal(lista.find((x) => x.id === pid)?.en_espera, true, "en la lista de picking aparece en espera");

  // Facturación automática: lo saltea SIN consumir el evento (la próxima vuelta lo retoma).
  const r1 = await m.facturar.facturarPendientes(e.org, Date.now() + 30_000);
  assert.equal(r1.emitidos, 0);
  assert.equal(r1.errores.length, 0, "ni siquiera lo intenta");
  assert.equal((await eventoPagado(e.org, pid)).procesado, false, "el evento sigue pendiente");
  assert.equal(await comprobantes(pid), 0);

  // Lo que manda ML sí entra (es el evento mismo) y arranca la espera de nuevo.
  await m.ml.cargarOrdenes(e.cuenta, [orden("MLA3", pack)], {}, null);
  assert.equal(Number((await q<{ n: string }>("select count(*) n from pedido_linea where pedido_id = $1", [pid]))[0].n), 3);
  const reciente = (await q<{ ok: boolean }>("select carrito_ultimo_evento_ts > now() - interval '1 minute' ok from pedido where id = $1", [pid]))[0];
  assert.ok(reciente.ok, "la orden nueva del carrito reinicia la espera");

  // ── Pasaron 11 minutos: todo vuelve a andar ──
  await haceMin(pid, 11);
  assert.equal(m.pedidos.carritoEnEspera({ carrito_ultimo_evento_ts: new Date(Date.now() - 11 * 60_000) }), null);
  const r2 = await m.facturar.facturarPendientes(e.org, Date.now() + 30_000);
  assert.equal((await eventoPagado(e.org, pid)).procesado, true, "pasada la espera, la facturación automática toma el evento");
  assert.equal(await comprobantes(pid), 1, "y arma la factura");
  assert.ok(r2.errores.every((x) => !ESPERA.test(x)), "si falla es por ARCA (sin certificado), no por la espera");
  assert.equal((await m.picking.pedidosParaPreparar(e.org, e.deposito)).find((x) => x.id === pid)?.en_espera, false);
  const lote = await m.picking.crearLote(e.org, e.deposito, [pid], "operador");
  assert.equal((await q<{ estado: string }>("select estado from pedido where id = $1", [pid]))[0].estado, "en_preparacion");

  // Si el carrito recibe un cambio mientras se prepara, no pasa a preparado.
  await haceMin(pid, 0);
  const fin = await m.picking.terminarLote(e.org, lote, "operador");
  assert.deepEqual(fin.enEspera, [pid]);
  assert.deepEqual(fin.preparados, []);
  assert.equal((await q<{ estado: string }>("select estado from pedido where id = $1", [pid]))[0].estado, "en_preparacion");
});

test("unir carritos partidos: saltea los carritos en espera", async () => {
  const e = await escenario();
  const pack = siguiente++;
  const viejo = async (item: number) => {
    const v = await id("select v.id from variacion v join publicacion pu on pu.variacion_id = v.id where pu.canal_id = $1 order by v.id offset $2 limit 1", [e.canal, item]);
    return (await m.pedidos.crearPedido(e.org, {
      canalId: e.canal, id_externo: String(siguiente++), cliente: { id_externo: "777", apodo_ml: "COMPRADOR" },
      lineas: [{ variacion_id: v, cantidad: 1, precio_unitario: 100 }], envio: { pack_id: pack },
    }, "sistema")).pedidoId;
  };
  const a = await viejo(0);
  await viejo(1);
  await haceMin(a, 3);
  const r = await m.carritos.unirPedidosPartidos(e.org, "sistema");
  assert.equal(r.unidos.length, 0);
  assert.match(r.sinUnir[0].motivo, /menos de 10 min/);
  await haceMin(a, 11);
  const r2 = await m.carritos.unirPedidosPartidos(e.org, "sistema");
  assert.equal(r2.unidos.length, 1);
});

test("orden de ML sin carrito: no espera nada", async () => {
  const e = await escenario();
  const pid = (await m.ml.cargarOrdenes(e.cuenta, [orden("MLA1", null)], {}, null))!;
  const p = (await q<{ ts: Date | null }>("select carrito_ultimo_evento_ts ts from pedido where id = $1", [pid]))[0];
  assert.equal(p.ts, null, "una orden suelta no lleva espera");
  await m.picking.crearLote(e.org, e.deposito, [pid], "operador");
  assert.equal((await q<{ estado: string }>("select estado from pedido where id = $1", [pid]))[0].estado, "en_preparacion");
});
