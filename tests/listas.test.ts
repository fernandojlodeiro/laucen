// Tests de las listas configurables (lib/listas): para cada lista del
// registro, la consulta del Excel con TODOS los campos del catálogo y la de
// la pantalla (con sus columnas fijas) corren contra la base sin error, con y
// sin orden por cada columna. Y lista_config guarda y lee configuraciones.
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
let tipos: typeof import("@/lib/listas/tipos");
let excel: typeof import("@/lib/listas/excel");
let registro: typeof import("@/app/listas/registro");
let config: typeof import("@/lib/listas/config");

before(async () => {
  db = await import("@/db");
  await (await import("@/lib/erp/esquema")).asegurarEsquemaErp();
  tipos = await import("@/lib/listas/tipos");
  excel = await import("@/lib/listas/excel");
  registro = await import("@/app/listas/registro");
  config = await import("@/lib/listas/config");
});

after(async () => {
  await db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

/** Una organización con un poco de todo: producto con foto y precio, cliente, pedido, proveedor, factura, despacho. */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date - 1, 1000, 'test')", [org]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const lista = await id("insert into lista_precios (organizacion_id, nombre) values ($1, 'Clásicas') returning id", [org]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo, lista_precios_id) values ($1, 'Web', 'web_minorista', $2) returning id", [org, lista]);
  await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, canal, deposito]);
  const familia = await id("insert into familia (organizacion_id, nombre) values ($1, 'Cocina') returning id", [org]);
  await q("insert into familia (organizacion_id, nombre, padre_id, ml_categoria) values ($1, 'ML', $2, 'MLA1')", [org, familia]);
  const producto = await id("insert into producto (organizacion_id, sku_base, titulo, familia_id, marca) values ($1, 'SKU1', 'Sartén', $2, 'Laucen') returning id", [org, familia]);
  const variacion = await id("select id from variacion where producto_id = $1", [producto]);
  await q("insert into producto_foto (organizacion_id, producto_id, url) values ($1, $2, 'https://x/foto.jpg')", [org, producto]);
  await q("insert into precio (organizacion_id, variacion_id, lista_id, importe_ars, importe_usd, moneda_origen) values ($1, $2, $3, 1000, 1, 'ARS')", [org, variacion, lista]);
  const cliente = await id("insert into cliente (organizacion_id, nombre) values ($1, 'Juan') returning id", [org]);
  await q(`insert into pedido (organizacion_id, canal_id, cliente_id, estado, estado_pago, total_ars, total_usd)
           values ($1, $2, $3, 'nuevo', 'pendiente', 1000, 1)`, [org, canal, cliente]);
  const proveedor = await id("insert into proveedor (organizacion_id, nombre) values ($1, 'Proveedor SA') returning id", [org]);
  await q("insert into factura_compra (organizacion_id, proveedor_id, punto_venta, numero, total, es_nota_credito) values ($1, $2, 3, 42, 1210, true)", [org, proveedor]);
  await q(`insert into comprobante (organizacion_id, ambiente, tipo_cbte, punto_venta, numero, doc_tipo, doc_nro, importe_total, importe_neto, cliente_id)
           values ($1, 'homologacion', 6, 1, 7, 99, '0', 1000, 826.45, $2)`, [org, cliente]);
  await q("insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo) values ($1, $2, $3, 'MLA123')", [org, variacion, canal]);
  return { org, canal, deposito, lista };
}

test("cada lista: Excel con todos los campos y orden por cada columna", async () => {
  const e = await escenario();
  const ctx = { org: e.org, moneda: "ARS" as const };
  for (const lista of Object.values(registro.LISTAS)) {
    const todos = await tipos.camposDe(lista, ctx);
    assert.ok(todos.length > 0, lista.pantalla);
    const claves = new Set<string>();
    for (const c of todos) {
      assert.ok(!claves.has(c.clave), `${lista.pantalla}: clave repetida ${c.clave}`);
      claves.add(c.clave);
    }
    for (const k of lista.enPantalla) assert.ok(claves.has(k), `${lista.pantalla}: ${k} no está en el catálogo`);
    const sp = { canal: String(e.canal), d: String(e.deposito), lista: String(e.lista), ver: "todas" };
    try {
      const filas = await excel.filasDeLista(lista, ctx, sp, todos, todos, 100);
      for (const f of filas) for (const c of todos) excel.valorExcel(c, f);
      for (const c of todos) if (c.orden !== false && (c.orden || c.sql || lista.filas)) {
        await excel.filasDeLista(lista, ctx, { ...sp, orden: c.clave, dir: "desc" }, todos, todos, 5);
      }
      // La búsqueda no rompe.
      await excel.filasDeLista(lista, ctx, { ...sp, q: "sa", contiene: "1" }, todos.slice(0, 2), todos, 5);
      // La pantalla con vistas: las columnas de siempre más las fijas.
      if (lista.vistas && lista.consulta) {
        const c = await lista.consulta(ctx, sp);
        await q(`select ${tipos.seleccion(tipos.elegir(lista, todos, null), todos, lista.siempre)} from ${c.desde} where ${c.donde} order by ${c.orden} limit 50`, c.valores);
      }
      const r = await excel.excelDeLista(lista, ctx, sp, null);
      assert.equal(r.headers.get("Content-Type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch (err) {
      throw new Error(`${lista.pantalla}: ${(err as Error).message}`);
    }
  }
});

test("lista_config: guarda, lee y no repite nombres", async () => {
  const e = await escenario();
  await q("insert into lista_config (organizacion_id, pantalla, tipo, nombre, columnas) values ($1, 'productos', 'excel', 'Contador', '[\"sku\", \"titulo\"]')", [e.org]);
  const cfgs = await config.configsDe(e.org, "productos", "excel");
  assert.deepEqual(cfgs.map((c) => [c.nombre, c.columnas]), [["Contador", ["sku", "titulo"]]]);
  assert.equal((await config.configsDe(e.org, "productos", "vista")).length, 0);
  await assert.rejects(q("insert into lista_config (organizacion_id, pantalla, tipo, nombre) values ($1, 'productos', 'excel', 'Contador')", [e.org]));
  const lista = registro.LISTAS.productos;
  const todos = await tipos.camposDe(lista, { org: e.org, moneda: "ARS" });
  assert.deepEqual(tipos.elegir(lista, todos, ["titulo", "nada", "sku", "titulo"]).map((c) => c.clave), ["titulo", "sku"]);
  assert.deepEqual(tipos.elegir(lista, todos, []).map((c) => c.clave), lista.enPantalla);
});
