// Tablero de Mercado Libre: las métricas de cada cuenta salen de lo guardado
// y usan las mismas condiciones que las pantallas a las que enlazan; la
// reputación se normaliza de lo que contesta ML; las alertas del catálogo
// (con stock y sin publicación activa; de la web sin fotos).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("TEST_DATABASE_URL no está cargada: no corren los tests de la base.");
  process.exit(0);
}
process.env.DATABASE_URL = url;

type Mods = { db: typeof import("@/db"); esquema: typeof import("@/lib/erp/esquema"); t: typeof import("@/lib/mercadolibre/tablero"); r: typeof import("@/lib/mercadolibre/reputacion") };
let m: Mods;
before(async () => {
  m = { db: await import("@/db"), esquema: await import("@/lib/erp/esquema"), t: await import("@/lib/mercadolibre/tablero"), r: await import("@/lib/mercadolibre/reputacion") };
  await m.esquema.asegurarEsquemaErp();
});
after(async () => { await m.db.pool.end(); });

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

test("normalizarReputacion: color, MercadoLíder, métricas con su período y calificaciones", () => {
  const r = m.r.normalizarReputacion({
    level_id: "5_green", power_seller_status: "gold",
    transactions: { total: 120, completed: 110, canceled: 10, period: "historic", ratings: { positive: 0.95, neutral: 0.03, negative: 0.02 } },
    metrics: { sales: { period: "60 days", completed: 40 }, claims: { period: "60 days", rate: 0.0125, value: 3 },
      delayed_handling_time: { period: "60 days", rate: 0.05, value: 2 }, cancellations: { period: "60 days", rate: 0, value: 0 } },
  });
  assert.equal(r.nivel, "5_green");
  assert.equal(r.lider, "gold");
  assert.deepEqual(r.reclamos, { valor: 3, tasa: 0.0125, periodo: "60 days" });
  assert.deepEqual(r.demoras, { valor: 2, tasa: 0.05, periodo: "60 days" });
  assert.equal(r.calificaciones?.positivas, 0.95);
  assert.equal(r.ventas?.completadas, 40);
  assert.equal(m.r.nivelDe("3_yellow")?.color, "#FFE600");
  // Una cuenta nueva no trae nada.
  const nueva = m.r.normalizarReputacion({ level_id: null, power_seller_status: null });
  assert.equal(nueva.nivel, null);
  assert.equal(nueva.reclamos, null);
  assert.equal(m.r.normalizarReputacion(undefined).lider, null);
});

async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const canal = async (nombre: string) => {
    const c = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, $2, 'mercadolibre') returning id", [org, nombre]);
    await q(`insert into meli_cuenta (organizacion_id, canal_id, meli_user_id, nickname, access_token, refresh_token, expira_el)
             values ($1, $2, $3, $4, 'x', 'x', now() + interval '1 day')`, [org, c, Math.floor(Math.random() * 1e9), `nick_${nombre}`]);
    return c;
  };
  return { org, a: await canal("Cuenta A"), b: await canal("Cuenta B") };
}

test("métricas por cuenta: publicaciones, envíos, preguntas, mensajes, reclamos y devoluciones", async () => {
  const e = await escenario();
  const item = (canal: number, itemId: string, estado: string, vinculada = false) =>
    q(`insert into meli_item (organizacion_id, canal_id, item_id, titulo, estado) values ($1, $2, $3, 'x', $4)`, [e.org, canal, itemId, estado]);
  await item(e.a, "MLA1", "active"); await item(e.a, "MLA2", "active"); await item(e.a, "MLA3", "paused");
  await item(e.a, "MLA4", "under_review"); await item(e.a, "MLA5", "inactive"); await item(e.b, "MLB1", "active");
  // Envíos de A: 2 por despachar (1 con etiqueta impresa), 1 en camino, 1 entregado; uno de Full no cuenta.
  const envio = (canal: number, estado: string, impresa: boolean, logistica = "cross_docking") =>
    q(`insert into envio (organizacion_id, canal_id, id_externo, estado, logistica, etiqueta_impresa_ts) values ($1, $2, $3, $4, $5, $6)`,
      [e.org, canal, randomUUID(), estado, logistica, impresa ? new Date() : null]);
  await envio(e.a, "ready_to_ship", false); await envio(e.a, "handling", true); await envio(e.a, "shipped", true);
  await envio(e.a, "delivered", true); await envio(e.a, "ready_to_ship", false, "fulfillment");
  // Preguntas y mensajes.
  const preg = (canal: number, estado: string) => q(`insert into meli_pregunta (id, organizacion_id, canal_id, item_id, texto, estado, fecha)
    values ($1, $2, $3, 'MLA1', 'hola', $4, now())`, [Math.floor(Math.random() * 1e12), e.org, canal, estado]);
  await preg(e.a, "UNANSWERED"); await preg(e.a, "UNANSWERED"); await preg(e.a, "ANSWERED"); await preg(e.b, "UNANSWERED");
  await q("insert into meli_conversacion (organizacion_id, canal_id, pack_id, sin_leer) values ($1, $2, 'p1', 2), ($1, $2, 'p2', 0)", [e.org, e.a]);
  // Reclamos: uno abierto que espera respuesta y vence en 2 h, una devolución en camino, uno resuelto.
  const reclamo = (canal: number, tipo: string, estado: string, extra: Record<string, unknown> = {}) =>
    q(`insert into reclamo (organizacion_id, canal_id, origen, id_externo, tipo, estado, espera_respuesta, vence_ts, devolucion_estado, etapa)
       values ($1, $2, 'mercadolibre', $3, $4, $5, $6, $7, $8, $9)`,
      [e.org, canal, randomUUID(), tipo, estado, extra.espera ?? false, extra.vence ?? null, extra.dev ?? null, extra.etapa ?? null]);
  await reclamo(e.a, "reclamo", "abierto", { espera: true, vence: new Date(Date.now() + 2 * 3600_000) });
  await reclamo(e.a, "devolucion", "abierto", { dev: "shipped" });
  await reclamo(e.a, "mediacion", "abierto", { etapa: "dispute" });
  await reclamo(e.a, "devolucion", "resuelto");

  const mapa = await m.t.metricasPorCanal(e.org, [e.a, e.b]);
  const A = mapa.get(e.a)!, B = mapa.get(e.b)!;
  assert.deepEqual(A.publicaciones, { total: 5, activas: 2, pausadas: 1, conCuestiones: 2, sinProducto: 5, sinProductoActivas: 2 });
  assert.equal(B.publicaciones.activas, 1);
  assert.deepEqual(A.etiquetas, { sinImprimir: 1, porDespachar: 2, vencidos: 0 });
  assert.equal(A.enCamino, 1);
  assert.deepEqual([A.preguntas.sinResponder, A.preguntas.total, B.preguntas.sinResponder], [2, 3, 1]);
  assert.ok(A.preguntas.masVieja);
  assert.deepEqual(A.mensajes, { sinLeer: 1, total: 2 });
  assert.deepEqual(A.reclamos, { abiertos: 3, esperanRespuesta: 1, urgentes: 1, enMediacion: 1, total: 4 });
  assert.deepEqual(A.devoluciones, { abiertas: 1, enCamino: 1, total: 2 });
  assert.equal(B.reclamos.abiertos, 0);
  // El total suma las cuentas.
  const T = m.t.sumar([A, B]);
  assert.equal(T.preguntas.sinResponder, 3);
  assert.equal(T.publicaciones.activas, 3);
  assert.equal(T.reclamos.abiertos, 3);
  const cuentas = await m.t.cuentasTablero(e.org);
  assert.deepEqual(cuentas.map((c) => c.apodo), ["nick_Cuenta A", "nick_Cuenta B"]);
});

test("alertas del catálogo: con stock y sin publicación activa; de la web sin fotos", async () => {
  const e = await escenario();
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [e.org]);
  const ubic = await id("select id from ubicacion where deposito_id = $1 limit 1", [deposito]);
  const lista = await id("insert into lista_precios (organizacion_id, nombre) values ($1, 'Web') returning id", [e.org]);
  const web = await id("insert into canal (organizacion_id, nombre, tipo, lista_precios_id) values ($1, 'Web', 'web_minorista', $2) returning id", [e.org, lista]);
  const producto = async (sku: string, { stock = 0, foto = false, publicada = false, precio = true } = {}) => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo, tipo) values ($1, $2, $2, 'simple') returning id", [e.org, sku]);
    const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
    if (stock) await q("insert into stock (organizacion_id, variacion_id, ubicacion_id, cantidad) values ($1, $2, $3, $4)", [e.org, v, ubic, stock]);
    if (foto) await q("insert into producto_foto (organizacion_id, producto_id, url) values ($1, $2, 'https://x/y.jpg')", [e.org, p]);
    if (publicada) await q("insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, estado) values ($1, $2, $3, $4, 'activa')", [e.org, v, e.a, `MLA${p}`]);
    if (precio) await q("insert into precio (organizacion_id, lista_id, variacion_id, importe_ars, importe_usd, moneda_origen) values ($1, $2, $3, 100, 0.1, 'ARS')", [e.org, lista, v]);
    return p;
  };
  await producto("P1", { stock: 5 });                        // con stock, sin publicar, sin fotos, en la web
  await producto("P2", { stock: 5, foto: true, publicada: true });  // publicada, con fotos
  await producto("P3", { stock: 0, foto: true });            // sin stock: no es alerta de publicar
  await producto("P4", { stock: 3, foto: true, precio: false }); // sin publicar; con fotos
  void web;
  const a = await m.t.alertasCatalogo(e.org);
  assert.equal(a.sinPublicar, 2);   // P1 y P4
  assert.equal(a.sinFotos, 1);      // P1 (en la web, sin fotos)
  assert.equal(a.productosActivos, 4);
});
