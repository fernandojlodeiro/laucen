// Tests de "Etiqueta + hoja de preparación" (Fer, 3/10): el PDF junta, por
// pedido y en orden, su etiqueta y su hoja (los kits abiertos, las líneas por
// orden de recorrido); imprimir mete los pedidos en un lote y marca la
// etiqueta impresa; un carrito en espera no se imprime; el pedido se cierra
// escaneando su hoja; y "empacar escaneando" reparte cada producto al pedido
// más viejo que lo necesita. Nunca se llama a Mercado Libre: la etiqueta de
// ML es un PDF de mentira.
//
//   TEST_DATABASE_URL=postgresql://… npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { DatosHoja, BajarEtiquetaMl } from "@/lib/deposito/hojas";

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
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

/** Un PDF de una página, como el que manda ML (10×15). */
async function pdfDeMentira(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage([283.46, 425.2]).drawRectangle({ x: 10, y: 10, width: 100, height: 50 });
  return d.save();
}
const llamadas: string[] = [];
const etiquetaMlMentira: BajarEtiquetaMl = async (_canal, envio) => {
  llamadas.push(envio);
  return envio === "ROTO" ? { ok: false, motivo: "Mercado Libre no da la etiqueta de ese envío." } : { ok: true, pdf: await pdfDeMentira() };
};

const hojaBase = (pedidoId: number, etiqueta: DatosHoja["etiqueta"]): DatosHoja => ({
  pedidoId, idExterno: null, pack: null, cliente: "Juana Pérez", apodo: null, canal: "Web", fecha: new Date(), logistica: "Retira",
  despacharAntes: null, notas: "Envolver para regalo ✨", reimpresion: false, etiqueta,
  lineas: [{ ubicacion: "A-1", orden_recorrido: 1, sku: "SKU-1", titulo: "Producto con ñ", cantidad: 2, kit: null }],
});

test("PDF: por pedido, primero la etiqueta y enseguida su hoja; 10×15 o A4; sólo etiqueta; la de ML que falla deja un aviso", async () => {
  const propia = { tipo: "propia" as const, retiro: false, metodo: "Moto", receptor: "Juana", direccion: ["Calle 1 123", "(1000) CABA"], telefono: "11 5555", referencia: null };
  const hojas = [hojaBase(11, { tipo: "ml", canalId: 1, envioExterno: "444" }), hojaBase(12, propia), hojaBase(13, { tipo: "ml", canalId: 1, envioExterno: "ROTO" })];
  const r = await m.hojas.armarPdf(hojas, { tam: "10x15", bajarEtiquetaMl: etiquetaMlMentira });
  assert.deepEqual(r.paginas, ["etiqueta-ml:11", "hoja:11", "etiqueta-propia:12", "hoja:12", "aviso:13", "hoja:13"]);
  assert.deepEqual(r.sinEtiqueta, [13]);
  const doc = await PDFDocument.load(r.pdf);
  assert.equal(doc.getPageCount(), 6);
  const { width, height } = doc.getPage(1).getSize();
  assert.ok(Math.abs(width - 283.46) < 1 && Math.abs(height - 425.2) < 1, "10×15 cm");

  const a4 = await m.hojas.armarPdf(hojas.slice(0, 2), { tam: "a4", bajarEtiquetaMl: etiquetaMlMentira });
  const d4 = await PDFDocument.load(a4.pdf);
  assert.equal(Math.round(d4.getPage(1).getSize().width), 595);

  const solo = await m.hojas.armarPdf(hojas.slice(0, 2), { tam: "10x15", bajarEtiquetaMl: etiquetaMlMentira, soloEtiqueta: true });
  assert.deepEqual(solo.paginas, ["etiqueta-ml:11", "etiqueta-propia:12"]);

  // Muchas líneas: la hoja sigue en otra página, pegada a su etiqueta.
  const larga = hojaBase(14, propia);
  larga.lineas = Array.from({ length: 40 }, (_, i) => ({ ubicacion: `B-${i}`, orden_recorrido: i, sku: `S-${i}`, titulo: "Un título bastante largo para que ocupe dos renglones en la hoja", cantidad: 1, kit: null }));
  const rl = await m.hojas.armarPdf([larga], { tam: "10x15", bajarEtiquetaMl: etiquetaMlMentira });
  assert.equal(rl.paginas[0], "etiqueta-propia:14");
  assert.ok(rl.paginas.length > 2 && rl.paginas.slice(1).every((p) => p === "hoja:14"));
});

test("ordenarLineas: por orden de recorrido, código de ubicación y SKU; sin ubicación al final", () => {
  const o = m.hojas.ordenarLineas([
    { ubicacion: null, orden_recorrido: null, sku: "Z" },
    { ubicacion: "A-10", orden_recorrido: 5, sku: "B" },
    { ubicacion: "A-2", orden_recorrido: 5, sku: "C" },
    { ubicacion: "Z-1", orden_recorrido: 1, sku: "A" },
  ]);
  assert.deepEqual(o.map((x) => x.ubicacion), ["Z-1", "A-2", "A-10", null]);
});

test("leerCodigoPedido: el número de la hoja con o sin #", () => {
  assert.equal(m.picking.leerCodigoPedido("123"), 123);
  assert.equal(m.picking.leerCodigoPedido(" #45 "), 45);
  assert.equal(m.picking.leerCodigoPedido("P7"), 7);
  assert.equal(m.picking.leerCodigoPedido("7790001"), 7790001);
  assert.equal(m.picking.leerCodigoPedido("ABC"), null);
});

/** Depósito con dos ubicaciones (B se recorre antes que A), un canal web y
 *  uno de ML, tres productos y un kit (2 × P1 + 1 × P3). */
async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const deposito = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [org]);
  const ubA = await id("insert into ubicacion (organizacion_id, deposito_id, codigo, orden_recorrido) values ($1, $2, 'A-1', 20) returning id", [org, deposito]);
  const ubB = await id("insert into ubicacion (organizacion_id, deposito_id, codigo, orden_recorrido) values ($1, $2, 'B-1', 10) returning id", [org, deposito]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Web', 'web_minorista') returning id", [org]);
  const canalMl = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'ML', 'mercadolibre') returning id", [org]);
  for (const c of [canal, canalMl]) await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [org, c, deposito]);
  const producto = async (sku: string, tipo = "simple") => {
    const p = await id("insert into producto (organizacion_id, sku_base, titulo, tipo) values ($1, $2, $3, $4) returning id", [org, sku, `Producto ${sku}`, tipo]);
    return id("select id from variacion where producto_id = $1 and es_default", [p]);
  };
  const s = randomUUID().slice(0, 6);
  const p1 = await producto(`P1-${s}`), p2 = await producto(`P2-${s}`), p3 = await producto(`P3-${s}`), kit = await producto(`K-${s}`, "kit");
  await q("insert into kit_componente (organizacion_id, variacion_kit_id, variacion_componente_id, cantidad) values ($1, $2, $3, 2), ($1, $2, $4, 1)", [org, kit, p1, p3]);
  await m.stock.moverStock(org, { variacionId: p1, tipo: "ingreso", cantidad: 20, destinoId: ubA });
  await m.stock.moverStock(org, { variacionId: p2, tipo: "ingreso", cantidad: 20, destinoId: ubB });
  await m.stock.moverStock(org, { variacionId: p3, tipo: "ingreso", cantidad: 20, destinoId: ubB });
  const sku = async (v: number) => (await q<{ sku: string }>("select sku from variacion where id = $1", [v]))[0].sku;
  let n = 0;
  const pedido = async (lineas: { v: number; c: number }[], o: { canal?: number; envio?: Record<string, unknown>; fecha?: string; notas?: string } = {}) => {
    const r = await m.pedidos.crearPedido(org, {
      canalId: o.canal ?? canal, id_externo: `T-${s}-${n++}`, cliente: { nombre: "Juana Pérez", telefono: "11 4444-5555" },
      lineas: lineas.map((l) => ({ variacion_id: l.v, cantidad: l.c, precio_unitario: 100 })), envio: o.envio ?? null, fecha: o.fecha ?? null, notas: o.notas ?? null,
    }, "sistema");
    await m.pedidos.cambiarEstado(org, r.pedidoId, "pagado", "sistema");
    return r.pedidoId;
  };
  return { org, deposito, canal, canalMl, p1, p2, p3, kit, sku, pedido };
}

test("imprimir: los pedidos entran en un lote 'hojas', la hoja abre el kit y ordena por ubicación, la etiqueta queda impresa y la segunda vez es reimpresión", async () => {
  const e = await escenario();
  const web = await e.pedido([{ v: e.p1, c: 1 }, { v: e.kit, c: 1 }, { v: e.p2, c: 3 }],
    { envio: { metodo: "Retira", direccion: null }, notas: "Timbre 2B", fecha: "2026-10-01T10:00:00Z" });
  const ml = await e.pedido([{ v: e.p2, c: 1 }], { canal: e.canalMl, fecha: "2026-10-01T09:00:00Z" });
  await q(`insert into envio (organizacion_id, canal_id, pedido_id, id_externo, logistica, estado, despachar_antes)
           values ($1, $2, $3, '4455', 'cross_docking', 'ready_to_ship', now() + interval '1 day')`, [e.org, e.canalMl, ml]);

  const r = await m.picking.prepararImpresion(e.org, [web, ml], "operador");
  assert.equal(r.lotes.length, 1);
  assert.deepEqual(r.enLote.sort(), [web, ml].sort());
  const lote = (await q<{ modo: string; estado: string }>("select modo, estado from picking_lote where id = $1", [r.lotes[0]]))[0];
  assert.deepEqual(lote, { modo: "hojas", estado: "abierto" });
  assert.equal((await q<{ estado: string }>("select estado from pedido where id = $1", [web]))[0].estado, "en_preparacion");
  assert.equal((await m.picking.pedidosParaPreparar(e.org, e.deposito)).length, 0, "ya no se ofrecen para imprimir");

  const hojas = await m.hojas.datosHojas(e.org, [web, ml]);
  // El de ML vence antes (tiene "despachar antes"): va primero.
  assert.deepEqual(hojas.map((h) => h.pedidoId), [ml, web]);
  assert.equal(hojas[0].etiqueta.tipo, "ml");
  const hw = hojas[1];
  assert.equal(hw.etiqueta.tipo, "propia");
  assert.ok(hw.etiqueta.tipo === "propia" && hw.etiqueta.retiro && hw.etiqueta.telefono === "11 4444-5555");
  assert.equal(hw.notas, "Timbre 2B");
  assert.equal(hw.reimpresion, false);
  // B-1 (orden 10) antes que A-1 (orden 20); el kit, abierto en sus componentes.
  const resumen = hw.lineas.map((l) => `${l.ubicacion} ${l.sku} ${l.cantidad}${l.kit ? ` kit:${l.kit.sku}` : ""}`);
  assert.deepEqual(resumen, [
    `B-1 ${await e.sku(e.p2)} 3`,
    `B-1 ${await e.sku(e.p3)} 1 kit:${await e.sku(e.kit)}`,
    `A-1 ${await e.sku(e.p1)} 1`,
    `A-1 ${await e.sku(e.p1)} 2 kit:${await e.sku(e.kit)}`,
  ]);

  llamadas.length = 0;
  const pdf = await m.hojas.armarPdf(hojas, { tam: "10x15", bajarEtiquetaMl: etiquetaMlMentira });
  assert.deepEqual(pdf.paginas, [`etiqueta-ml:${ml}`, `hoja:${ml}`, `etiqueta-propia:${web}`, `hoja:${web}`]);
  assert.deepEqual(llamadas, ["4455"]);
  await m.picking.marcarImpreso(e.org, [web, ml]);
  assert.ok((await q<{ ts: Date | null }>("select etiqueta_impresa_ts ts from envio where pedido_id = $1", [ml]))[0].ts);
  assert.deepEqual((await q<{ impresiones: number }>("select impresiones from picking_pedido where pedido_id = $1", [web]))[0], { impresiones: 1 });

  // Otra vez: no arma otro lote y la hoja sale como reimpresión.
  const r2 = await m.picking.prepararImpresion(e.org, [web, ml], "operador");
  assert.deepEqual(r2.lotes, []);
  assert.ok((await m.hojas.datosHojas(e.org, [web])).every((h) => h.reimpresion));
});

test("carrito de ML en espera: se muestra sin poder tildar y no se imprime", async () => {
  const e = await escenario();
  const pid = await e.pedido([{ v: e.p2, c: 1 }], { canal: e.canalMl, envio: { pack_id: 999 } });
  await q("update pedido set carrito_ultimo_evento_ts = now() - interval '2 minutes' where id = $1", [pid]);
  const lista = await m.picking.pedidosParaPreparar(e.org, e.deposito);
  assert.equal(lista.find((p) => p.id === pid)?.en_espera, true);
  await assert.rejects(m.picking.prepararImpresion(e.org, [pid], "operador"), /recibió un cambio hace \d+ min/);
  assert.equal((await q("select 1 from picking_pedido where pedido_id = $1", [pid])).length, 0, "no entró en ningún lote");
  await q("update pedido set carrito_ultimo_evento_ts = now() - interval '11 minutes' where id = $1", [pid]);
  assert.equal((await m.picking.prepararImpresion(e.org, [pid], "operador")).lotes.length, 1);
});

test("cerrar escaneando la hoja: el N.º de pedido lo deja preparado; con el último, el lote se termina", async () => {
  const e = await escenario();
  const a = await e.pedido([{ v: e.p1, c: 1 }]);
  const b = await e.pedido([{ v: e.p2, c: 2 }]);
  const otro = await e.pedido([{ v: e.p3, c: 1 }]);
  const { lotes: [lote] } = await m.picking.prepararImpresion(e.org, [a, b], "operador");

  await assert.rejects(m.picking.pedidoDelLotePorCodigo(e.org, lote, String(otro)), /no es de este lote/);
  await assert.rejects(m.picking.pedidoDelLotePorCodigo(e.org, lote, "hola"), /no es un número de pedido/);
  const p = await m.picking.pedidoDelLotePorCodigo(e.org, lote, `#${a}`);
  assert.equal(p.id, a);
  assert.equal(p.unidades, 1);

  assert.deepEqual(await m.picking.marcarPreparado(e.org, lote, a, "operador"), { loteTerminado: false });
  assert.equal((await q<{ estado: string }>("select estado from pedido where id = $1", [a]))[0].estado, "preparado");
  await assert.rejects(m.picking.marcarPreparado(e.org, lote, a, "operador"), /ya está preparado/);
  assert.deepEqual(await m.picking.marcarPreparado(e.org, lote, b, "operador"), { loteTerminado: true });
  assert.equal((await q<{ estado: string }>("select estado from picking_lote where id = $1", [lote]))[0].estado, "terminado");
});

test("empacar escaneando: dos pedidos con el mismo SKU, va al más viejo; completo se cierra; lo que sobra o no es del lote avisa", async () => {
  const e = await escenario();
  const viejo = await e.pedido([{ v: e.p1, c: 2 }], { fecha: "2026-10-01T08:00:00Z" });
  const nuevo = await e.pedido([{ v: e.p1, c: 1 }, { v: e.p2, c: 1 }], { fecha: "2026-10-02T08:00:00Z" });
  const lote = await m.picking.crearLote(e.org, e.deposito, [nuevo, viejo], "operador", "empacar");
  const sku1 = await e.sku(e.p1), sku2 = await e.sku(e.p2);

  let r = await m.picking.empacar(e.org, lote, sku1, "operador");
  assert.equal(r.pedidoId, viejo);
  assert.equal(r.completo, false);
  assert.deepEqual(r.faltan.map((f) => [f.sku, f.faltan]), [[sku1, 1]]);
  r = await m.picking.empacar(e.org, lote, sku1, "operador");
  assert.equal(r.pedidoId, viejo);
  assert.equal(r.preparado, true, "completo: queda preparado");
  assert.equal((await q<{ estado: string }>("select estado from pedido where id = $1", [viejo]))[0].estado, "preparado");

  r = await m.picking.empacar(e.org, lote, sku1, "operador");
  assert.equal(r.pedidoId, nuevo, "el viejo ya está: va al siguiente");
  assert.deepEqual(r.faltan.map((f) => f.sku), [sku2]);
  await assert.rejects(m.picking.empacar(e.org, lote, sku1, "operador"), /sobra/);
  await assert.rejects(m.picking.empacar(e.org, lote, "NO-EXISTE", "operador"), /no es de ningún pedido/);
  r = await m.picking.empacar(e.org, lote, sku2, "operador");
  assert.equal(r.preparado, true);
  assert.equal(r.loteTerminado, true);
});
