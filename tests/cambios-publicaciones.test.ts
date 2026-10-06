// Tests del informe "Cambios en publicaciones": el trigger de meli_item que
// anota la historia (meli_item_cambio, db/mercadolibre.sql) y la consulta
// del informe (app/informes/cambios-publicaciones/lista.tsx).
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

let db: typeof import("@/db");
let lista: typeof import("@/app/informes/cambios-publicaciones/lista");
let formato: typeof import("@/app/informes/cambios-publicaciones/formato");
let tipos: typeof import("@/lib/listas/tipos");

before(async () => {
  db = await import("@/db");
  await (await import("@/lib/erp/esquema")).asegurarEsquemaErp();
  lista = await import("@/app/informes/cambios-publicaciones/lista");
  formato = await import("@/app/informes/cambios-publicaciones/formato");
  tipos = await import("@/lib/listas/tipos");
});

after(async () => {
  await db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

/** Organización con una cuenta de ML y una publicación (MLA1) vinculada a un producto. */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'ML 1', 'mercadolibre') returning id", [org]);
  const producto = await id("insert into producto (organizacion_id, sku_base, titulo) values ($1, 'SKU-CAMBIO', 'Sartén') returning id", [org]);
  const variacion = await id("select id from variacion where producto_id = $1 and es_default", [producto]);
  const pub = await id("insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo) values ($1, $2, $3, 'MLA1') returning id", [org, variacion, canal]);
  await q(`insert into meli_item (organizacion_id, canal_id, item_id, titulo, sku, precio, stock, estado, permalink, publicacion_id)
           values ($1, $2, 'MLA1', 'Sartén ML', 'SKU-CAMBIO', 19638, 10, 'active', 'https://articulo.mercadolibre.com.ar/MLA-1', $3)`, [org, canal, pub]);
  const cambios = () => q<{ campo: string; antes: string | null; despues: string | null; origen: string; datos: Record<string, unknown> }>(
    "select campo, antes, despues, origen, datos from meli_item_cambio where organizacion_id = $1 order by id", [org]);
  const actualizar = (set: string, v: unknown[] = []) => q(`update meli_item set ${set} where canal_id = $1 and item_id = 'MLA1'`, [canal, ...v]);
  return { org, canal, producto, pub, cambios, actualizar };
}

test("el alta en meli_item no anota nada", async () => {
  const e = await escenario();
  assert.equal((await e.cambios()).length, 0);
});

test("un cambio de estado anota una fila, externa si la cola no mandó nada", async () => {
  const e = await escenario();
  await e.actualizar("estado = 'paused'");
  const c = await e.cambios();
  assert.equal(c.length, 1);
  assert.deepEqual([c[0].campo, c[0].antes, c[0].despues, c[0].origen], ["estado", "active", "paused", "externo"]);
  assert.equal(c[0].datos.sku, "SKU-CAMBIO");
});

test("los mismos valores (o cambios en otras columnas) no anotan nada", async () => {
  const e = await escenario();
  await e.actualizar("estado = 'active', precio = 19638, stock = 10, titulo = 'Otro título', actualizado_ts = now()");
  assert.equal((await e.cambios()).length, 0);
});

test("un cambio de precio anota antes y después; precio y estado juntos, dos filas", async () => {
  const e = await escenario();
  await e.actualizar("precio = 19836");
  let c = await e.cambios();
  assert.equal(c.length, 1);
  assert.deepEqual([c[0].campo, Number(c[0].antes), Number(c[0].despues)], ["precio", 19638, 19836]);
  await e.actualizar("precio = 20000, estado = 'paused'");
  c = await e.cambios();
  assert.deepEqual(c.slice(1).map((x) => x.campo).sort(), ["estado", "precio"]);
});

test("si la cola de Laucen lo mandó hace poco, el origen es Laucen", async () => {
  const e = await escenario();
  const cola = await id(`insert into ml_cola (organizacion_id, canal_id, item_id, tipo, payload, estado, enviado_ts)
                         values ($1, $2, 'MLA1', 'precio', '{"precio": 21000}', 'ok', now() - interval '2 minutes') returning id`, [e.org, e.canal]);
  // Un estado viejo (hace una hora) no cuenta.
  await q(`insert into ml_cola (organizacion_id, canal_id, item_id, tipo, payload, estado, enviado_ts, creado_ts)
           values ($1, $2, 'MLA1', 'estado', '{"estado": "paused"}', 'ok', now() - interval '1 hour', now() - interval '1 hour')`, [e.org, e.canal]);
  await e.actualizar("precio = 21000, estado = 'paused'");
  const c = await e.cambios();
  const precio = c.find((x) => x.campo === "precio")!;
  const estado = c.find((x) => x.campo === "estado")!;
  assert.equal(precio.origen, "laucen");
  assert.equal(Number(precio.datos.cola_id), cola);
  assert.equal(estado.origen, "externo");
});

test("el stock se anota también", async () => {
  const e = await escenario();
  await e.actualizar("stock = 9");
  const c = await e.cambios();
  assert.deepEqual([c[0].campo, c[0].antes, c[0].despues], ["stock", "10", "9"]);
});

/** Corre la consulta del informe con estos parámetros (todas las columnas). */
async function informe(org: string, sp: Record<string, string>) {
  const ctx = { org, moneda: "ARS" as const };
  const L = lista.LISTA_CAMBIOS_PUBLICACIONES;
  const todos = await tipos.camposDe(L, ctx);
  const c = await L.consulta!(ctx, sp);
  return q<Record<string, unknown>>(
    `select ${tipos.seleccion(todos, todos, L.siempre)} from ${c.desde} where ${c.donde} order by ${tipos.ordenDe(todos, sp, c.orden)}`, c.valores);
}

test("informe: filtra por tipo (estado y precio de entrada), origen y búsqueda, y agrupa por publicación", async () => {
  const e = await escenario();
  await e.actualizar("precio = 19836");
  await e.actualizar("stock = 9");
  await e.actualizar("estado = 'paused'");
  await e.actualizar("precio = 20000");
  await q(`insert into ml_cola (organizacion_id, canal_id, item_id, tipo, payload, estado, enviado_ts)
           values ($1, $2, 'MLA1', 'estado', '{"estado": "active"}', 'ok', now())`, [e.org, e.canal]);
  await e.actualizar("estado = 'active'");

  // De entrada, "sólo si sigue en ese estado": el paso a pausada no sale (hoy está activa).
  const siguen = await informe(e.org, {});
  assert.deepEqual(siguen.map((f) => [f.campo, f.despues]).filter(([c]) => c === "estado"), [["estado", "active"]]);
  assert.equal(siguen.length, 3);
  assert.equal((await informe(e.org, { estados: "paused" })).filter((f) => f.campo === "estado").length, 0);
  assert.equal((await informe(e.org, { estados: "paused", sigue: "0" })).filter((f) => f.campo === "estado").length, 1);

  // Destildada: estado y precio de los últimos 7 días, lo más nuevo primero.
  const filas = await informe(e.org, { sigue: "0" });
  assert.equal(filas.length, 4);
  assert.deepEqual(filas.map((f) => f.campo), ["estado", "precio", "estado", "precio"]);
  assert.equal(filas[0].origen, "laucen");
  assert.equal(filas[0].producto_id, e.producto);
  assert.equal(filas[0].sku, "SKU-CAMBIO");
  assert.equal(filas[0].permalink, "https://articulo.mercadolibre.com.ar/MLA-1");
  assert.equal(Number(filas[3].pct), 1);

  assert.equal((await informe(e.org, { tipos: "stock" })).length, 1);
  assert.equal((await informe(e.org, { tipos: "estado,precio,stock", sigue: "0" })).length, 5);
  assert.equal((await informe(e.org, { tipos: "ninguno" })).length, 0);
  assert.equal((await informe(e.org, { externos: "1", sigue: "0" })).length, 3);
  assert.equal((await informe(e.org, { q: "SKU-CAM", sigue: "0" })).length, 4);
  assert.equal((await informe(e.org, { q: "MLA1", sigue: "0" })).length, 4);
  assert.equal((await informe(e.org, { q: "nada" })).length, 0);
  // Fechas de otro rango: nada.
  assert.equal((await informe(e.org, { desde: "2020-01-01", hasta: "2020-01-31" })).length, 0);

  // Agrupado: una fila por publicación y tipo, del primer antes al último después.
  const g = await informe(e.org, { agrupar: "1", orden: "campo" });
  assert.equal(g.length, 2);
  const est = g.find((f) => f.campo === "estado")!;
  const pre = g.find((f) => f.campo === "precio")!;
  assert.deepEqual([est.antes, est.despues, est.cambios, est.origen], ["active", "active", 2, "mixto"]);
  assert.deepEqual([Number(pre.antes), Number(pre.despues), pre.cambios, pre.origen], [19638, 20000, 2, "externo"]);
});

test("informe: cómo se cuenta cada cambio", () => {
  assert.equal(formato.describirCambioMl("estado", "active", "paused"), "Activa → Pausada");
  assert.equal(formato.describirCambioMl("estado", "under_review", "closed"), "En revisión → Cerrada");
  assert.equal(formato.describirCambioMl("precio", "19638.00", "19836.00"), "$ 19.638 → $ 19.836 (+1,0 %)");
  assert.equal(formato.describirCambioMl("stock", "10", "9"), "10 → 9");
  const f = lista.filtrosCambios({}, "2026-10-03");
  assert.deepEqual([f.desde, f.hasta, f.tipos], ["2026-09-27", "2026-10-03", ["estado", "precio"]]);
});
