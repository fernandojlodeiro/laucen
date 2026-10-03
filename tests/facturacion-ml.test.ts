// Tests de la facturación de Mercado Libre por API (sólo lectura): de los
// JSON de ML a las tablas (períodos, documentos, cargos clasificados), el
// signo de bonificaciones y notas de crédito, la unión con el pedido por el id
// de la orden (suelta o dentro de un carrito), que leer dos veces no
// duplique, que no se registre ninguna factura de compra, el control contra
// las facturas importadas de ARCA y la rentabilidad por venta. Sin red: la
// lectura de ML se reemplaza por respuestas armadas.

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
  fac: typeof import("@/lib/mercadolibre/facturacion");
  rent: typeof import("@/lib/informes/rentabilidad");
  mc: typeof import("@/lib/administracion/arca-mc");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    fac: await import("@/lib/mercadolibre/facturacion"),
    rent: await import("@/lib/informes/rentabilidad"),
    mc: await import("@/lib/administracion/arca-mc"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

// ── Lo que contesta ML (armado como su API) ──
const PERIODOS = { offset: 0, limit: 2, total: 1, results: [{ key: "2026-09-01", amount: 3870, unpaid_amount: 0, expiration_date: "2026-10-10T00:00:00", period: { date_from: "2026-09-01", date_to: "2026-09-30" } }] };
const detalle = (detailId: number, texto: string, monto: number, extra: { order?: string; tipo?: string; sub?: string; doc?: number } = {}) => ({
  charge_info: { detail_id: detailId, transaction_detail: texto, detail_amount: monto, detail_type: extra.tipo ?? "CHARGE", detail_sub_type: extra.sub ?? null,
    creation_date_time: "2026-09-15T10:00:00.000-04:00", legal_document_number: "A 0034-00012345" },
  sales_info: extra.order ? [{ order_id: Number(extra.order), sale_date_time: "2026-09-14T09:00:00.000-04:00", transaction_amount: 20000 }] : [],
  items_info: extra.order ? [{ item_id: "MLA123", item_title: "Producto" }] : [],
  document_info: { document_id: extra.doc ?? 501 },
  currency_info: { currency_id: "ARS" },
});
const RESPUESTAS: Record<string, unknown> = {
  "ML|periods": PERIODOS,
  "MP|periods": PERIODOS,
  "ML|documents|BILL": { results: [{ id: 501, document_type: "BILL", document_number: "A 0034-00012345", date: "2026-09-30", amount: 3870, currency_id: "ARS", document_status: "PAID", files: [{ file_id: "f1", reference_number: "A0034-00012345" }] }], total: 1 },
  "ML|documents|CREDIT_NOTE": { results: [{ id: 502, document_type: "CREDIT_NOTE", document_number: "0034-00000077", date: "2026-09-30", amount: 100, currency_id: "ARS" }], total: 1 },
  "MP|documents|BILL": { results: [{ id: 601, document_type: "BILL", document_number: "A 0035-00005555", date: "2026-09-30", amount: 120, currency_id: "ARS" }], total: 1 },
  "MP|documents|CREDIT_NOTE": { results: [], total: 0 },
  "ML|details|BILL": { results: [
    detalle(9001, "Cargo por venta", 1500, { order: "2000001", sub: "CV" }),
    detalle(9002, "Costo de envío por Mercado Envíos", 800, { order: "2000001" }),
    detalle(9003, "Cargo fijo por unidad vendida", 250, { order: "2000002" }),
    detalle(9004, "Percepción de Ingresos Brutos - Buenos Aires", 120),
    detalle(9005, "Percepción de IVA", 300),
    detalle(9006, "Product Ads - campaña", 1000),
    detalle(9007, "Bonificación cargo por venta", 200, { order: "2000001", tipo: "BONUS" }),
  ], total: 7 },
  "ML|details|CREDIT_NOTE": { results: [
    detalle(9008, "Cargo por venta", 100, { order: "2000002", doc: 502 }),
    detalle(9001, "Cargo por venta", 1500, { order: "2000001" }), // ML no separó: no se pisa
  ], total: 2 },
  "MP|details|BILL": { results: [
    detalle(9101, "Retención de Ganancias", 50, { doc: 601 }),
    detalle(9102, "Cargo por cobrar con Mercado Pago", 70, { order: "2000003", doc: 601 }),
  ], total: 2 },
  "MP|details|CREDIT_NOTE": { results: [], total: 0 },
};

/** La lectura de ML de mentira: anota cada ruta y cuándo se pidió. */
function leerFalso(rutas: { ruta: string; t: number }[]) {
  return async (_c: unknown, ruta: string) => {
    rutas.push({ ruta, t: Date.now() });
    const u = new URL(`https://x${ruta}`);
    const grupo = u.searchParams.get("group") ?? (ruta.match(/\/group\/(ML|MP)\//)?.[1] ?? "");
    const tipo = u.searchParams.get("document_type");
    const k = ruta.includes("/monthly/periods") ? `${grupo}|periods` : ruta.includes("/documents") ? `${grupo}|documents|${tipo}` : `${grupo}|details|${tipo}`;
    const datos = RESPUESTAS[k];
    return datos ? { status: 200, datos } : { status: 404, datos: { message: "not found" } };
  };
}

async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, '2026-01-01', 1000, 'test')", [org]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'ML', 'mercadolibre') returning id", [org]);
  const cuenta = await id(`insert into meli_cuenta (organizacion_id, canal_id, meli_user_id, nickname, access_token, refresh_token, expira_el)
    values ($1, $2, $3, 'VENDEDOR', 'x', 'y', now() + interval '1 day') returning id`, [org, canal, Math.floor(Math.random() * 1e9)]);
  const p = await id("insert into producto (organizacion_id, sku_base, titulo, tipo) values ($1, 'R1', 'Producto R1', 'simple') returning id", [org]);
  const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
  await q("update variacion set costo_promedio_usd = 10, costo_promedio_ars = 9000, costo_fob = 7, costo_moneda = 'USD' where id = $1", [v]);
  // Una venta suelta (id_externo = la orden) y un carrito (la orden está en la línea).
  const suelto = await id(`insert into pedido (organizacion_id, canal_id, id_externo, estado, total_ars, fecha, comision_ars) values ($1, $2, '2000001', 'entregado', 20000, '2026-09-14 12:00-03', 1700) returning id`, [org, canal]);
  await q(`insert into pedido_linea (organizacion_id, pedido_id, variacion_id, cantidad, precio_unit_ars, precio_unit_usd, titulo) values ($1, $2, $3, 1, 20000, 20, 'Producto R1')`, [org, suelto, v]);
  const carrito = await id(`insert into pedido (organizacion_id, canal_id, id_externo, estado, total_ars, fecha, comision_ars) values ($1, $2, '9988776655', 'entregado', 5000, '2026-09-14 13:00-03', 999) returning id`, [org, canal]);
  await q(`insert into pedido_linea (organizacion_id, pedido_id, variacion_id, cantidad, precio_unit_ars, precio_unit_usd, titulo, datos_externos)
           values ($1, $2, $3, 1, 5000, 5, 'Producto R1', '{"ml": {"order_id": "2000002"}}')`, [org, carrito, v]);
  return { org, canal, cuenta, v, suelto, carrito };
}

test("clasifica los cargos y lee los números de comprobante", () => {
  const c = m.fac.clasificarCargo;
  assert.deepEqual(c("Cargo por venta"), { tipo: "comision", impuesto: null });
  assert.deepEqual(c("Costo de envío por Mercado Envíos"), { tipo: "envio", impuesto: null });
  assert.deepEqual(c("Percepción de Ingresos Brutos - CABA"), { tipo: "impuesto", impuesto: "iibb" });
  assert.deepEqual(c("Retención de Ganancias"), { tipo: "impuesto", impuesto: "ganancias" });
  assert.deepEqual(c("Percepción de IVA"), { tipo: "impuesto", impuesto: "iva" });
  assert.deepEqual(c("Cargo por venta", null, "BONUS"), { tipo: "bonificacion", impuesto: null });
  assert.deepEqual(m.fac.numeroDeDocumento("A 0034-00012345"), { puntoVenta: 34, numero: 12345 });
  assert.deepEqual(m.fac.numeroDeDocumento("A0034-00012345"), { puntoVenta: 34, numero: 12345 });
  const cargo = m.fac.mapearCargo(detalle(9007, "Bonificación cargo por venta", 200, { order: "2000001", tipo: "BONUS" }))!;
  assert.deepEqual([cargo.tipo, cargo.monto, cargo.order_id], ["bonificacion", -200, "2000001"]);
  assert.equal(m.fac.mapearCargo({ charge_info: {} }), null);
});

test("lee la facturación: tablas, signos, unión con el pedido, sin duplicar ni registrar facturas; control con ARCA; rentabilidad", async () => {
  const e = await escenario();
  const rutas: { ruta: string; t: number }[] = [];
  const informe = await m.fac.traerFacturacionMl(e.org, { hastaMs: Date.now() + 60_000, leer: leerFalso(rutas), cuentaId: e.cuenta });
  const r = informe.VENDEDOR as { periodos: number; documentos: number; cargos: number; incompleto: boolean };
  assert.equal(r.periodos, 2);
  assert.equal(r.incompleto, false);
  assert.ok(rutas.every((x) => x.ruta.startsWith("/billing/integration/")), "sólo lee la facturación");
  for (let i = 1; i < rutas.length; i++) assert.ok(rutas[i].t - rutas[i - 1].t >= 145, "al menos 150 ms entre lecturas");

  const cargos = await q<{ detalle_id: string; tipo: string; impuesto: string | null; monto: string; pedido_id: string | null; grupo: string }>(
    "select detalle_id, tipo, impuesto, monto, pedido_id, grupo from ml_cargo where organizacion_id = $1 order by detalle_id", [e.org]);
  const por = Object.fromEntries(cargos.map((c) => [c.detalle_id, c]));
  assert.equal(cargos.length, 10);
  assert.deepEqual([por["9001"].tipo, Number(por["9001"].monto), Number(por["9001"].pedido_id)], ["comision", 1500, e.suelto], "la NC repetida no pisó el cargo");
  assert.deepEqual([por["9007"].tipo, Number(por["9007"].monto)], ["bonificacion", -200]);
  assert.deepEqual([por["9008"].tipo, Number(por["9008"].monto), Number(por["9008"].pedido_id)], ["comision", -100, e.carrito], "la NC resta y se une por la línea del carrito");
  assert.deepEqual([por["9003"].tipo, Number(por["9003"].pedido_id)], ["cargo_fijo", e.carrito]);
  assert.deepEqual([por["9004"].impuesto, por["9005"].impuesto, por["9101"].impuesto, por["9101"].grupo], ["iibb", "iva", "ganancias", "MP"]);
  assert.equal(por["9006"].tipo, "publicidad");
  assert.equal(por["9102"].pedido_id, null, "una orden que no está en Laucen queda sin pedido");
  const docs = await q<{ documento_id: string; tipo: string; punto_venta: number; numero_cbte: string }>("select documento_id, tipo, punto_venta, numero_cbte from ml_factura_documento where organizacion_id = $1 order by documento_id", [e.org]);
  assert.deepEqual(docs.map((d) => [d.documento_id, d.tipo, d.punto_venta, Number(d.numero_cbte)]), [["501", "BILL", 34, 12345], ["502", "CREDIT_NOTE", 34, 77], ["601", "BILL", 35, 5555]]);

  // Dos veces: nada duplicado, y ninguna factura de compra registrada.
  await m.fac.traerFacturacionMl(e.org, { hastaMs: Date.now() + 60_000, leer: leerFalso([]), cuentaId: e.cuenta });
  const [n] = await q<{ c: number; d: number; p: number; f: number }>(`select (select count(*) from ml_cargo where organizacion_id = $1)::int c,
    (select count(*) from ml_factura_documento where organizacion_id = $1)::int d, (select count(*) from ml_factura_periodo where organizacion_id = $1)::int p,
    (select count(*) from factura_compra where organizacion_id = $1)::int f`, [e.org]);
  assert.deepEqual(n, { c: 10, d: 3, p: 2, f: 0 });

  // Costo por venta del pedido suelto: 1500 + 800 − 200 (sin los impuestos).
  const [neto] = await q<{ cargos: string }>(`select ${m.fac.sqlCargosMl("p")} cargos from pedido p where p.id = $1`, [e.suelto]);
  assert.equal(Number(neto.cargos), 2100);

  // Control: la factura de ML importada de ARCA (34-12345) está; la NC y la de MP faltan.
  const prov = await id("insert into proveedor (organizacion_id, nombre, cuit) values ($1, 'MercadoLibre SRL', '30703088534') returning id", [e.org]);
  const fid = await id(`insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha, total, estado, origen)
    values ($1, $2, 'A', 34, 12345, '2026-09-30', 3870, 'registrada', 'arca_mc') returning id`, [e.org, prov]);
  const otra = await id(`insert into factura_compra (organizacion_id, proveedor_id, letra, punto_venta, numero, fecha, total, estado, origen)
    values ($1, $2, 'A', 34, 99999, '2026-09-29', 10, 'registrada', 'arca_mc') returning id`, [e.org, prov]);
  const ctl = await m.fac.controlPeriodo(e.org, "2026-09-01", m.mc.CUITS_MERCADO_LIBRE);
  assert.deepEqual(Object.fromEntries(ctl.docs.map((d) => [d.numero, d.factura_id])), { "A 0034-00012345": fid, "0034-00000077": null, "A 0035-00005555": null });
  assert.deepEqual(ctl.sobran.map((f) => f.id), [otra], "la de ARCA que la API no trae");
  const imp = await m.fac.impuestosPeriodo(e.org, "2026-09-01");
  assert.equal(imp.reduce((a, x) => a + x.monto, 0), 470);

  // Rentabilidad: costo promedio 10 US$ × 1000 = 10.000; margen 20.000 − 2.100 − 10.000.
  const filas = await m.rent.rentabilidad(e.org, { desde: "2026-09-01", hasta: "2026-09-30", canal: 0, costo: "promedio", agrupar: "venta" });
  const s = filas.find((f) => f.pedido_id === e.suelto)!;
  assert.deepEqual([s.venta, s.cargos, s.cargos_ml, s.costo, s.margen, s.margen_pct], [20000, 2100, true, 10000, 7900, 39.5]);
  const c = filas.find((f) => f.pedido_id === e.carrito)!;
  assert.deepEqual([c.cargos, c.costo, c.margen], [150, 10000, -5150]);
  const fob = await m.rent.rentabilidad(e.org, { desde: "2026-09-01", hasta: "2026-09-30", canal: 0, costo: "fob", agrupar: "producto" });
  assert.equal(fob.length, 1);
  assert.deepEqual([fob[0].unidades, fob[0].ventas, fob[0].venta, fob[0].cargos, fob[0].costo], [2, 2, 25000, 2250, 14000]);
});
