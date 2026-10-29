// Control de stock (lib/deposito/control.ts): la cola (orden, filtros, ingresos), los tres botones, «En búsqueda» y
// resolverlo. Corre contra una base de verdad (TEST_DATABASE_URL), como tests/cimiento.test.ts: cada test arma su
// propia organización y no borra nada.
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
  control: typeof import("@/lib/deposito/control");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    stock: await import("@/lib/stock"),
    control: await import("@/lib/deposito/control"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);
const TODO = { sinLugar: false, soloMl: false };

/** Una organización con un depósito con ubicaciones (A1, A2, A UBICAR) que vende por una cuenta de Mercado Libre,
 *  la lista por defecto y productos con precio. */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const usuario = `u-${randomUUID()}`;
  await q("insert into usuarios (id, email, nombre) values ($1, $2, 'Micaela')", [usuario, `${usuario}@test`]);
  const deposito = await id("insert into deposito (organizacion_id, nombre, usa_ubicaciones) values ($1, 'Central', true) returning id", [org]);
  const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [deposito]);
  const ub = (codigo: string) => id("insert into ubicacion (organizacion_id, deposito_id, codigo) values ($1, $2, $3) returning id", [org, deposito, codigo]);
  const a1 = await ub("A1"), a2 = await ub("A2"), aUbicar = await ub("A UBICAR");
  const lista = await id("insert into lista_precios (organizacion_id, nombre, por_defecto) values ($1, 'Clásicas', true) returning id", [org]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo, lista_precios_id) values ($1, 'ML', 'mercadolibre', $2) returning id", [org, lista]);
  await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, canal, deposito]);
  const producto = async (sku: string, precio: number, publicado = true) => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo) values ($1, $2, $3) returning id", [org, sku, `Producto ${sku}`]);
    const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
    await q("insert into precio (organizacion_id, variacion_id, lista_id, importe_ars, importe_usd, moneda_origen) values ($1, $2, $3, $4, $4 / 1000.0, 'ARS')", [org, v, lista, precio]);
    if (publicado) await q("insert into publicacion (organizacion_id, variacion_id, canal_id, estado) values ($1, $2, $3, 'activa')", [org, v, canal]);
    return v;
  };
  const ingreso = (v: number, u: number, n: number) => m.stock.moverStock(org, { variacionId: v, tipo: "ingreso", cantidad: n, destinoId: u });
  const cantidadEn = async (v: number, u: number) =>
    (await q<{ n: number }>("select coalesce(sum(cantidad), 0)::int n from stock where variacion_id = $1 and ubicacion_id = $2", [v, u]))[0].n;
  return { org, usuario, deposito, general, a1, a2, aUbicar, canal, producto, ingreso, cantidadEn };
}

test("cola: primero menos stock y, con el mismo stock, más plata; filtros de ubicación y de Mercado Libre", async () => {
  const e = await escenario();
  const barato = await e.producto("BARATO", 1000);
  const caro = await e.producto("CARO", 50000);
  const dos = await e.producto("DOS", 900000);
  const general = await e.producto("GRAL", 99999);
  const viejo = await e.producto("VIEJO", 99999, false);
  await e.ingreso(barato, e.a1, 1);
  await e.ingreso(caro, e.a2, 1);
  await e.ingreso(dos, e.a1, 2);
  await e.ingreso(general, e.general, 1);
  await e.ingreso(viejo, e.a1, 1);

  const f = m.control.FILTRO_DE_ENTRADA;
  assert.equal(await m.control.pendientes(e.org, f), 3, "sin GENERAL y sin lo que no está publicado");
  assert.equal(await m.control.pendientes(e.org, TODO), 5);
  const t = await m.control.proximaTarjeta(e.org, e.usuario, f);
  assert.equal(t?.sku, "CARO");
  assert.equal(t?.precio, 50000);

  // Otra persona no ve la tarjeta que tiene la primera en pantalla.
  const otra = `u-${randomUUID()}`;
  const t2 = await m.control.proximaTarjeta(e.org, otra, f);
  assert.equal(t2?.sku, "BARATO");
  // «Saltar»: a esa persona le sale la siguiente.
  await m.control.saltar(e.org, e.usuario, caro, e.a2);
  const t3 = await m.control.proximaTarjeta(e.org, e.usuario, f);
  assert.equal(t3?.sku, "DOS", "BARATO lo tiene la otra persona y CARO lo salteó");
});

test("«Está» deja el lugar al día; un ingreso posterior lo vuelve a pedir", async () => {
  const e = await escenario();
  const v = await e.producto("P1", 1000);
  await e.ingreso(v, e.a1, 1);
  const r = await m.control.registrarControl(e.org, e.usuario, { boton: "ok", variacionId: v, ubicacionId: e.a1, sistema: 1, contado: 1 });
  assert.equal(r.resultado, "ok");
  assert.equal(await m.control.pendientes(e.org, TODO), 0);
  assert.equal(await e.cantidadEn(v, e.a1), 1);

  await e.ingreso(v, e.a1, 2);
  assert.equal(await m.control.pendientes(e.org, TODO), 1);
  const t = await m.control.proximaTarjeta(e.org, e.usuario, TODO);
  assert.equal(t?.por_ingreso, true);
  assert.equal(t?.cantidad, 3);
});

test("«No está» descuenta lo que falta; «Está» con más unidades suma el sobrante; si cambió el stock no anota", async () => {
  const e = await escenario();
  const v = await e.producto("P2", 2000);
  await e.ingreso(v, e.a1, 3);
  // Cambió el stock mientras se miraba.
  await assert.rejects(m.control.registrarControl(e.org, e.usuario, { boton: "ok", variacionId: v, ubicacionId: e.a1, sistema: 2, contado: 2 }), /cambió el stock/);
  // Ve 1 de 3 y toca «No está»: se descuentan 2.
  const r = await m.control.registrarControl(e.org, e.usuario, { boton: "faltante", variacionId: v, ubicacionId: e.a1, sistema: 3, contado: 1 });
  assert.deepEqual([r.resultado, r.diferencia, r.quedan], ["faltante", 2, 1]);
  assert.equal(await e.cantidadEn(v, e.a1), 1);
  const mov = await q<{ tipo: string; referencia_tipo: string; referencia_id: string }>(
    "select tipo, referencia_tipo, referencia_id from movimiento_stock where variacion_id = $1 order by id desc limit 1", [v]);
  assert.deepEqual(mov[0], { tipo: "ajuste", referencia_tipo: "control_stock", referencia_id: String(r.controlId) });
  // «Está» contando 3 donde el sistema dice 1: suma 2.
  const s = await m.control.registrarControl(e.org, e.usuario, { boton: "ok", variacionId: v, ubicacionId: e.a1, sistema: 1, contado: 3 });
  assert.deepEqual([s.resultado, s.diferencia], ["sobrante", 2]);
  assert.equal(await e.cantidadEn(v, e.a1), 3);
  // «Está» contando menos: no se anota.
  await assert.rejects(m.control.registrarControl(e.org, e.usuario, { boton: "ok", variacionId: v, ubicacionId: e.a1, sistema: 3, contado: 2 }), /si faltan/);
  // Lo del propio control no cuenta como ingreso: sigue al día.
  assert.equal(await m.control.pendientes(e.org, TODO), 0);
});

test("«A buscar» pasa a En búsqueda (sin vender); «Apareció» lo devuelve y «No apareció» lo descuenta", async () => {
  const e = await escenario();
  const v = await e.producto("P3", 5000);
  await e.ingreso(v, e.a1, 2);
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), 2);
  // Sin cambiar la cantidad (2): no está ninguna.
  const r = await m.control.registrarControl(e.org, e.usuario, { boton: "a_buscar", variacionId: v, ubicacionId: e.a1, sistema: 2, contado: 2 });
  assert.deepEqual([r.resultado, r.diferencia, r.quedan], ["a_buscar", 2, 0]);
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), 0, "el canal no vende de En búsqueda");
  const enBusqueda = await q<{ n: number }>(`select coalesce(sum(s.cantidad), 0)::int n from stock s join ubicacion u on u.id = s.ubicacion_id
    join deposito d on d.id = u.deposito_id where s.variacion_id = $1 and d.especial = 'en_busqueda'`, [v]);
  assert.equal(enBusqueda[0].n, 2);
  const lista = await m.control.buscandoAhora(e.org);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].persona, "Micaela");

  // Aparece 1, en otra ubicación; la otra se descuenta.
  const x = await m.control.resolverBusqueda(e.org, e.usuario, lista[0].id, 1, e.a2);
  assert.deepEqual([x.aparecieron, x.perdidas], [1, 1]);
  assert.equal(await e.cantidadEn(v, e.a2), 1);
  assert.equal(await m.stock.disponibleCanal(e.org, v, e.canal), 1);
  assert.equal((await m.control.buscandoAhora(e.org)).length, 0);
  await assert.rejects(m.control.resolverBusqueda(e.org, e.usuario, lista[0].id, 0, null), /ya se resolvió/);
  // El depósito En búsqueda no queda vinculado a ningún canal.
  const vinculos = await q("select 1 from canal_deposito cd join deposito d on d.id = cd.deposito_id where d.especial is not null and d.organizacion_id = $1", [e.org]);
  assert.equal(vinculos.length, 0);
});

test("lo que queda no alcanza para lo vendido: el resultado trae lo reservado", async () => {
  const e = await escenario();
  const v = await e.producto("P4", 3000);
  await e.ingreso(v, e.a1, 1);
  await m.stock.moverStock(e.org, { variacionId: v, tipo: "reserva", cantidad: 1, origenId: e.a1, referencia: { tipo: "pedido", id: 77 } });
  const r = await m.control.registrarControl(e.org, e.usuario, { boton: "faltante", variacionId: v, ubicacionId: e.a1, sistema: 1, contado: 0 });
  assert.equal(r.reservado, 1);
  assert.ok(r.quedan < r.reservado);
  assert.deepEqual(await m.control.pedidosQueLaReservan(e.org, v), [{ id: 77, cantidad: 1 }]);
});

test("informe: situación por cantidad de stock y lo del período", async () => {
  const e = await escenario();
  const inf = await import("@/lib/informes/control-stock");
  const uno = await e.producto("UNO", 1000), dos = await e.producto("DOS", 2000);
  await e.ingreso(uno, e.a1, 1);
  await e.ingreso(dos, e.a1, 2);
  await m.control.registrarControl(e.org, e.usuario, { boton: "faltante", variacionId: uno, ubicacionId: e.a1, sistema: 1, contado: 0 });
  await m.control.registrarControl(e.org, e.usuario, { boton: "a_buscar", variacionId: dos, ubicacionId: e.a1, sistema: 2, contado: 1 });
  const bandas = await inf.situacionActual(e.org, TODO);
  assert.deepEqual(bandas.map((b) => [b.banda, b.lugares, b.al_dia, b.pendientes]), [["1", 1, 1, 0]], "UNO quedó en 0; DOS quedó con 1 y al día");
  const f = inf.leerFiltroControl({});
  const porDia = await inf.resumenPeriodo(e.org, f, "dia");
  assert.equal(porDia.length, 1);
  assert.deepEqual([porDia[0].controles, porDia[0].faltantes_u, porDia[0].faltantes_valor, porDia[0].a_buscar_u, porDia[0].a_buscar_valor], [2, 1, 1000, 1, 2000]);
  const porPersona = await inf.resumenPeriodo(e.org, f, "persona");
  assert.equal(porPersona[0].nombre, "Micaela");
  const cuentas = await inf.cuentasPorResultado(e.org, f);
  assert.deepEqual([cuentas.todos, cuentas.faltante, cuentas.a_buscar], [2, 1, 1]);
  const lista = await inf.controlesDelPeriodo(e.org, { ...f, resultado: "a_buscar" }, { desde: 0, cuantos: 50 });
  assert.deepEqual(lista.map((c) => [c.sku, c.buscando]), [["DOS", true]]);
  assert.deepEqual(await inf.enBusquedaAhora(e.org), { controles: 1, unidades: 1, valor: 2000 });
});
