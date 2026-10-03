// Tests de Reclamos y devoluciones: de los reclamos de Mercado Libre a las
// tablas (con reclamos de ML de mentira, como los contesta la API), el enlace
// con el pedido por orden o carrito, el orden de la lista por vencimiento,
// las acciones por la cola (con un ML de mentira) y los reclamos manuales.
// Nunca se llama a ML de verdad.
//
//   TEST_DATABASE_URL=postgresql://… npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CuentaMl } from "@/lib/mercadolibre/api";
import type { ReclamoMl } from "@/lib/mercadolibre/reclamos";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("TEST_DATABASE_URL no está cargada: no corren los tests de la base.");
  process.exit(0);
}
process.env.DATABASE_URL = url;

type Mods = {
  db: typeof import("@/db");
  esquema: typeof import("@/lib/erp/esquema");
  cola: typeof import("@/lib/mercadolibre/cola");
  rml: typeof import("@/lib/mercadolibre/reclamos");
  reclamos: typeof import("@/lib/reclamos");
  lista: typeof import("@/app/ventas/reclamos/lista");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    cola: await import("@/lib/mercadolibre/cola"),
    rml: await import("@/lib/mercadolibre/reclamos"),
    reclamos: await import("@/lib/reclamos"),
    lista: await import("@/app/ventas/reclamos/lista"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);
const enHoras = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const aleatorio = () => String(2000000000000000 + Math.floor(Math.random() * 1e12));

/** Un reclamo como lo contesta GET /post-purchase/v1/claims/{id}. */
function reclamoMl(o: { id: string; orden: string; vendedor: number; comprador: number; cerrado?: boolean; devolucion?: boolean; etapa?: string; actualizado?: string }): ReclamoMl {
  return {
    id: o.id, resource: "order", resource_id: o.orden, status: o.cerrado ? "closed" : "opened", type: "mediations",
    stage: o.etapa ?? "claim", parent_id: null, reason_id: "PDD9939", fulfilled: true, quantity_type: "total", site_id: "MLA",
    players: [
      { role: "complainant", type: "buyer", user_id: o.comprador, available_actions: [{ action: "send_message_to_respondent", mandatory: false, due_date: null }] },
      {
        role: "respondent", type: "seller", user_id: o.vendedor, available_actions: o.cerrado ? [] : [
          { action: "send_message_to_complainant", mandatory: false, due_date: enHoras(72) },
          { action: "refund", mandatory: true, due_date: enHoras(10) },
          { action: "allow_return", mandatory: true, due_date: enHoras(12) },
          { action: "open_dispute", mandatory: false, due_date: enHoras(70) },
          { action: "send_attachments", mandatory: false, due_date: null },
        ],
      },
      { role: "mediator", type: "internal", user_id: 1 },
    ],
    resolution: o.cerrado ? { reason: "payment_refunded", date_created: enHoras(-1), benefited: ["complainant"], closed_by: "mediator", applied_coverage: false } : null,
    date_created: "2026-10-01T12:00:00.000-04:00",
    last_updated: o.actualizado ?? "2026-10-02T09:30:00.000-04:00",
    related_entities: o.devolucion ? ["return"] : [],
  };
}

const MENSAJES = [
  { sender_role: "complainant", receiver_role: "respondent", message: "Hola, el producto llegó con la caja rota y no prende.", date_created: "2026-10-01T12:05:00.000-04:00",
    attachments: [{ filename: "foto.jpg", original_filename: "IMG_001.jpg", size: 120000, type: "image/jpeg" }], hash: "h-1", stage: "claim", status: "available" },
  { sender_role: "respondent", receiver_role: "complainant", message: "Hola, lamentamos lo ocurrido. ¿Nos mandás una foto del equipo?", date_created: "2026-10-01T13:00:00.000-04:00",
    attachments: [], stage: "claim", status: "available" },
];
const DEVOLUCION = {
  id: 9876543, claim_id: 0, status: "shipped", subtype: "return_partial", status_money: "retained", refund_at: "delivered",
  shipments: [{ shipment_id: 4455667788, status: "shipped", tracking_number: "MEL4455667788ARG", type: "return", destination: { name: "seller_address" } }],
  orders: [{ order_id: "0", item_id: "MLA123", variation_id: null, return_quantity: 1, total_quantity: 1 }],
  date_created: "2026-10-02T10:00:00.000-04:00", last_updated: "2026-10-02T15:00:00.000-04:00",
};

/** Un ML de mentira que contesta los GET de reclamos. */
function mlFalso(reclamos: Map<string, ReclamoMl>, extra: { cerrados?: ReclamoMl[] } = {}) {
  const pedidos: string[] = [];
  const leer = async (ruta: string) => {
    pedidos.push(ruta);
    let x: RegExpMatchArray | null;
    if (ruta.startsWith("/post-purchase/v1/claims/search")) {
      const abiertos = ruta.includes("status=opened");
      const data = abiertos ? [...reclamos.values()].filter((c) => c.status === "opened") : extra.cerrados ?? [];
      return { status: 200, datos: { paging: { total: data.length, offset: 0, limit: 50 }, data } };
    }
    if ((x = ruta.match(/^\/post-purchase\/v1\/claims\/reasons\/(\w+)$/))) return { status: 200, datos: { id: x[1], name: "Producto defectuoso", detail: "El producto tiene fallas o está roto" } };
    if ((x = ruta.match(/^\/post-purchase\/v1\/claims\/(\d+)$/))) {
      const c = reclamos.get(x[1]) ?? extra.cerrados?.find((y) => String(y.id) === x![1]);
      return c ? { status: 200, datos: c } : { status: 404, datos: { message: "not found" } };
    }
    if (/\/messages$/.test(ruta)) return { status: 200, datos: MENSAJES };
    if (/\/expected-resolutions$/.test(ruta)) return { status: 200, datos: [{ player_role: "complainant", expected_resolution: "refund", status: "pending", date_created: "2026-10-01T12:00:00.000-04:00" }] };
    if (/\/v2\/claims\/\d+\/returns$/.test(ruta)) return { status: 200, datos: DEVOLUCION };
    return { status: 404, datos: { message: "ruta no esperada" } };
  };
  return { leer, pedidos };
}

/** Organización con un canal de ML (cuenta de mentira), un cliente comprador y
 *  un carrito (pack) con dos órdenes; más un canal web con un pedido. */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'ML 1', 'mercadolibre') returning id", [org]);
  const web = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Web', 'web_minorista') returning id", [org]);
  const vendedor = Math.floor(Math.random() * 1e9);
  const comprador = Math.floor(Math.random() * 1e9);
  const cuentaId = await id(`insert into meli_cuenta (organizacion_id, canal_id, meli_user_id, nickname, access_token, refresh_token, expira_el)
           values ($1, $2, $3, 'prueba', 'x', 'x', now() + interval '1 day') returning id`, [org, canal, vendedor]);
  const cuenta: CuentaMl = { id: cuentaId, organizacionId: org, canalId: canal, meliUserId: vendedor, nickname: "prueba", estado: "activa" };
  const cliente = await id("insert into cliente (organizacion_id, nombre) values ($1, 'Juana Compradora') returning id", [org]);
  await q("insert into cliente_identidad (organizacion_id, cliente_id, canal_id, id_externo) values ($1, $2, $3, $4)", [org, cliente, canal, String(comprador)]);
  // El carrito: id_externo = pack, dos órdenes (una línea cada una).
  const pack = aleatorio(), orden1 = aleatorio(), orden2 = aleatorio();
  const pedido = await id(`insert into pedido (organizacion_id, canal_id, cliente_id, id_externo, estado, total_ars, envio, deposito_id)
                           values ($1, $2, $3, $4, 'entregado', 3500, $5::jsonb, $6) returning id`, [org, canal, cliente, pack, JSON.stringify({ pack_id: pack }), deposito]);
  for (const [orden, titulo, precio] of [[orden1, "Auriculares", 2000], [orden2, "Funda", 1500]] as const) {
    await q(`insert into pedido_linea (organizacion_id, pedido_id, cantidad, precio_unit_ars, precio_unit_usd, titulo, datos_externos)
             values ($1, $2, 1, $3, 0, $4, $5::jsonb)`, [org, pedido, precio, titulo, JSON.stringify({ ml: { order_id: orden } })]);
  }
  // Una orden suelta (id_externo = la orden).
  const ordenSuelta = aleatorio();
  const pedidoSuelto = await id("insert into pedido (organizacion_id, canal_id, id_externo, estado, total_ars) values ($1, $2, $3, 'entregado', 900) returning id", [org, canal, ordenSuelta]);
  const pedidoWeb = await id("insert into pedido (organizacion_id, canal_id, cliente_id, estado, total_ars) values ($1, $2, $3, 'entregado', 5000) returning id", [org, web, cliente]);
  return { org, canal, web, cuenta, vendedor, comprador, cliente, pack, orden1, orden2, pedido, ordenSuelta, pedidoSuelto, pedidoWeb, deposito };
}

test("mapearReclamo: abierto, vence con la obligatoria más próxima, motivo por prefijo", () => {
  const c = reclamoMl({ id: "1", orden: "2", vendedor: 10, comprador: 20 });
  const f = m.rml.mapearReclamo(c, 10);
  assert.equal(f.estado, "abierto");
  assert.equal(f.tipo, "reclamo");
  assert.equal(f.etapa, "claim");
  assert.equal(f.orden_externa, "2");
  assert.equal(f.comprador_externo, "20");
  assert.equal(f.espera_respuesta, true);
  assert.equal(f.vence_ts, (c.players[1].available_actions as { due_date: string }[])[1].due_date);
  assert.equal(f.motivo, "Producto distinto o con fallas");
  assert.equal(f.acciones_disponibles.length, 5);
  // Cerrado: sin acciones, con la resolución en criollo.
  const g = m.rml.mapearReclamo(reclamoMl({ id: "1", orden: "2", vendedor: 10, comprador: 20, cerrado: true }), 10);
  assert.equal(g.estado, "resuelto");
  assert.equal(g.espera_respuesta, false);
  assert.deepEqual(g.acciones_disponibles, []);
  assert.equal(g.resolucion, "Se devolvió el dinero (a favor del comprador)");
  // Mediación y devolución.
  assert.equal(m.rml.mapearReclamo(reclamoMl({ id: "1", orden: "2", vendedor: 10, comprador: 20, etapa: "dispute" }), 10).tipo, "mediacion");
  const d = m.rml.mapearReclamo(reclamoMl({ id: "1", orden: "2", vendedor: 10, comprador: 20, devolucion: true }), 10, { devolucion: DEVOLUCION });
  assert.equal(d.tipo, "devolucion");
  assert.equal(d.devolucion_envio_estado, "shipped");
  assert.equal(d.devolucion_tracking, "MEL4455667788ARG");
  assert.equal(m.rml.claimDeRecurso("/post-purchase/v1/claims/5146594810/actions-history"), "5146594810");
  assert.equal(m.rml.claimDeRecurso("/post-purchase/v1/claims/5146594810"), "5146594810");
});

test("importarReclamo: guarda reclamo, mensajes y devolución; enlaza el pedido del carrito por la orden y el comprador", async () => {
  const e = await escenario();
  const claim = aleatorio();
  const c = reclamoMl({ id: claim, orden: e.orden2, vendedor: e.vendedor, comprador: e.comprador, devolucion: true });
  const falso = mlFalso(new Map([[claim, c]]));
  const rid = await m.rml.importarReclamo(e.cuenta, claim, falso.leer);
  const [r] = await q<Record<string, unknown>>("select * from reclamo where id = $1", [rid]);
  assert.equal(Number(r.pedido_id), e.pedido);
  assert.equal(Number(r.cliente_id), e.cliente);
  assert.equal(r.origen, "mercadolibre");
  assert.equal(r.tipo, "devolucion");
  assert.equal(r.estado, "abierto");
  assert.equal(r.motivo, "El producto tiene fallas o está roto");
  assert.equal(Number(r.monto), 1500); // sólo la línea de esa orden del carrito
  assert.equal(r.devolucion_envio_estado, "shipped");
  assert.equal(r.espera_respuesta, true);
  assert.ok(r.vence_ts);
  const mens = await q<{ de: string; texto: string; adjuntos: unknown[] }>("select de, texto, adjuntos from reclamo_mensaje where reclamo_id = $1 order by fecha", [rid]);
  assert.deepEqual(mens.map((x) => x.de), ["comprador", "vendedor"]);
  assert.equal(mens[0].adjuntos.length, 1);
  // Otra vez: no duplica, y el motivo ya no se vuelve a pedir.
  const antes = falso.pedidos.length;
  assert.equal(await m.rml.importarReclamo(e.cuenta, claim, falso.leer), rid);
  assert.equal((await q("select 1 from reclamo_mensaje where reclamo_id = $1", [rid])).length, 2);
  assert.ok(!falso.pedidos.slice(antes).some((p) => p.includes("/reasons/")));
  // Se cierra en ML: queda resuelto, con su evento.
  falso.leer; // mismo ML, reclamo cambiado
  const cerrado = mlFalso(new Map([[claim, reclamoMl({ id: claim, orden: e.orden2, vendedor: e.vendedor, comprador: e.comprador, cerrado: true, actualizado: "2026-10-03T10:00:00.000-04:00" })]]));
  await m.rml.importarReclamo(e.cuenta, claim, cerrado.leer);
  const [r2] = await q<{ estado: string; resolucion: string; acciones_disponibles: unknown[] }>("select estado, resolucion, acciones_disponibles from reclamo where id = $1", [rid]);
  assert.equal(r2.estado, "resuelto");
  assert.deepEqual(r2.acciones_disponibles, []);
  const ev = await q<{ tipo: string }>("select tipo from reclamo_evento where reclamo_id = $1 order by id", [rid]);
  assert.deepEqual(ev.map((x) => x.tipo), ["alta", "estado"]);
});

test("pedidoDeOrden: por orden suelta, por línea de un carrito y por pack", async () => {
  const e = await escenario();
  assert.equal(await m.rml.pedidoDeOrden(e.org, e.canal, e.ordenSuelta), e.pedidoSuelto);
  assert.equal(await m.rml.pedidoDeOrden(e.org, e.canal, e.orden1), e.pedido);
  assert.equal(await m.rml.pedidoDeOrden(e.org, e.canal, "999", e.pack), e.pedido);
  assert.equal(await m.rml.pedidoDeOrden(e.org, e.canal, "999"), null);
});

test("barrido: trae los abiertos y los cerrados nuevos; la segunda vez no vuelve a traer lo que no cambió", async () => {
  const e = await escenario();
  const a = aleatorio(), b = aleatorio();
  const falso = mlFalso(new Map([[a, reclamoMl({ id: a, orden: e.ordenSuelta, vendedor: e.vendedor, comprador: e.comprador })]]),
    { cerrados: [reclamoMl({ id: b, orden: e.orden1, vendedor: e.vendedor, comprador: e.comprador, cerrado: true })] });
  const r1 = await m.rml.barrerReclamos(e.cuenta, Date.now() + 20_000, falso.leer);
  assert.equal(r1.importados, 2);
  const r2 = await m.rml.barrerReclamos(e.cuenta, Date.now() + 20_000, falso.leer);
  assert.equal(r2.importados, 0);
});

test("lista: Abiertos ordena primero los que esperan respuesta, por vencimiento; pestañas por etapa y devolución", async () => {
  const e = await escenario();
  const alta = async (o: { espera: boolean; vence: number | null; etapa?: string; dev?: string; estado?: string }) => id(`
    insert into reclamo (organizacion_id, canal_id, origen, id_externo, tipo, motivo, estado, etapa, espera_respuesta, vence_ts, devolucion_estado)
    values ($1, $2, 'mercadolibre', $3, 'reclamo', 'x', $4, $5, $6, $7, $8) returning id`,
    [e.org, e.canal, aleatorio(), o.estado ?? "abierto", o.etapa ?? "claim", o.espera, o.vence == null ? null : enHoras(o.vence), o.dev ?? null]);
  const sinEspera = await alta({ espera: false, vence: 1 });
  const vence30 = await alta({ espera: true, vence: 30 });
  const vence5 = await alta({ espera: true, vence: 5 });
  const mediacion = await alta({ espera: true, vence: 2, etapa: "dispute" });
  const camino = await alta({ espera: false, vence: null, dev: "shipped" });
  const cerrado = await alta({ espera: false, vence: null, estado: "resuelto" });
  const filas = async (ver: string) => {
    const c = await m.lista.LISTA_RECLAMOS.consulta!({ org: e.org, moneda: "ARS" }, { ver });
    return (await q<{ id: string }>(`select r.id from ${c.desde} where ${c.donde} order by ${c.orden}`, c.valores)).map((x) => Number(x.id));
  };
  assert.deepEqual(await filas("abiertos"), [vence5, vence30, sinEspera]);
  assert.deepEqual(await filas("mediacion"), [mediacion]);
  assert.deepEqual(await filas("camino"), [camino]);
  assert.deepEqual(await filas("cerrados"), [cerrado]);
  const resumen = await m.reclamos.resumenReclamos(e.org);
  assert.equal(resumen.urgentes, 2); // vence5 y la mediación (< 24 h)
});

test("acciones: el botón encola en ml_cola (tipo reclamo), no se duplica, y el trabajador lo manda a la ruta de ML", async () => {
  const e = await escenario();
  const claim = aleatorio();
  const falso = mlFalso(new Map([[claim, reclamoMl({ id: claim, orden: e.ordenSuelta, vendedor: e.vendedor, comprador: e.comprador })]]));
  const rid = await m.rml.importarReclamo(e.cuenta, claim, falso.leer);
  // Una acción que ML no ofrece, no.
  await assert.rejects(m.rml.encolarAccionReclamo(e.org, rid, "partial_refund", { porcentaje: 20 }, null), /no ofrece/);
  // Una que se ofrece pero no se hace desde Laucen, tampoco.
  await assert.rejects(m.rml.encolarAccionReclamo(e.org, rid, "send_attachments", {}, null), /todavía no se puede/);
  await assert.rejects(m.rml.encolarAccionReclamo(e.org, rid, "send_message_to_complainant", { mensaje: "  " }, null), /Escribí el mensaje/);
  await m.rml.encolarAccionReclamo(e.org, rid, "send_message_to_complainant", { mensaje: "Hola, ya te mandamos uno nuevo." }, "u1");
  await assert.rejects(m.rml.encolarAccionReclamo(e.org, rid, "send_message_to_complainant", { mensaje: "Hola, ya te mandamos uno nuevo." }, "u1"), /ya está en la cola/);
  await m.rml.encolarAccionReclamo(e.org, rid, "refund", {}, "u1");
  // Devolver la plata se hace una vez: el botón se saca hasta volver a leer el reclamo.
  await assert.rejects(m.rml.encolarAccionReclamo(e.org, rid, "refund", {}, "u1"), /no ofrece/);
  const cola = await q<{ tipo: string; item_id: string; estado: string; origen: string; payload: { pedidos: { metodo: string; ruta: string; cuerpo: unknown }[] } }>(
    "select tipo, item_id, estado, origen, payload from ml_cola where organizacion_id = $1 order by id", [e.org]);
  assert.equal(cola.length, 2);
  assert.ok(cola.every((c) => c.tipo === "reclamo" && c.item_id === `reclamo:${claim}` && c.estado === "pendiente" && c.origen === "boton"));
  assert.deepEqual(cola[0].payload.pedidos, [{ metodo: "POST", ruta: `/post-purchase/v1/claims/${claim}/actions/send-message`, cuerpo: { receiver_role: "complainant", message: "Hola, ya te mandamos uno nuevo." } }]);
  assert.deepEqual(cola[1].payload.pedidos, [{ metodo: "POST", ruta: `/post-purchase/v1/claims/${claim}/expected-resolutions/refund`, cuerpo: {} }]);

  const mandados: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
  const r = await m.cola.procesarCola(Date.now() + 20_000, {
    enviar: async (_c, metodo, ruta, cuerpo) => { mandados.push({ metodo, ruta, cuerpo }); return ruta.endsWith("/refund") ? { status: 400, datos: { message: "action not allowed" } } : { status: 200, datos: {} }; },
    ritmoMs: 0, org: e.org,
  });
  assert.equal(r.ok, 1);
  assert.equal(r.errores, 1);
  assert.equal(mandados.length, 2);
  const ev = await q<{ tipo: string; detalle: string }>("select tipo, detalle from reclamo_evento where reclamo_id = $1 order by id", [rid]);
  assert.ok(ev.some((x) => x.tipo === "accion_ok" && /Mensaje al comprador/.test(x.detalle)));
  assert.ok(ev.some((x) => x.tipo === "accion_error" && /Devolver el dinero/.test(x.detalle)));
  const [rr] = await q<{ ml_actualizado: string | null }>("select ml_actualizado from reclamo where id = $1", [rid]);
  assert.equal(rr.ml_actualizado, null); // se vuelve a leer en el próximo barrido
});

test("reclamo manual: alta con pedido web, estados, reembolso, nota y recibir devolución (una sola recepción)", async () => {
  const e = await escenario();
  await assert.rejects(m.reclamos.crearReclamoManual(e.org, { pedidoId: e.pedido, motivo: "x" }, null), /entran solos/);
  await assert.rejects(m.reclamos.crearReclamoManual(e.org, { pedidoId: e.pedidoWeb, motivo: " " }, null), /motivo/);
  const rid = await m.reclamos.crearReclamoManual(e.org, { pedidoId: e.pedidoWeb, motivo: "Llegó roto", tipo: "devolucion" }, "u1");
  const [r] = await q<{ origen: string; cliente_id: string; monto: string; estado: string; canal_id: string }>("select origen, cliente_id, monto, estado, canal_id from reclamo where id = $1", [rid]);
  assert.equal(r.origen, "web");
  assert.equal(Number(r.cliente_id), e.cliente);
  assert.equal(Number(r.monto), 5000);
  assert.equal(r.estado, "abierto");
  await m.reclamos.cambiarEstadoReclamo(e.org, rid, "en_proceso", "u1");
  await m.reclamos.registrarReembolso(e.org, rid, 1200.5, "u1");
  await m.reclamos.anotarNota(e.org, rid, "Le cambiamos el producto en el local", "u1");
  const rec = await m.reclamos.recibirDevolucion(e.org, rid, "u1");
  assert.equal(await m.reclamos.recibirDevolucion(e.org, rid, "u1"), rec);
  const [rc] = await q<{ tipo: string; pedido_id: string; estado: string }>("select tipo, pedido_id, estado from recepcion where id = $1", [rec]);
  assert.equal(rc.tipo, "devolucion");
  assert.equal(Number(rc.pedido_id), e.pedidoWeb);
  assert.equal(rc.estado, "abierta");
  await m.reclamos.cambiarEstadoReclamo(e.org, rid, "resuelto", "u1");
  const [fin] = await q<{ estado: string; reembolso_ars: string; recepcion_id: string }>("select estado, reembolso_ars, recepcion_id from reclamo where id = $1", [rid]);
  assert.equal(fin.estado, "resuelto");
  assert.equal(Number(fin.reembolso_ars), 1200.5);
  assert.equal(Number(fin.recepcion_id), rec);
  assert.equal((await q("select 1 from reclamo_mensaje where reclamo_id = $1 and de = 'interno'", [rid])).length, 1);
  const ev = await q<{ tipo: string }>("select tipo from reclamo_evento where reclamo_id = $1 order by id", [rid]);
  assert.deepEqual(ev.map((x) => x.tipo), ["alta", "estado", "reembolso", "recepcion", "estado"]);
  // A un reclamo de ML no se le cambia el estado a mano.
  const claim = aleatorio();
  const ml = await m.rml.importarReclamo(e.cuenta, claim, mlFalso(new Map([[claim, reclamoMl({ id: claim, orden: e.ordenSuelta, vendedor: e.vendedor, comprador: e.comprador })]])).leer);
  await assert.rejects(m.reclamos.cambiarEstadoReclamo(e.org, ml, "resuelto", null), /botones de ML/);
});
