// Tests de la cola de salida a Mercado Libre (lib/mercadolibre/cola.ts):
// reemplazo de pendientes, orden por prioridad, lote preparado → enviado,
// reintentos y la barrida nocturna. Nunca se llama a la API de ML de verdad:
// el trabajador y la barrida reciben un `enviar`/`leer` de mentira.
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
  cola: typeof import("@/lib/mercadolibre/cola");
  sync: typeof import("@/lib/mercadolibre/stock");
  barrida: typeof import("@/lib/mercadolibre/barrida");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    stock: await import("@/lib/stock"),
    cola: await import("@/lib/mercadolibre/cola"),
    sync: await import("@/lib/mercadolibre/stock"),
    barrida: await import("@/lib/mercadolibre/barrida"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

/** Organización con un canal de ML (sincronizando), su cuenta (llaves de
 *  mentira: nunca se usan) y un depósito. */
async function escenario({ sincroniza = true } = {}) {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [deposito]);
  const canal = await id(`insert into canal (organizacion_id, nombre, tipo, config) values ($1, 'ML 1', 'mercadolibre', $2::jsonb) returning id`,
    [org, JSON.stringify({ sincronizar_stock: sincroniza })]);
  await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, canal, deposito]);
  const meliUser = Math.floor(Math.random() * 1e9);
  await q(`insert into meli_cuenta (organizacion_id, canal_id, meli_user_id, nickname, access_token, refresh_token, expira_el)
           values ($1, $2, $3, 'prueba', 'x', 'x', now() + interval '1 day')`, [org, canal, meliUser]);
  const publicacion = async (sku: string, item: string, opts: { variacion?: string; estado?: string; cantidad?: number | null; pausadaPorStock?: boolean } = {}) => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo) values ($1, $2, $3) returning id", [org, sku, `Producto ${sku}`]);
    const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
    const pub = await id(`insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, variacion_externa, estado, cantidad_publicada, pausada_por_stock)
      values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [org, v, canal, item, opts.variacion ?? null, opts.estado ?? "activa", opts.cantidad ?? null, opts.pausadaPorStock ?? false]);
    return { v, pub };
  };
  const ingreso = (v: number, cantidad: number) => m.stock.moverStock(org, { variacionId: v, tipo: "ingreso", cantidad, destinoId: general });
  return { org, canal, meliUser, publicacion, ingreso };
}

type Llamada = { ruta: string; metodo: string; cuerpo: unknown };
function falsoMl(respuestas: (l: Llamada) => number = () => 200) {
  const llamadas: Llamada[] = [];
  const enviar = async (_c: unknown, metodo: string, ruta: string, cuerpo?: unknown) => {
    const l = { metodo, ruta, cuerpo };
    llamadas.push(l);
    const status = respuestas(l);
    return { status, datos: status === 200 ? { id: ruta.split("/").pop(), status: "ok" } : { message: "falló", cause: [{ message: "detalle" }] } };
  };
  return { llamadas, enviar };
}

const filas = (org: string) => q<{ id: string; item_id: string; tipo: string; estado: string; payload: Record<string, unknown>; prioridad: number; reemplazos: number; intentos: number; ultimo_error: string | null }>(
  "select id, item_id, tipo, estado, payload, prioridad, reemplazos, intentos, ultimo_error from ml_cola where organizacion_id = $1 order by id", [org]);

test("encolar: una pendiente nueva de la misma publicación y tipo reemplaza a la vieja; una igual no se repite", async () => {
  const e = await escenario();
  const base = { canalId: e.canal, itemId: "MLA1", tipo: "stock" as const };
  let r = await m.cola.encolar(e.org, [{ ...base, payload: { cantidad: 5 } }], { origen: "automatico" });
  assert.deepEqual(r, { encoladas: 1, reemplazadas: 0, sinCambios: 0 });
  r = await m.cola.encolar(e.org, [{ ...base, payload: { cantidad: 5 } }], { origen: "automatico" });
  assert.deepEqual(r, { encoladas: 0, reemplazadas: 0, sinCambios: 1 });
  r = await m.cola.encolar(e.org, [{ ...base, payload: { cantidad: 3 } }, { ...base, itemId: "MLA2", payload: { cantidad: 1 } }], { origen: "automatico" });
  assert.deepEqual(r, { encoladas: 1, reemplazadas: 1, sinCambios: 0 });
  // En una misma tanda gana el último.
  await m.cola.encolar(e.org, [{ ...base, payload: { cantidad: 8 } }, { ...base, payload: { cantidad: 9 } }], { origen: "automatico" });
  const f = await filas(e.org);
  assert.equal(f.length, 2);
  const mla1 = f.find((x) => x.item_id === "MLA1")!;
  assert.deepEqual(mla1.payload, { cantidad: 9 });
  assert.equal(mla1.reemplazos, 2);
  // Otro tipo de la misma publicación es otra fila.
  await m.cola.encolar(e.org, [{ ...base, tipo: "precio", payload: { precio: 100 } }], { origen: "automatico" });
  assert.equal((await filas(e.org)).length, 3);
});

test("procesarCola: manda primero las pausas (prioridad) y después por antigüedad; graba el efecto en Laucen", async () => {
  const e = await escenario();
  const a = await e.publicacion("A", "MLA10", { cantidad: 5 });
  await m.cola.encolar(e.org, [
    { canalId: e.canal, itemId: "MLA11", tipo: "stock", payload: { cantidad: 4 } },
    { canalId: e.canal, itemId: "MLA12", tipo: "stock", payload: { cantidad: 2 } },
  ], { origen: "automatico" });
  await m.cola.encolar(e.org, [{
    canalId: e.canal, itemId: "MLA10", publicacionId: a.pub, tipo: "stock", prioridad: m.cola.PRIORIDAD.pausa,
    payload: { estado: "paused" }, efecto: { publicacion: { id: a.pub, estado: "pausada", pausada_por_stock: true } },
  }], { origen: "automatico" });
  const falso = falsoMl();
  const r = await m.cola.procesarCola(Date.now() + 20_000, { enviar: falso.enviar, ritmoMs: 0, org: e.org });
  assert.equal(r.ok, 3);
  assert.deepEqual(falso.llamadas.map((l) => l.ruta), ["/items/MLA10", "/items/MLA11", "/items/MLA12"]);
  assert.deepEqual(falso.llamadas[0].cuerpo, { status: "paused" });
  assert.deepEqual(falso.llamadas[1].cuerpo, { available_quantity: 4 });
  const [pub] = await q<{ estado: string; pausada_por_stock: boolean }>("select estado, pausada_por_stock from publicacion where id = $1", [a.pub]);
  assert.deepEqual(pub, { estado: "pausada", pausada_por_stock: true });
  assert.ok((await filas(e.org)).every((f) => f.estado === "ok"));
});

test("procesarCola: un 5xx se reintenta más tarde; un 400 queda con error en criollo; Reintentar errores lo vuelve a la cola", async () => {
  const e = await escenario();
  await m.cola.encolar(e.org, [
    { canalId: e.canal, itemId: "MLA20", tipo: "stock", payload: { cantidad: 1 } },
    { canalId: e.canal, itemId: "MLA21", tipo: "stock", payload: { cantidad: 1 } },
  ], { origen: "automatico" });
  const falso = falsoMl((l) => (l.ruta.endsWith("MLA20") ? 503 : 400));
  await m.cola.procesarCola(Date.now() + 20_000, { enviar: falso.enviar, ritmoMs: 0, org: e.org });
  let f = await filas(e.org);
  const a = f.find((x) => x.item_id === "MLA20")!, b = f.find((x) => x.item_id === "MLA21")!;
  assert.equal(a.estado, "pendiente");
  assert.equal(a.intentos, 1);
  assert.match(a.ultimo_error!, /se reintenta solo/);
  assert.equal(b.estado, "error");
  assert.match(b.ultimo_error!, /no lo aceptó \(400\): falló · detalle/);
  // El reintento no sale antes de su hora.
  const otra = falsoMl();
  await m.cola.procesarCola(Date.now() + 5_000, { enviar: otra.enviar, ritmoMs: 0, org: e.org });
  assert.equal(otra.llamadas.length, 0);
  assert.equal(await m.cola.reintentarErrores(e.org, e.canal), 1);
  await m.cola.procesarCola(Date.now() + 5_000, { enviar: otra.enviar, ritmoMs: 0, org: e.org });
  f = await filas(e.org);
  assert.equal(f.find((x) => x.item_id === "MLA21")!.estado, "ok");
});

test("lote con botón: queda preparado (no sale) hasta mandarLote; después lo manda el trabajador", async () => {
  const e = await escenario();
  const lote = await m.cola.encolarLoteConBoton(e.org, e.canal, [
    { canalId: e.canal, itemId: "MLA30", tipo: "precio", payload: { precio: 1500 }, antes: { precio: 1400 } },
    { canalId: e.canal, itemId: "MLA31", tipo: "estado", payload: { estado: "paused" }, antes: { estado: "active" } },
  ], "Precios de prueba", "usuario-1");
  const falso = falsoMl();
  await m.cola.procesarCola(Date.now() + 5_000, { enviar: falso.enviar, ritmoMs: 0, org: e.org });
  assert.equal(falso.llamadas.length, 0, "un lote preparado no sale sin el clic");
  assert.ok((await filas(e.org)).every((f) => f.estado === "preparado"));
  assert.equal(await m.cola.mandarLote(e.org, lote, "usuario-1"), 2);
  await assert.rejects(m.cola.mandarLote(e.org, lote, "usuario-1"), /ya no está preparado/);
  await m.cola.procesarCola(Date.now() + 10_000, { enviar: falso.enviar, ritmoMs: 0, org: e.org });
  assert.equal(falso.llamadas.length, 2);
  assert.deepEqual(falso.llamadas.map((l) => l.cuerpo), [{ price: 1500 }, { status: "paused" }]);
  const [l] = await q<{ estado: string; enviado_por: string }>("select estado, enviado_por from ml_lote where id = $1", [lote]);
  assert.deepEqual(l, { estado: "enviado", enviado_por: "usuario-1" });
  assert.ok((await filas(e.org)).every((f) => f.estado === "ok"));
});

test("sincronizarStockMl encola (no manda): pausa al llegar al umbral, reactiva lo que pausó Laucen; con el interruptor apagado no hace nada", async () => {
  const e = await escenario();
  const sinStock = await e.publicacion("S1", "MLA40", { cantidad: 3 });
  const conStock = await e.publicacion("S2", "MLA41", { cantidad: 1 });
  const variacion = await e.publicacion("S3", "MLA42", { variacion: "777", cantidad: 2 });
  const pausada = await e.publicacion("S4", "MLA43", { estado: "pausada", pausadaPorStock: true, cantidad: 0 });
  await e.ingreso(conStock.v, 5);
  await e.ingreso(pausada.v, 4);
  const r = await m.sync.sincronizarStockMl(e.org);
  assert.equal(r.pausadas, 2);
  assert.equal(r.cantidades, 1);
  assert.equal(r.reactivadas, 1);
  assert.equal(r.encoladas, 4);
  const f = await filas(e.org);
  const de = (item: string) => f.find((x) => x.item_id === item)!;
  assert.deepEqual(de("MLA40").payload, { estado: "paused", cantidad: 0 });
  assert.equal(de("MLA40").prioridad, 100);
  assert.deepEqual(de("MLA42").payload, { cantidad: 0 });
  assert.deepEqual(de("MLA41").payload, { cantidad: 5 });
  assert.deepEqual(de("MLA43").payload, { cantidad: 4, estado: "active" });
  // Hasta que ML no lo acepta, Laucen no la da por pausada; repetir no duplica.
  const [p] = await q<{ estado: string }>("select estado from publicacion where id = $1", [sinStock.pub]);
  assert.equal(p.estado, "activa");
  await m.sync.sincronizarStockMl(e.org);
  assert.equal((await filas(e.org)).length, 4);
  // El trabajador las manda: pausas primero, la reactivación con cantidad y después estado.
  const falso = falsoMl();
  await m.cola.procesarCola(Date.now() + 20_000, { enviar: falso.enviar, ritmoMs: 0, org: e.org });
  assert.deepEqual([...new Set(falso.llamadas.slice(0, 3).map((l) => l.ruta))].sort(), ["/items/MLA40", "/items/MLA42"]);
  // La pausa va con la cantidad, la pausa primero.
  assert.deepEqual(falso.llamadas.filter((l) => l.ruta === "/items/MLA40").map((l) => l.cuerpo), [{ status: "paused" }, { available_quantity: 0 }]);
  assert.deepEqual(falso.llamadas.find((l) => l.ruta === "/items/MLA42")!.cuerpo, { variations: [{ id: 777, available_quantity: 0 }] });
  const reac = falso.llamadas.filter((l) => l.ruta === "/items/MLA43").map((l) => l.cuerpo);
  assert.deepEqual(reac, [{ available_quantity: 4 }, { status: "active" }]);
  const pubs = await q<{ id: string; estado: string; pausada_por_stock: boolean; cantidad_publicada: number }>(
    "select id, estado, pausada_por_stock, cantidad_publicada from publicacion where organizacion_id = $1 order by id", [e.org]);
  assert.deepEqual(pubs.map((x) => [x.estado, x.pausada_por_stock, x.cantidad_publicada]),
    [["pausada", true, 0], ["activa", false, 5], ["pausada", true, 0], ["activa", false, 4]]);
  // Ya está todo al día: no hay nada nuevo para encolar.
  assert.equal((await m.sync.sincronizarStockMl(e.org)).encoladas, 0);

  const apagado = await escenario({ sincroniza: false });
  await apagado.publicacion("X1", "MLA49", { cantidad: 3 });
  assert.equal((await m.sync.sincronizarStockMl(apagado.org)).revisadas, 0);
  assert.equal((await filas(apagado.org)).length, 0);
});

test("barrida nocturna: lee de ML, refresca el espejo y encola las diferencias (las pausas con prioridad)", async () => {
  const e = await escenario();
  // En Laucen la creen pausada, pero en ML alguien la reactivó y no hay stock.
  const a = await e.publicacion("B1", "MLA50", { estado: "pausada", pausadaPorStock: true, cantidad: 0 });
  const b = await e.publicacion("B2", "MLA51", { cantidad: 7 });
  await e.ingreso(b.v, 7);
  const items: Record<string, unknown> = {
    MLA50: { id: "MLA50", title: "B1", status: "active", price: 10, available_quantity: 3 },
    MLA51: { id: "MLA51", title: "B2", status: "active", price: 10, available_quantity: 2 },
  };
  const rutas: string[] = [];
  const leer = async (_c: unknown, ruta: string) => {
    rutas.push(ruta);
    if (ruta.includes("/items/search")) {
      return ruta.includes("scroll_id") ? { status: 200, datos: { results: [], scroll_id: "s1" } } : { status: 200, datos: { results: ["MLA50", "MLA51"], scroll_id: "s1" } };
    }
    const ids = new URL(`http://x${ruta}`).searchParams.get("ids")!.split(",");
    return { status: 200, datos: ids.map((i) => ({ code: 200, body: items[i] })) };
  };
  const ahora = new Date("2026-10-03T06:00:00Z"); // 3:00 en Argentina
  assert.equal(m.barrida.enVentanaBarrida(ahora), true);
  assert.equal(m.barrida.enVentanaBarrida(new Date("2026-10-03T15:00:00Z")), false);
  await m.barrida.barridaNocturna(Date.now() + 30_000, { leer, org: e.org, ahora, forzar: true });
  const [br] = await q<{ fase: string; revisadas: number; diferencias: number; encoladas: number; pausas: number }>(
    "select fase, revisadas, diferencias, encoladas, pausas from ml_barrida where canal_id = $1", [e.canal]);
  assert.deepEqual(br, { fase: "terminada", revisadas: 2, diferencias: 2, encoladas: 2, pausas: 1 });
  const f = await filas(e.org);
  assert.ok(f.every((x) => x.estado === "pendiente"));
  const pausa = f.find((x) => x.item_id === "MLA50")!;
  assert.deepEqual(pausa.payload, { estado: "paused", cantidad: 0 });
  assert.equal(pausa.prioridad, 100);
  assert.deepEqual(f.find((x) => x.item_id === "MLA51")!.payload, { cantidad: 7 });
  const [orig] = await q<{ origen: string }>("select distinct origen from ml_cola where organizacion_id = $1", [e.org]);
  assert.equal(orig.origen, "barrida");
  // La misma noche no se repite.
  const antes = rutas.length;
  await m.barrida.barridaNocturna(Date.now() + 30_000, { leer, org: e.org, ahora, forzar: true });
  assert.equal(rutas.length, antes);
  void a;
});

test("pausar por stock: la pausa y la cantidad van juntas (la pausa primero); reactivar, la cantidad primero", async () => {
  const { pedidosDe } = await import("@/lib/mercadolibre/cola");
  const { cambioDeStock } = await import("@/lib/mercadolibre/stock");
  const pub = { id: 1, canal_id: 1, variacion_id: 1, id_externo: "MLA1", variacion_externa: null, estado: "activa",
    pausada_por_stock: false, pausada_manual: false, cantidad_publicada: 3, disponible: 1, umbral: 1 };
  // Umbral 1 con 1 disponible: se pausa informando 1, en el mismo envío.
  const c = cambioDeStock(pub)!;
  assert.equal(c.que, "pausa");
  assert.deepEqual(c.payload, { estado: "paused", cantidad: 1 });
  assert.deepEqual(pedidosDe({ item_id: "MLA1", variation_id: "", tipo: "stock", payload: c.payload }).map((x) => [x.cuerpo, !!x.seguirSiFalla]),
    [[{ status: "paused" }, false], [{ available_quantity: 1 }, true]]);
  assert.deepEqual(pedidosDe({ item_id: "MLA1", variation_id: "", tipo: "stock", payload: { cantidad: 4, estado: "active" } }).map((x) => x.cuerpo),
    [{ available_quantity: 4 }, { status: "active" }]);
});

test("de 0 a algo: la cantidad y la activación van juntas", async () => {
  const { cambioDeStock } = await import("@/lib/mercadolibre/stock");
  const pub = { id: 1, canal_id: 1, variacion_id: 1, id_externo: "MLA1", variacion_externa: null, estado: "activa",
    pausada_por_stock: false, pausada_manual: false, cantidad_publicada: 0, disponible: 1, umbral: 0 };
  assert.deepEqual(cambioDeStock(pub)!.payload, { cantidad: 1, estado: "active" });
  assert.deepEqual(cambioDeStock({ ...pub, cantidad_publicada: 2 })!.payload, { cantidad: 1 });
  assert.deepEqual(cambioDeStock({ ...pub, variacion_externa: "9" })!.payload, { cantidad: 1 });
});

test("encolar: lo mismo que se está mandando o se acaba de mandar no se repite; algo distinto sí", async () => {
  const e = await escenario();
  const base = { canalId: e.canal, itemId: "MLA77", tipo: "stock" as const };
  const pausa = { estado: "paused", cantidad: 0 };
  assert.equal((await m.cola.encolar(e.org, [{ ...base, payload: pausa }], { origen: "automatico" })).encoladas, 1);
  await q("update ml_cola set estado = 'enviando' where organizacion_id = $1", [e.org]);
  // Otro aviso de stock casi junto: no se duplica.
  assert.deepEqual(await m.cola.encolar(e.org, [{ ...base, payload: pausa }], { origen: "automatico" }), { encoladas: 0, reemplazadas: 0, sinCambios: 1 });
  await q("update ml_cola set estado = 'ok', enviado_ts = now() where organizacion_id = $1", [e.org]);
  assert.equal((await m.cola.encolar(e.org, [{ ...base, payload: pausa }], { origen: "automatico" })).encoladas, 0);
  // Algo distinto sale; y lo mismo, pasados 2 minutos, también.
  assert.equal((await m.cola.encolar(e.org, [{ ...base, payload: { cantidad: 3, estado: "active" } }], { origen: "automatico" })).encoladas, 1);
  await q("delete from ml_cola where organizacion_id = $1 and estado = 'pendiente'", [e.org]);
  await q("update ml_cola set enviado_ts = now() - interval '3 minutes' where organizacion_id = $1", [e.org]);
  assert.equal((await m.cola.encolar(e.org, [{ ...base, payload: pausa }], { origen: "automatico" })).encoladas, 1);
});

test("crear encadenado: la Clásica y, sobre su producto de ML ({up}), los planes de cuotas", async () => {
  const e = await escenario();
  const lote = await m.cola.encolarLoteConBoton(e.org, e.canal, [{
    canalId: e.canal, itemId: "nueva:SKU-PLANES", tipo: "crear",
    payload: { pedidos: [
      { metodo: "POST", ruta: "/items", cuerpo: { title: "x" } },
      { metodo: "POST", ruta: "/items/{id}/description", cuerpo: { plain_text: "d" } },
      { metodo: "POST", ruta: "/user-products/{up}/items", cuerpo: { tags: ["3x_campaign"] } },
      { metodo: "POST", ruta: "/user-products/{up}/items", cuerpo: { tags: ["12x_campaign"] } },
    ] },
  }], "Planes de prueba", "usuario-1");
  await m.cola.mandarLote(e.org, lote, "usuario-1");
  let n = 0;
  const llamadas: string[] = [];
  const enviar = async (_c: unknown, metodo: string, ruta: string) => {
    llamadas.push(`${metodo} ${ruta}`);
    if (ruta === "/items") return { status: 201, datos: { id: "MLA900", user_product_id: "MLAU77" } };
    if (ruta.endsWith("/items")) return { status: 201, datos: { id: `MLA90${++n}` } };
    return { status: 200, datos: {} };
  };
  await m.cola.procesarCola(Date.now() + 10_000, { enviar, ritmoMs: 0, org: e.org });
  assert.deepEqual(llamadas, ["POST /items", "POST /items/MLA900/description", "POST /user-products/MLAU77/items", "POST /user-products/MLAU77/items"]);
  const [f] = await q<{ estado: string; respuesta: { id: string; otras: string[] } }>("select estado, respuesta from ml_cola where organizacion_id = $1", [e.org]);
  assert.equal(f.estado, "ok");
  assert.deepEqual([f.respuesta.id, f.respuesta.otras], ["MLA900", ["MLA901", "MLA902"]]);
});
