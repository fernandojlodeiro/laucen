// Los precios web calculados contra una base de verdad (db/precio_web.sql): después de cada tipo de cambio
// —precio, stock, kit, publicación, comisión de ML, dólar, regla de tachado, lista, producto— la tabla tiene
// que quedar idéntica a la cuenta en vivo (precio_de / bono_web / stock_disponible_canal).
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

type Mods = { db: typeof import("@/db"); esquema: typeof import("@/lib/erp/esquema"); stock: typeof import("@/lib/stock") };
let m: Mods;

before(async () => {
  m = { db: await import("@/db"), esquema: await import("@/lib/erp/esquema"), stock: await import("@/lib/stock") };
  await m.esquema.asegurarEsquemaErp();
});
after(async () => { await m.db.pool.end(); });

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

/** Procesa la cola hasta vaciarla (como el trabajo de cada 10 segundos). */
async function procesar() {
  for (let i = 0; i < 50; i++) {
    await q("select precio_web_procesar(5000)");
    const [{ n }] = await q<{ n: string }>("select (select count(*) from precio_web_pendiente) + (select count(*) from precio_web_todo) n");
    if (Number(n) === 0) return;
  }
  throw new Error("la cola no se vació");
}

/** Lo guardado de una organización, comparado fila por fila con la cuenta en vivo: tiene que ser idéntico. */
async function igualAlVivo(org: string) {
  const filas = await q<{ canal_id: string; variacion_id: string; guardado: Record<string, string | number | null>; vivo: Record<string, string | number | null> | null }>(`
    select pw.canal_id, pw.variacion_id,
           jsonb_build_object('lista_ars', pw.lista_ars, 'lista_usd', pw.lista_usd, 'venta_ars', pw.venta_ars, 'venta_usd', pw.venta_usd,
                              'descuento_pct', pw.descuento_pct, 'bono', pw.bono, 'disp', pw.disp) guardado,
           (select to_jsonb(x) from precio_web_vivo(pw.organizacion_id, pw.canal_id, pw.lista_id, pw.variacion_id) x) vivo
      from precio_web pw where pw.organizacion_id = $1`, [org]);
  for (const f of filas) {
    const vivo = f.vivo;
    assert.ok(vivo, `la variación ${f.variacion_id} está guardada pero en vivo no corresponde`);
    for (const k of Object.keys(f.guardado)) {
      const a: number | null = f.guardado[k] == null ? null : Number(f.guardado[k]);
      const b: number | null = vivo[k] == null ? null : Number(vivo[k]);
      assert.equal(a, b, `variación ${f.variacion_id}, ${k}: guardado ${a} y en vivo ${b}`);
    }
  }
  // Y no falta ninguna: toda variación activa con precio en vivo está guardada.
  const faltan = await q(`
    select v.id from variacion v join producto p on p.id = v.producto_id
      join canal c on c.organizacion_id = v.organizacion_id and c.tipo = 'web_minorista' and c.lista_precios_id is not null
     where v.organizacion_id = $1 and v.estado = 'activa' and p.estado = 'activo'
       and exists (select 1 from precio_de(v.organizacion_id, v.id, c.lista_precios_id))
       and not exists (select 1 from precio_web pw where pw.canal_id = c.id and pw.variacion_id = v.id)`, [org]);
  assert.equal(faltan.length, 0, "faltan variaciones en la tabla");
  return filas.length;
}

/** Una tienda web con lista derivada (coeficiente), precio contra ML prendido (comisión de la categoría,
 *  tachado, promo web), un depósito, dos productos (uno en dólares) y un kit. */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const base = await id("insert into lista_precios (organizacion_id, nombre) values ($1, 'Base') returning id", [org]);
  const canalMl = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'ML', 'mercadolibre') returning id", [org]);
  const web = await id(`insert into lista_precios (organizacion_id, nombre, base_lista_id, coeficiente, precio_vs_ml)
                        values ($1, 'Web', $2, 1.1, jsonb_build_object('activo', true, 'objetivo_pct', 97, 'costo_ref_pct', 9.8, 'canal_tachado', $3::bigint,
                          'comision_defecto_pct', 16.34, 'bono_fijo_pct', 50, 'bono_stock_min', 10, 'bono_tope_pct', 10)) returning id`, [org, base, canalMl]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [deposito]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo, lista_precios_id) values ($1, 'Web', 'web_minorista', $2) returning id", [org, web]);
  await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, canal, deposito]);
  const producto = async (usd = false) => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo, precio_en_dolares) values ($1, $2, 'Producto', $3) returning id",
      [org, `P-${randomUUID().slice(0, 8)}`, usd]);
    return { p, v: await id("select id from variacion where producto_id = $1 and es_default", [p]) };
  };
  const a = await producto(), b = await producto(true), kit = await producto();
  await q("insert into precio (organizacion_id, variacion_id, lista_id, importe_ars, importe_usd, moneda_origen) values ($1, $2, $3, 20000, 20, 'ARS'), ($1, $4, $3, 100000, 100, 'USD'), ($1, $5, $3, 50000, 50, 'ARS')",
    [org, a.v, base, b.v, kit.v]);
  await q("insert into kit_componente (organizacion_id, variacion_kit_id, variacion_componente_id, cantidad) values ($1, $2, $3, 2)", [org, kit.v, a.v]);
  await m.stock.moverStock(org, { variacionId: a.v, tipo: "ingreso", cantidad: 30, destinoId: general });
  await m.stock.moverStock(org, { variacionId: b.v, tipo: "ingreso", cantidad: 5, destinoId: general });
  return { org, base, web, canal, canalMl, general, a, b, kit };
}

test("se llena entera y queda idéntica a la cuenta en vivo", async () => {
  const e = await escenario();
  await q("select precio_web_todo_de($1)", [e.org]);
  await procesar();
  assert.equal(await igualAlVivo(e.org), 3);
  const kit = (await q<{ disp: number }>("select disp from precio_web where variacion_id = $1", [e.kit.v]))[0];
  assert.equal(kit.disp, 15, "el kit (2 del componente) tiene la mitad del stock del componente");
});

test("cada tipo de cambio la deja otra vez idéntica", async () => {
  const e = await escenario();
  await q("select precio_web_todo_de($1)", [e.org]);
  await procesar();
  const pasos: [string, () => Promise<unknown>][] = [
    ["precio nuevo", () => q("update precio set importe_ars = 23000 where variacion_id = $1", [e.a.v])],
    ["stock del componente (y el kit)", () => m.stock.moverStock(e.org, { variacionId: e.a.v, tipo: "egreso", cantidad: 25, origenId: e.general })],
    ["cantidad del kit", () => q("update kit_componente set cantidad = 1 where variacion_kit_id = $1", [e.kit.v])],
    ["dólar del día", () => q("insert into tipo_cambio (organizacion_id, fecha, tipo, venta, origen) values ($1, current_date, 'oficial', 1500, 'prueba')", [e.org])],
    ["coeficiente de la lista", () => q("update lista_precios set coeficiente = 1.2 where id = $1", [e.web])],
    ["promo web de la lista", () => q("update lista_precios set precio_vs_ml = precio_vs_ml || '{\"bono_fijo_pct\": 80}' where id = $1", [e.web])],
    ["regla de tachado de ML", () => q("insert into ml_regla_precio (organizacion_id, canal_id, nivel, tachado_pct) values ($1, $2, 'general', 25)", [e.org, e.canalMl])],
    ["publicación de ML con categoría", () => q(`insert into publicacion (organizacion_id, canal_id, variacion_id, id_externo, categoria_externa, tipo_publicacion, estado)
                                                values ($1, $2, $3, $4, 'MLA-PRUEBA', 'gold_special', 'activa')`, [e.org, e.canalMl, e.a.v, `MLA${Date.now()}`])],
    ["comisión de esa categoría", async () => {
      const c = await id(`insert into ml_costos_corridas (fecha) values (current_date)
                          on conflict (fecha) do update set fecha = excluded.fecha returning id`);
      await q("insert into ml_costos_comisiones (categoria_id, desde, corrida_id, clasica_pct) values ('MLA-PRUEBA', now(), $1, 14.5)", [c]);
    }],
    ["el producto pasa a dólares", () => q("update producto set precio_en_dolares = true where id = $1", [e.a.p])],
    ["la variación se desactiva", () => q("update variacion set estado = 'pausada' where id = $1", [e.b.v])],
    ["la variación vuelve", () => q("update variacion set estado = 'activa' where id = $1", [e.b.v])],
    ["el producto se pausa", () => q("update producto set estado = 'pausado' where id = $1", [e.kit.p])],
  ];
  for (const [nombre, hacer] of pasos) {
    await hacer();
    const [{ n }] = await q<{ n: string }>(`select (select count(*) from precio_web_pendiente where organizacion_id = $1)
                                                  + (select count(*) from precio_web_todo where organizacion_id = $1) n`, [e.org]);
    assert.ok(Number(n) > 0, `«${nombre}» no dejó nada para recalcular`);
    await procesar();
    await igualAlVivo(e.org).catch((err) => { throw new Error(`después de «${nombre}»: ${err.message}`); });
  }
  assert.equal((await q("select 1 from precio_web where variacion_id = $1", [e.kit.v])).length, 0, "el producto pausado no queda en la tabla");
});

test("un cambio que entra mientras se calcula no se pierde", async () => {
  const e = await escenario();
  await q("select precio_web_todo_de($1)", [e.org]);
  await procesar();
  // El cálculo lee la cola; antes de que borre lo que leyó entra otro aviso (desde nuevo): esa fila sigue en la cola.
  await q("select precio_web_encolar($1, $2)", [e.org, e.a.v]);
  const [{ desde }] = await q<{ desde: Date }>("select desde from precio_web_pendiente where variacion_id = $1", [e.a.v]);
  await q("update precio set importe_ars = 31000 where variacion_id = $1", [e.a.v]);
  await q("delete from precio_web_pendiente where variacion_id = $1 and desde = $2", [e.a.v, desde]);
  assert.equal((await q("select 1 from precio_web_pendiente where variacion_id = $1", [e.a.v])).length, 1);
  await procesar();
  await igualAlVivo(e.org);
});

test("el control no encuentra diferencias y ninguna tabla del precio queda sin aviso", async () => {
  const e = await escenario();
  await q("select precio_web_todo_de($1)", [e.org]);
  await procesar();
  const [{ sin }] = await q<{ sin: string[] }>("select precio_web_dependencias_sin_aviso() sin");
  assert.deepEqual(sin, []);
  // Un valor guardado a mano distinto: el control lo encuentra, lo anota y lo corrige.
  await q("update precio_web set venta_ars = venta_ars + 1 where variacion_id = $1", [e.a.v]);
  const [{ d }] = await q<{ d: number }>("select precio_web_controlar(null) d");
  assert.ok(d >= 1);
  assert.ok((await q("select 1 from precio_web_diferencia where variacion_id = $1", [e.a.v])).length >= 1);
  await igualAlVivo(e.org);
});

test("lo inactivo no se calcula; al activarlo entra solo; el trabajo de cada 10 segundos vacía la cola", async () => {
  const e = await escenario();
  const inactivo = await id("insert into producto (organizacion_id, sku_base, titulo, estado) values ($1, $2, 'Viejo', 'archivado') returning id",
    [e.org, `P-${randomUUID().slice(0, 8)}`]);
  const varInactiva = await id("select id from variacion where producto_id = $1 and es_default", [inactivo]);
  await q("insert into precio (organizacion_id, variacion_id, lista_id, importe_ars, importe_usd, moneda_origen) values ($1, $2, $3, 9000, 9, 'ARS')", [e.org, varInactiva, e.base]);
  await m.stock.moverStock(e.org, { variacionId: varInactiva, tipo: "ingreso", cantidad: 3, destinoId: e.general });
  await q("delete from precio_web_pendiente where organizacion_id = $1", [e.org]);
  await q("select precio_web_todo_de($1)", [e.org]);
  await q("select precio_web_expandir_todo()");
  const enCola = new Set((await q<{ variacion_id: string }>("select variacion_id from precio_web_pendiente where organizacion_id = $1", [e.org])).map((x) => Number(x.variacion_id)));
  assert.ok(enCola.has(e.a.v) && enCola.has(e.kit.v), "lo activo entra");
  assert.ok(!enCola.has(varInactiva), "lo inactivo no entra en un recálculo general");
  await q("call precio_web_procesar_continuo(30)");
  assert.equal((await q("select 1 from precio_web_pendiente where organizacion_id = $1", [e.org])).length, 0, "la cola queda vacía");
  assert.equal((await q("select 1 from precio_web where variacion_id = $1", [varInactiva])).length, 0, "lo inactivo nunca está en la tabla");
  // Al activarlo, el aviso del producto lo calcula.
  await q("update producto set estado = 'activo' where id = $1", [inactivo]);
  await procesar();
  assert.equal((await q("select 1 from precio_web where variacion_id = $1", [varInactiva])).length, 1, "al activarlo entra");
  await igualAlVivo(e.org);
});
