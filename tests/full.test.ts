// Tests de Envíos a Full (db/full.sql, lib/full/): el depósito Full no suma al canal, despachar pasa
// el stock a «En camino», la conciliación con lo que dice ML recibe y ajusta, cerrar con faltantes,
// el reparto del flete y el flete en la rentabilidad. Los que no usan la base corren siempre.
//
//   TEST_DATABASE_URL=postgresql://… npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// La base se elige antes de cargar nada que la use (lib/full importa la conexión).
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

test("Full: reparto del flete por volumen, y por unidades si a alguno le falta el dato", async () => {
  const { repartirFlete } = await import("@/lib/full/envios");
  const lineas = [
    { id: 1, sku: "A", cantidad: 2, volumen: 1000, peso: 100, valor: 10 },
    { id: 2, sku: "B", cantidad: 1, volumen: 2000, peso: null, valor: 30 },
  ];
  const v = repartirFlete(lineas, "volumen", 4000);
  assert.equal(v.usado, "volumen");
  assert.equal(v.porUnidad.get(1), 1000);
  assert.equal(v.porUnidad.get(2), 2000);
  const p = repartirFlete(lineas, "peso", 3000);
  assert.equal(p.usado, "unidades");
  assert.deepEqual(p.sinDato, ["B"]);
  assert.equal(p.porUnidad.get(1), 1000);
  assert.equal(repartirFlete(lineas, "valor", null).porUnidad.get(1), null);
});

test("Full: bultos sugeridos del remito (grandes en su caja, chicos juntos)", async () => {
  const { bultosSugeridos } = await import("@/lib/full/remito");
  // 3 impresoras (≈ 50 × 40 × 30 cm, 9 kg) + 2 pesadas chicas: una caja por unidad.
  assert.equal(bultosSugeridos([{ cantidad: 3, volumen: 60_000, peso: 9_000 }, { cantidad: 2, volumen: 4_000, peso: 6_000 }]), 5);
  // 100 placas de 1.000 cm³ = 100.000 cm³ → 2 cajas de 76.800; sin medidas cuentan 2.000 cm³ c/u.
  assert.equal(bultosSugeridos([{ cantidad: 100, volumen: 1_000, peso: 50 }]), 2);
  assert.equal(bultosSugeridos([{ cantidad: 10, volumen: null, peso: null }]), 1);
  assert.equal(bultosSugeridos([{ cantidad: 0, volumen: 60_000, peso: 9_000 }]), 0);
});

test("Full: las publicaciones se agrupan por Código ML; la principal es la común", async () => {
  const { agruparPorCodigo } = await import("@/lib/full/envios");
  const p = (item: string, codigo: string | null, up: string, catalogo: boolean, vendidas: number) =>
    ({ variacion_id: 1, item_id: item, variation_id: "", plan: "clasica", catalogo, estado: "active", logistica: "xd_drop_off", codigo, producto_ml: up, vendidas });
  const g = agruparPorCodigo([p("MLA2", "ICPP", "U1", true, 4), p("MLA1", "ICPP", "U1", false, 1), p("MLA3", null, "U2", false, 0), p("MLA4", null, "U2", true, 0)]);
  assert.equal(g.length, 2);
  assert.equal(g[0].principal.item_id, "MLA1");
  assert.equal(g[0].vendidas, 5);
  assert.deepEqual(g[1].publicaciones.map((x) => x.item_id), ["MLA3", "MLA4"]);
});

test("Full: tamaño por medidas y peso, y tarifa de un cargo", async () => {
  const { tamanoDe, medida, tamanoDeTarifa, TARIFAS_DEFECTO } = await import("@/lib/full/costos");
  assert.equal(tamanoDe([24.6, 63.8, 60.8], 11.04), "grande");
  assert.equal(tamanoDe([60.2, 22, 63], 14.7), "extragrande");
  assert.equal(tamanoDe([10, 14, 19], 0.3), "pequeno");
  assert.equal(tamanoDe([30, 20, 50], 2), "mediano");
  assert.equal(tamanoDe([90, 10, 10], 1), "extragrande");
  assert.equal(tamanoDe([10, null, 10], 1), null);
  assert.equal(medida("60.2 cm"), 60.2);
  assert.equal(medida("14700 g"), 14.7);
  assert.equal(medida("0,5 m"), 50);
  assert.equal(tamanoDeTarifa(0.67, TARIFAS_DEFECTO), "pequeno");
  assert.equal(tamanoDeTarifa(2, TARIFAS_DEFECTO), "mediano");
  assert.equal(tamanoDeTarifa(60, TARIFAS_DEFECTO), "extragrande");
  assert.equal(tamanoDeTarifa(20, TARIFAS_DEFECTO), "grande");
});

test("Full: sugerencia y plan de conciliación", async () => {
  const { cantidadSugerida } = await import("@/lib/full/envios");
  const { planConciliacion, leerRespuestaFull } = await import("@/lib/full/lectura");
  const x = { variacion_id: 1, sku: "A", titulo: "A", vendidas_cuenta: 60, vendidas_otros: 30, en_full: 5, en_camino: 5, disponible_origen: 100 };
  // 1 por día × 30 = 30 − 10 = 20; origen 100 − 0,5 × 30 = 85.
  assert.equal(cantidadSugerida(x, { diasFull: 30, diasDejar: 30, diasVentas: 60 }), 20);
  assert.equal(cantidadSugerida({ ...x, disponible_origen: 25 }, { diasFull: 30, diasDejar: 30, diasVentas: 60 }), 10);
  assert.equal(cantidadSugerida({ ...x, vendidas_cuenta: 0 }, { diasFull: 30, diasDejar: 30, diasVentas: 60 }), 0);
  assert.deepEqual(planConciliacion(10, 4, 3), { recibir: 3, ajuste: 3 });
  assert.deepEqual(planConciliacion(5, 4, 3), { recibir: 1, ajuste: 0 });
  assert.deepEqual(planConciliacion(2, 4, 3), { recibir: 0, ajuste: -2 });
  assert.deepEqual(leerRespuestaFull({ available_quantity: 7, not_available_quantity: 2, not_available_detail: [{ status: "damaged", quantity: 2 }, { status: "lost", quantity: 0 }] }),
    { disponible: 7, noDisponible: 2, detalle: [{ status: "damaged", quantity: 2 }] });
});

if (url) {
  type Mods = {
    db: typeof import("@/db"); esquema: typeof import("@/lib/erp/esquema"); envios: typeof import("@/lib/full/envios");
    lectura: typeof import("@/lib/full/lectura"); rent: typeof import("@/lib/informes/rentabilidad"); costos: typeof import("@/lib/full/costos");
  };
  let m: Mods;
  before(async () => {
    m = {
      db: await import("@/db"), esquema: await import("@/lib/erp/esquema"), envios: await import("@/lib/full/envios"),
      lectura: await import("@/lib/full/lectura"), rent: await import("@/lib/informes/rentabilidad"), costos: await import("@/lib/full/costos"),
    };
    await m.esquema.asegurarEsquemaErp();
  });
  after(async () => { await m.db.pool.end(); });

  const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
  const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);
  const n = async (sql: string, v: unknown[] = []) => Number(Object.values((await q(sql, v))[0])[0]);

  async function escenario() {
    const org = `test-${randomUUID()}`;
    await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
    await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date - 1, 1000, 'test')", [org]);
    const propio = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Córdoba') returning id", [org]);
    const general = await id("select id from ubicacion where deposito_id = $1 and es_default", [propio]);
    const canal = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'ML BAIRES', 'mercadolibre') returning id", [org]);
    await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id, prioridad) values ($1, $2, $3, 1)", [org, canal, propio]);
    const producto = async (sku: string, stock: number) => {
      const p = await id("insert into producto (organizacion_id, sku_base, titulo, largo_cm, ancho_cm, alto_cm) values ($1, $2, $3, 10, 10, 10) returning id", [org, sku, `Producto ${sku}`]);
      const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
      if (stock) await q("select mover_stock($1, $2, 'ingreso', $3, null, $4)", [org, v, stock, general]);
      const pub = await id("insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, estado) values ($1, $2, $3, $4, 'activa') returning id", [org, v, canal, `MLA${sku}`]);
      await q(`insert into meli_item (organizacion_id, canal_id, item_id, variation_id, titulo, estado, publicacion_id, datos_externos)
               values ($1, $2, $3, '', $4, 'active', $5, $6::jsonb)`, [org, canal, `MLA${sku}`, `Producto ${sku}`, pub, JSON.stringify({ ml: { inventory_id: `INV${sku}` } })]);
      return v;
    };
    return { org, propio, general, canal, producto };
  }

  test("Full: el depósito Full se crea con el envío y no suma al stock del canal", async () => {
    const e = await escenario();
    const v = await e.producto("1", 10);
    const envio = await m.envios.crearEnvio(e.org, "u", e.canal, e.propio);
    const full = await n("select deposito_full_id from full_envio where id = $1", [envio]);
    assert.equal(await n("select prioridad from canal_deposito where canal_id = $1 and deposito_id = $2", [e.canal, full]), 99);
    assert.equal(await n("select tipo = 'full_ml' from deposito where id = $1", [full]) ? 1 : 0, 1);
    const fullGeneral = await id("select id from ubicacion where deposito_id = $1 and es_default", [full]);
    await q("select mover_stock($1, $2, 'ingreso', 5, null, $3)", [e.org, v, fullGeneral]);
    assert.equal(await n("select stock_disponible_canal($1, $2, $3)", [e.org, v, e.canal]), 10);
    // Un pedido que no es Full sale del propio (prioridad menor).
    assert.equal(await n("select deposito_para_pedido($1, $2, null)", [e.org, e.canal]), e.propio);
  });

  test("Full: despachar, recibir con la lectura, ajustar y cerrar", async () => {
    const e = await escenario();
    const v = await e.producto("2", 10);
    const w = await e.producto("3", 3);
    const envio = await m.envios.crearEnvio(e.org, "u", e.canal, e.propio);
    assert.equal(await m.envios.agregarLinea(e.org, envio, v, 6), null);
    await m.envios.agregarLinea(e.org, envio, w, 5);
    await assert.rejects(m.envios.despachar(e.org, envio, "u"), /No alcanza el stock de 3/);
    assert.equal(await n("select stock_disponible_deposito($1, $2, $3)", [e.org, v, e.propio]), 10, "si falla no mueve nada");
    const linW = await id("select id from full_envio_linea where envio_id = $1 and variacion_id = $2", [envio, w]);
    await m.envios.cambiarLinea(e.org, envio, linW, 3);
    await m.envios.guardarFlete(e.org, envio, { monto: 900, facturaId: null, criterio: "unidades" });
    assert.equal(await n("select flete_unit_ars from full_envio_linea where id = $1", [linW]), 100);
    // Despachar, deshacer (vuelve todo y queda en borrador), sumar con el envío en camino y volver a despachar.
    assert.deepEqual(await m.envios.despachar(e.org, envio, "u"), { productos: 2, unidades: 9 });
    assert.equal(await n("select stock_disponible_deposito($1, $2, $3)", [e.org, v, e.propio]), 4);
    assert.equal(await m.envios.deshacerDespacho(e.org, envio, "u"), 9);
    assert.equal(await n("select stock_disponible_deposito($1, $2, $3)", [e.org, v, e.propio]), 10, "deshacer devuelve todo");
    assert.equal(await q<{ estado: string }>("select estado from full_envio where id = $1", [envio]).then((x) => x[0].estado), "borrador");
    const r = await m.envios.despachar(e.org, envio, "u");
    assert.deepEqual(r, { productos: 2, unidades: 9 });
    assert.equal(await n("select stock_disponible_deposito($1, $2, $3)", [e.org, v, e.propio]), 4);
    assert.equal(await n("select stock_disponible_canal($1, $2, $3)", [e.org, v, e.canal]), 4, "en camino no se vende");
    const full = await n("select deposito_full_id from full_envio where id = $1", [envio]);

    // ML muestra 4 de v (quieto hace rato): se reciben 4 de las 6 en camino.
    const leido = (inv: string, disp: number, variacion: number) => q(`
      insert into full_stock (organizacion_id, canal_id, inventory_id, variacion_id, disponible, no_disponible, desde_ts)
      values ($1, $2, $3, $4, $5, 0, now() - interval '1 hour')
      on conflict (canal_id, inventory_id) do update set disponible = excluded.disponible, desde_ts = excluded.desde_ts`, [e.org, e.canal, inv, variacion, disp]);
    await leido("INV2", 4, v);
    let c = await m.lectura.conciliar(e.org, full, e.canal);
    assert.deepEqual(c, { recibidas: 4, ajustes: 0, envios_recibidos: 0 });
    assert.equal(await n("select stock_disponible_deposito($1, $2, $3)", [e.org, v, full]), 4);
    // Un cambio reciente no se toca todavía.
    await q("update full_stock set disponible = 9, desde_ts = now() where canal_id = $1 and inventory_id = 'INV2'", [e.canal]);
    assert.deepEqual(await m.lectura.conciliar(e.org, full, e.canal), { recibidas: 0, ajustes: 0, envios_recibidos: 0 });
    // Quieto: recibe las 2 que faltan de v y ajusta 3 de más.
    await leido("INV2", 9, v);
    await leido("INV3", 3, w);
    c = await m.lectura.conciliar(e.org, full, e.canal);
    assert.deepEqual(c, { recibidas: 5, ajustes: 1, envios_recibidos: 1 });
    assert.equal(await n("select stock_disponible_deposito($1, $2, $3)", [e.org, v, full]), 9);
    assert.equal(await q<{ estado: string }>("select estado from full_envio where id = $1", [envio]).then((x) => x[0].estado), "recibido");
    // ML baja (una venta que no llegó, o algo dañado): se ajusta para abajo.
    await leido("INV2", 7, v);
    c = await m.lectura.conciliar(e.org, full, e.canal);
    assert.equal(c.ajustes, 1);
    assert.equal(await n("select stock_disponible_deposito($1, $2, $3)", [e.org, v, full]), 7);

    // Tildados de la sugerencia y vaciar.
    const tercero = await m.envios.crearEnvio(e.org, "u", e.canal, e.propio);
    assert.deepEqual(await m.envios.agregarVarios(e.org, tercero, [{ variacion: v, cantidad: 2 }, { variacion: w, cantidad: 0 }]), { agregados: 1, unidades: 2 });
    assert.equal(await n("select item_id = 'MLA2' from full_envio_linea where envio_id = $1", [tercero]) ? 1 : 0, 1);
    await assert.rejects(m.envios.cambiarLinea(e.org, tercero, await id("select id from full_envio_linea where envio_id = $1", [tercero]), 2, { item: "MLA3", variacion: "" }), /no es de este producto/);
    assert.equal(await m.envios.vaciarEnvio(e.org, tercero), 1);

    // Otro envío que se cierra con faltantes que vuelven.
    const otro = await m.envios.crearEnvio(e.org, "u", e.canal, e.propio);
    await m.envios.agregarLinea(e.org, otro, v, 4);
    await m.envios.despachar(e.org, otro, "u");
    assert.equal(await n("select stock_disponible_deposito($1, $2, $3)", [e.org, v, e.propio]), 0);
    const lin = await id("select id from full_envio_linea where envio_id = $1", [otro]);
    await m.envios.recibirAMano(e.org, otro, lin, 1, "u");
    assert.equal(await m.envios.cerrarEnvio(e.org, otro, "volver", "u"), 3);
    assert.equal(await n("select stock_disponible_deposito($1, $2, $3)", [e.org, v, e.propio]), 3);
    assert.equal(await q<{ estado: string }>("select estado from full_envio where id = $1", [otro]).then((x) => x[0].estado), "cerrado");
  });

  test("Full: la rentabilidad resta el flete de lo que salió de Full", async () => {
    const e = await escenario();
    const v = await e.producto("4", 5);
    const envio = await m.envios.crearEnvio(e.org, "u", e.canal, e.propio);
    await m.envios.agregarLinea(e.org, envio, v, 5);
    await m.envios.guardarFlete(e.org, envio, { monto: 500, facturaId: null, criterio: "volumen" });
    await m.envios.despachar(e.org, envio, "u");
    const full = await n("select deposito_full_id from full_envio where id = $1", [envio]);
    const pedido = async (deposito: number) => {
      const p = await id(`insert into pedido (organizacion_id, canal_id, estado, fecha, deposito_id, afecta_stock) values ($1, $2, 'entregado', now(), $3, false) returning id`, [e.org, e.canal, deposito]);
      await q("insert into pedido_linea (organizacion_id, pedido_id, variacion_id, cantidad, precio_unit_ars, precio_unit_usd, titulo) values ($1, $2, $3, 2, 1000, 1, 'x')", [e.org, p, v]);
      return p;
    };
    const deFull = await pedido(full);
    const dePropio = await pedido(e.propio);
    const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const filas = await m.rent.rentabilidad(e.org, { desde: hoy, hasta: hoy, canal: 0, costo: "promedio", agrupar: "venta", estimar: false });
    assert.equal(filas.find((f) => f.pedido_id === deFull)?.flete, 200);
    assert.equal(filas.find((f) => f.pedido_id === dePropio)?.flete, 0);
  });

  test("Full: el almacenamiento cobrado se reparte por tamaño y llega a la rentabilidad; lo no facturado se estima", async () => {
    const e = await escenario();
    const chico = await e.producto("5", 10);
    const grande = await e.producto("6", 10);
    const envio = await m.envios.crearEnvio(e.org, "u", e.canal, e.propio);
    const full = await n("select deposito_full_id from full_envio where id = $1", [envio]);
    // Dos días en Full: 3 chicos (pequeño) y 2 grandes (extragrande); el 1.º facturado, el 2.º no.
    for (const [v, t, u] of [[chico, "pequeno", 3], [grande, "extragrande", 2]] as const) {
      await q("insert into full_stock_dia (organizacion_id, canal_id, variacion_id, fecha, unidades, tamano) values ($1, $2, $3, '2026-09-10', $4, $5), ($1, $2, $3, '2026-10-10', $4, $5)", [e.org, e.canal, v, u, t]);
    }
    await q("insert into full_cargo_lectura (organizacion_id, canal_id, periodo, estado) values ($1, $2, '2026-09-01', 'ok')", [e.org, e.canal]);
    await q(`insert into full_cargo (organizacion_id, canal_id, periodo, detalle_id, fecha, tipo, cantidad, por_unidad, monto) values
             ($1, $2, '2026-09-01', 1, '2026-09-10', 'WAREHOUSING', 3, 0.75, 2.25), ($1, $2, '2026-09-01', 2, '2026-09-10', 'WAREHOUSING', 2, 65, 130)`, [e.org, e.canal]);
    // Una venta del grande desde Full en septiembre.
    const p = await id("insert into pedido (organizacion_id, canal_id, estado, fecha, deposito_id, afecta_stock) values ($1, $2, 'entregado', '2026-09-20 12:00-03', $3, false) returning id", [e.org, e.canal, full]);
    await q("insert into pedido_linea (organizacion_id, pedido_id, variacion_id, cantidad, precio_unit_ars, precio_unit_usd, titulo) values ($1, $2, $3, 1, 1000, 1, 'x')", [e.org, p, grande]);
    await m.costos.recalcularCostosFull(e.org);
    // Los períodos que faltan leer salen como AAAA-MM-01 (no como fecha de JavaScript).
    const { hayCargosFullPendientes } = m.costos;
    assert.equal(await hayCargosFullPendientes(), true);
    const fila = async (v: number, mes: string) => (await q<{ almacenamiento: string; estimado: string; vendidas: number; por_unidad: string | null }>(
      "select almacenamiento, estimado, vendidas, por_unidad from full_costo_mes where canal_id = $1 and variacion_id = $2 and mes = $3", [e.canal, v, mes]))[0];
    assert.equal(Number((await fila(grande, "2026-09-01")).almacenamiento), 130);
    assert.equal(Number((await fila(grande, "2026-09-01")).por_unidad), 130);
    assert.equal(Number((await fila(chico, "2026-09-01")).almacenamiento), 2.25);
    assert.equal((await fila(chico, "2026-09-01")).por_unidad, null, "sin ventas: pasa al mes siguiente");
    assert.equal(Number((await fila(grande, "2026-10-01")).estimado), 130, "octubre no facturado: 2 × $65");
    const filas = await m.rent.rentabilidad(e.org, { desde: "2026-09-01", hasta: "2026-09-30", canal: 0, costo: "promedio", agrupar: "venta", estimar: false });
    assert.equal(filas.find((f) => f.pedido_id === p)?.almacenamiento, 130);
  });
}
