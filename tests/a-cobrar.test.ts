// Tests de «A cobrar» (Fer, 3/10): un pedido en efectivo al retirar (o a
// convenir) no espera el pago: reserva el stock al crearse y entra en picking
// estando nuevo. Una transferencia sigue esperando. La facturación automática
// no lo factura hasta que se confirma el cobro; al confirmarlo (ya preparado)
// lo factura. Un pedido viejo en efectivo con pago pendiente se lee «A
// cobrar» y reserva al armar el lote. «Entregado y cobrado» cobra y entrega
// en un paso. Nunca se llama a ARCA de verdad (el emisor no tiene
// certificado: la factura queda armada con error).
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
  picking: typeof import("@/lib/deposito/picking");
  hojas: typeof import("@/lib/deposito/hojas");
  facturar: typeof import("@/lib/arca/facturar");
  confirmar: typeof import("@/lib/tienda/pagos/confirmar");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    stock: await import("@/lib/stock"),
    pedidos: await import("@/lib/pedidos"),
    picking: await import("@/lib/deposito/picking"),
    hojas: await import("@/lib/deposito/hojas"),
    facturar: await import("@/lib/arca/facturar"),
    confirmar: await import("@/lib/tienda/pagos/confirmar"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

/** Organización con un canal local, un depósito con 10 unidades de un
 *  producto y un emisor que factura solo al llegar a preparado (sin certificado). */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [deposito]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Local', 'local') returning id", [org]);
  const p = await id("insert into producto (organizacion_id, sku_base, titulo) values ($1, $2, 'Producto') returning id", [org, `P-${randomUUID().slice(0, 6)}`]);
  const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
  await m.stock.moverStock(org, { variacionId: v, tipo: "ingreso", cantidad: 10, destinoId: general });
  await q(`insert into emisor (organizacion_id, cuit, razon_social, condicion_iva, facturar_automatico, facturar_al)
           values ($1, '20123456786', 'Prueba', 'monotributo', true, 'preparado')`, [org]);
  const crear = (medio: string, extra: Partial<import("@/lib/pedidos").PedidoEntrada> = {}) => m.pedidos.crearPedido(org, {
    canalId: canal, cliente: { nombre: "Juana" }, lineas: [{ variacion_id: v, cantidad: 2, precio_unitario: 1000 }], medio_pago: medio,
    envio: { metodo: "Retira", a_mano: true, direccion: null }, ...extra,
  }, "operador");
  return { org, deposito, canal, v, crear };
}

const reservado = async (org: string, pid: number) =>
  Number((await q<{ n: string | null }>("select sum(cantidad) n from reservado_de($1, 'pedido', $2)", [org, String(pid)]))[0].n ?? 0);
const pedido = async (pid: number) =>
  (await q<{ estado: string; estado_pago: string; reservado_ts: Date | null; deposito_id: string | null }>(
    "select estado, estado_pago, reservado_ts, deposito_id from pedido where id = $1", [pid]))[0];
const comprobantes = async (pid: number) => Number((await q<{ n: string }>("select count(*) n from comprobante where pedido_id = $1", [pid]))[0].n);

test("efectivo: nace «A cobrar», reserva ya y entra en picking; transferencia sigue esperando el pago", async () => {
  const e = await escenario();
  const ef = await e.crear("Efectivo");
  assert.equal(ef.reservo, true);
  const p = await pedido(ef.pedidoId);
  assert.equal(p.estado, "nuevo");
  assert.equal(p.estado_pago, "a_cobrar");
  assert.ok(p.reservado_ts, "marca que ya reservó");
  assert.equal(await reservado(e.org, ef.pedidoId), 2);

  const tr = await e.crear("Transferencia");
  assert.equal(tr.reservo, false);
  assert.equal((await pedido(tr.pedidoId)).estado_pago, "pendiente");
  assert.equal(await reservado(e.org, tr.pedidoId), 0);

  const lista = await m.picking.pedidosParaPreparar(e.org, e.deposito);
  const enLista = lista.find((x) => x.id === ef.pedidoId);
  assert.ok(enLista, "el «A cobrar» está para preparar");
  assert.equal(enLista!.a_cobrar, true);
  assert.equal(enLista!.total_ars, 2000);
  assert.ok(!lista.some((x) => x.id === tr.pedidoId), "la transferencia sin pagar no");
  await assert.rejects(m.picking.crearLote(e.org, e.deposito, [tr.pedidoId], "operador"), /espera el pago/);

  // El lote no lo reserva dos veces.
  const lote = await m.picking.crearLote(e.org, e.deposito, [ef.pedidoId], "operador", "hojas");
  assert.equal((await pedido(ef.pedidoId)).estado, "en_preparacion");
  assert.equal(await reservado(e.org, ef.pedidoId), 2);
  assert.equal((await m.picking.pedidosDelLote(e.org, lote))[0].a_cobrar, true);
  const [h] = await m.hojas.datosHojas(e.org, [ef.pedidoId]);
  assert.equal(h.aCobrar, 2000, "la hoja y la etiqueta llevan el recuadro A COBRAR");
  const pdf = await m.hojas.armarPdf([h], { tam: "10x15", bajarEtiquetaMl: async () => ({ ok: false, motivo: "no" }) });
  assert.deepEqual(pdf.paginas, [`etiqueta-propia:${ef.pedidoId}`, `hoja:${ef.pedidoId}`]);

  // «Pendientes» lo sigue mostrando aunque ya esté en preparación.
  const pend = await q<{ id: string }>(`select p.id from pedido p where p.organizacion_id = $1 and ${m.pedidos.sqlPedidoPendiente("p")}`, [e.org]);
  assert.ok(pend.some((x) => Number(x.id) === ef.pedidoId));

  // Cancelado libera lo reservado.
  const otro = await e.crear("Efectivo");
  await m.pedidos.cambiarEstado(e.org, otro.pedidoId, "cancelado", "operador");
  assert.equal(await reservado(e.org, otro.pedidoId), 0);
});

test("facturación: un «A cobrar» no se factura solo hasta que se confirma el cobro; después, sí", async () => {
  const e = await escenario();
  const { pedidoId } = await e.crear("Efectivo");
  await m.pedidos.cambiarEstado(e.org, pedidoId, "preparado", "operador");
  assert.equal(await reservado(e.org, pedidoId), 2, "pasar de nuevo a preparado no reserva de nuevo");

  const r1 = await m.facturar.facturarPendientes(e.org, Date.now() + 30_000);
  assert.equal(r1.errores.length, 0, "ni lo intenta");
  assert.equal(await comprobantes(pedidoId), 0);
  await assert.rejects(m.facturar.prepararFactura(e.org, pedidoId, "operador"), /Primero confirmá el cobro/);

  await m.confirmar.confirmarPago(e.org, pedidoId, { medio: "efectivo", importe: 2000 }, "operador");
  const p = await pedido(pedidoId);
  assert.equal(p.estado_pago, "pagado");
  assert.equal(p.estado, "preparado", "no vuelve para atrás");
  await m.facturar.facturarPendientes(e.org, Date.now() + 30_000);
  assert.equal(await comprobantes(pedidoId), 1, "cobrado y ya preparado: se arma la factura");
  // Otra vuelta no la duplica.
  await m.facturar.facturarPendientes(e.org, Date.now() + 30_000);
  assert.equal(await comprobantes(pedidoId), 1);

  // Cobrado antes de llegar a preparado: se factura al llegar (como siempre).
  const b = await e.crear("Efectivo");
  await m.confirmar.confirmarPago(e.org, b.pedidoId, { medio: "efectivo", importe: 2000 }, "operador");
  assert.equal((await pedido(b.pedidoId)).estado, "pagado");
  assert.equal(await reservado(e.org, b.pedidoId), 2, "confirmar el pago no reserva de nuevo");
  await m.facturar.facturarPendientes(e.org, Date.now() + 30_000);
  assert.equal(await comprobantes(b.pedidoId), 0, "todavía no llegó a preparado");
  await m.pedidos.cambiarEstado(e.org, b.pedidoId, "preparado", "operador");
  await m.facturar.facturarPendientes(e.org, Date.now() + 30_000);
  assert.equal(await comprobantes(b.pedidoId), 1);
});

test("pedido viejo en efectivo con pago pendiente: se lee «A cobrar» y reserva al armar el lote", async () => {
  const e = await escenario();
  // Como los de antes: pago pendiente, sin reserva ni depósito.
  const { pedidoId } = await e.crear("Transferencia");
  await q("update pedido set medio_pago = 'Efectivo' where id = $1", [pedidoId]);
  const p0 = await pedido(pedidoId);
  assert.equal(p0.estado_pago, "pendiente");
  assert.equal(p0.deposito_id, null);
  assert.equal(((await m.pedidos.pedidoCompleto(e.org, pedidoId)) as Record<string, unknown>).estado_pago, "a_cobrar", "se muestra «A cobrar»");

  const lista = await m.picking.pedidosParaPreparar(e.org, e.deposito);
  assert.equal(lista.find((x) => x.id === pedidoId)?.a_cobrar, true, "aparece en picking");
  const r = await m.picking.prepararImpresion(e.org, [pedidoId], "operador");
  assert.deepEqual(r.enLote, [pedidoId]);
  assert.equal(await reservado(e.org, pedidoId), 2, "reservó al armar el lote");
  const p1 = await pedido(pedidoId);
  assert.equal(p1.estado, "en_preparacion");
  assert.equal(Number(p1.deposito_id), e.deposito);
  const otra = await q<{ r: boolean }>("select reservar_pedido($1, $2, 'operador') r", [e.org, pedidoId]);
  assert.equal(otra[0].r, false, "reservar otra vez no hace nada");
  assert.equal(await reservado(e.org, pedidoId), 2);
  await assert.rejects(m.facturar.prepararFactura(e.org, pedidoId, "operador"), /Primero confirmá el cobro/);

  // Uno de la tienda pagado con efectivo (por su medio, aunque se llame de otra forma).
  const t = await e.crear("Pago en el local", { datos_externos: { tienda: { medio: "efectivo" } } });
  await q("update pedido set estado_pago = 'pendiente' where id = $1", [t.pedidoId]);
  assert.equal(((await m.pedidos.pedidoCompleto(e.org, t.pedidoId)) as Record<string, unknown>).estado_pago, "a_cobrar");
});

test("«Entregado y cobrado»: un «A cobrar» preparado se cobra y se entrega en un paso", async () => {
  const e = await escenario();
  const { pedidoId } = await e.crear("Efectivo");
  await assert.rejects(m.confirmar.entregarYCobrar(e.org, pedidoId, "efectivo", "operador"), /preparado/);
  await m.pedidos.cambiarEstado(e.org, pedidoId, "preparado", "operador");
  await m.confirmar.entregarYCobrar(e.org, pedidoId, "efectivo", "operador");
  const p = await pedido(pedidoId);
  assert.equal(p.estado, "entregado");
  assert.equal(p.estado_pago, "pagado");
  assert.equal(await reservado(e.org, pedidoId), 0, "la reserva pasó a venta");
  const vendidas = await q<{ n: string }>("select sum(cantidad) n from movimiento_stock where referencia_tipo = 'pedido' and referencia_id = $1 and tipo = 'venta'", [String(pedidoId)]);
  assert.equal(Number(vendidas[0].n), 2);
  const pagos = await q<{ estado: string }>("select estado from pago where pedido_id = $1", [pedidoId]);
  assert.deepEqual(pagos.map((x) => x.estado), ["aprobado"]);
  await m.facturar.facturarPendientes(e.org, Date.now() + 30_000);
  assert.equal(await comprobantes(pedidoId), 1, "cobrado: se factura");
});
