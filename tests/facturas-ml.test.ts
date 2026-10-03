// Tests de subir la factura a la venta de Mercado Libre
// (lib/mercadolibre/facturas.ts + el trabajador de la cola). Nunca se llama a
// ML de verdad: el trabajador recibe un `subir` de mentira.
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
  cola: typeof import("@/lib/mercadolibre/cola");
  facturas: typeof import("@/lib/mercadolibre/facturas");
  api: typeof import("@/lib/mercadolibre/api");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    cola: await import("@/lib/mercadolibre/cola"),
    facturas: await import("@/lib/mercadolibre/facturas"),
    api: await import("@/lib/mercadolibre/api"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

/** Organización con emisor, un canal de ML (cuenta con llaves de mentira),
 *  un pedido de ML y su factura B autorizada. */
async function escenario({ subirFacturas = true, pack = String(2000000000 + Math.floor(Math.random() * 1e8)), carritoEnEspera = false } = {}) {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  await q("insert into emisor (organizacion_id, cuit, razon_social, punto_venta) values ($1, '20111111112', 'Prueba SA', 3)", [org]);
  const canal = await id("insert into canal (organizacion_id, nombre, tipo, config) values ($1, 'ML 1', 'mercadolibre', $2::jsonb) returning id",
    [org, JSON.stringify({ subir_facturas: subirFacturas })]);
  await q(`insert into meli_cuenta (organizacion_id, canal_id, meli_user_id, nickname, access_token, refresh_token, expira_el)
           values ($1, $2, $3, 'prueba', 'x', 'x', now() + interval '1 day')`, [org, canal, Math.floor(Math.random() * 1e9)]);
  const pedido = await id(`insert into pedido (organizacion_id, canal_id, id_externo, estado, total_ars, envio, carrito_ultimo_evento_ts)
                            values ($1, $2, $3, 'pagado', 1210, $4::jsonb, $5) returning id`,
    [org, canal, pack, JSON.stringify(carritoEnEspera ? { pack_id: pack } : {}), carritoEnEspera ? new Date() : null]);
  const comprobante = async (tipo = 6, asociado: number | null = null) => {
    const c = await id(`insert into comprobante (organizacion_id, pedido_id, ambiente, tipo_cbte, punto_venta, numero, doc_tipo, doc_nro, receptor_nombre,
                                                 importe_total, importe_neto, importe_iva, iva_detalle, estado, cae, cae_vto, comprobante_asociado_id)
                        values ($1, $2, 'homologacion', $3, 3, $4, 99, '0', 'Consumidor final', 1210, 1000, 210,
                                '[{"id":5,"pct":21,"base":1000,"importe":210}]', 'autorizado', '75123456789012', current_date + 10, $5) returning id`,
      [org, pedido, tipo, Math.floor(Math.random() * 1e6) + 1, asociado]);
    await q(`insert into comprobante_linea (organizacion_id, comprobante_id, descripcion, cantidad, precio_unit, iva_pct, neto, iva, total)
             values ($1, $2, 'Producto de prueba', 1, 1210, 21, 1000, 210, 1210)`, [org, c]);
    return c;
  };
  const factura = await comprobante();
  return { org, canal, pedido, pack, factura, comprobante };
}

const colaDe = (org: string) => q<{ id: string; item_id: string; tipo: string; estado: string; origen: string; payload: Record<string, unknown>; ultimo_error: string | null; lote_id: string | null }>(
  "select id, item_id, tipo, estado, origen, payload, ultimo_error, lote_id from ml_cola where organizacion_id = $1 order by id", [org]);

type Subida = { ruta: string; campo: string; nombre: string; tipo: string; datos: Uint8Array };
function falsoMl(contestar: (s: Subida) => { status: number; datos: unknown } = () => ({ status: 200, datos: { ids: ["DOC-1"] } })) {
  const subidas: Subida[] = [];
  const subir = async (_c: unknown, ruta: string, campo: string, a: { nombre: string; tipo: string; datos: Uint8Array }) => {
    const s = { ruta, campo, ...a };
    subidas.push(s);
    return contestar(s);
  };
  // Si el trabajador mandara algo que no es una factura, falla el test.
  const enviar = async () => { throw new Error("no debería mandar otra cosa a ML"); };
  return { subidas, subir, enviar };
}

test("autorizado + interruptor prendido → una subida en la cola (y no se duplica)", async () => {
  const e = await escenario();
  assert.equal(await m.facturas.alAutorizarComprobante(e.org, e.factura), 1);
  let c = await colaDe(e.org);
  assert.equal(c.length, 1);
  assert.equal(c[0].tipo, "factura");
  assert.equal(c[0].item_id, `cbte:${e.factura}`);
  assert.equal(c[0].estado, "pendiente");
  assert.equal(c[0].origen, "automatico");
  assert.equal(c[0].payload.pack_id, e.pack);
  assert.equal(c[0].payload.comprobante_id, e.factura);
  // Otra vez (o el botón): ya está en camino, no se duplica.
  assert.equal(await m.facturas.alAutorizarComprobante(e.org, e.factura), 0);
  await assert.rejects(m.facturas.subirFacturaConBoton(e.org, e.factura, null), /ya está en la cola/);
  c = await colaDe(e.org);
  assert.equal(c.length, 1);
});

test("interruptor apagado → nada en la cola; el botón la encola igual (clic de Fer)", async () => {
  const e = await escenario({ subirFacturas: false });
  assert.equal(await m.facturas.alAutorizarComprobante(e.org, e.factura), 0);
  assert.equal((await colaDe(e.org)).length, 0);
  await m.facturas.subirFacturaConBoton(e.org, e.factura, "u1");
  const c = await colaDe(e.org);
  assert.equal(c.length, 1);
  assert.equal(c[0].origen, "boton");
  assert.equal(c[0].estado, "pendiente");
});

test("carrito en espera → no se encola", async () => {
  const e = await escenario({ carritoEnEspera: true });
  assert.equal(await m.facturas.alAutorizarComprobante(e.org, e.factura), 0);
  await assert.rejects(m.facturas.subirFacturaConBoton(e.org, e.factura, null), /en espera/);
});

test("el trabajador sube el PDF por multipart a /packs/{pack}/fiscal_documents y guarda el id; no se vuelve a subir", async () => {
  const e = await escenario();
  await m.facturas.alAutorizarComprobante(e.org, e.factura);
  const falso = falsoMl();
  const r = await m.cola.procesarCola(Date.now() + 20_000, { enviar: falso.enviar, subir: falso.subir, ritmoMs: 0, org: e.org });
  assert.equal(r.ok, 1);
  assert.equal(falso.subidas.length, 1);
  const s = falso.subidas[0];
  assert.equal(s.ruta, `/packs/${e.pack}/fiscal_documents`);
  assert.equal(s.campo, "fiscal_document");
  assert.equal(s.tipo, "application/pdf");
  assert.match(s.nombre, /^Factura-B-00003-\d{8}\.pdf$/);
  assert.equal(Buffer.from(s.datos.slice(0, 5)).toString(), "%PDF-");
  const [cb] = await q<{ ml_documento_id: string; ml_subida_ts: Date | null }>("select ml_documento_id, ml_subida_ts from comprobante where id = $1", [e.factura]);
  assert.equal(cb.ml_documento_id, "DOC-1");
  assert.ok(cb.ml_subida_ts);
  assert.equal((await colaDe(e.org))[0].estado, "ok");
  // Ya subida: ni lo automático ni el botón la vuelven a mandar.
  assert.equal(await m.facturas.alAutorizarComprobante(e.org, e.factura), 0);
  await assert.rejects(m.facturas.subirFacturaConBoton(e.org, e.factura, null), /ya está subida/);
  const est = await m.facturas.estadoFacturaMl(e.org, e.factura);
  assert.equal(est?.estado, "subida");
  assert.equal(est?.es_ml, true);
});

test("una fila vieja en la cola de una factura que ya se subió no la vuelve a mandar", async () => {
  const e = await escenario();
  await m.facturas.alAutorizarComprobante(e.org, e.factura);
  await q("update comprobante set ml_subida_ts = now(), ml_documento_id = 'X' where id = $1", [e.factura]);
  const falso = falsoMl();
  const r = await m.cola.procesarCola(Date.now() + 20_000, { enviar: falso.enviar, subir: falso.subir, ritmoMs: 0, org: e.org });
  assert.equal(r.ok, 1);
  assert.equal(falso.subidas.length, 0);
});

test("ML dice que la venta ya tiene ese documento → queda como subida", async () => {
  const e = await escenario();
  await m.facturas.alAutorizarComprobante(e.org, e.factura);
  const falso = falsoMl(() => ({ status: 400, datos: { message: "The pack already has a fiscal document", error: "bad_request" } }));
  const r = await m.cola.procesarCola(Date.now() + 20_000, { enviar: falso.enviar, subir: falso.subir, ritmoMs: 0, org: e.org });
  assert.equal(r.ok, 1);
  const [cb] = await q<{ ml_subida_ts: Date | null; ml_documento_id: string | null }>("select ml_subida_ts, ml_documento_id from comprobante where id = $1", [e.factura]);
  assert.ok(cb.ml_subida_ts);
  assert.equal(cb.ml_documento_id, null);
});

test("nota de crédito rechazada por ML → error en criollo, sin marcarla subida", async () => {
  const e = await escenario({ subirFacturas: true });
  const nc = await e.comprobante(8, e.factura);
  await m.facturas.alAutorizarComprobante(e.org, nc);
  const falso = falsoMl(() => ({ status: 400, datos: { message: "invalid fiscal document", cause: [{ message: "credit note not allowed" }] } }));
  const r = await m.cola.procesarCola(Date.now() + 20_000, { enviar: falso.enviar, subir: falso.subir, ritmoMs: 0, org: e.org });
  assert.equal(r.errores, 1);
  assert.match(falso.subidas[0].nombre, /^NC-B-/);
  const [f] = await colaDe(e.org);
  assert.equal(f.estado, "error");
  assert.match(f.ultimo_error ?? "", /^Mercado Libre no aceptó el documento \(400\): invalid fiscal document · credit note not allowed/);
  const [cb] = await q<{ ml_subida_ts: Date | null }>("select ml_subida_ts from comprobante where id = $1", [nc]);
  assert.equal(cb.ml_subida_ts, null);
  assert.equal((await m.facturas.estadoFacturaMl(e.org, nc))?.estado, "error");
});

test("lote: «Subir a ML las facturas que faltan» queda preparado hasta el clic", async () => {
  const e = await escenario({ subirFacturas: false });
  const r = await m.facturas.prepararLoteFacturasFaltantes(e.org, "u1");
  assert.equal(r.facturas, 1);
  assert.equal(r.lotes.length, 1);
  let c = await colaDe(e.org);
  assert.equal(c[0].estado, "preparado");
  // Preparada: ya no se vuelve a ofrecer.
  await assert.rejects(m.facturas.prepararLoteFacturasFaltantes(e.org, "u1"), /No falta subir/);
  await m.cola.mandarLote(e.org, r.lotes[0], "u1");
  c = await colaDe(e.org);
  assert.equal(c[0].estado, "pendiente");
});

test("armarMultipart: el PDF va en el campo fiscal_document con su tipo y nombre", async () => {
  const datos = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const fd = m.api.armarMultipart("fiscal_document", { nombre: "Factura-B-00003-00000001.pdf", tipo: "application/pdf", datos });
  const archivo = fd.get("fiscal_document") as File;
  assert.ok(archivo instanceof Blob);
  assert.equal(archivo.type, "application/pdf");
  assert.equal(archivo.name, "Factura-B-00003-00000001.pdf");
  assert.deepEqual(new Uint8Array(await archivo.arrayBuffer()), datos);
  // Y así lo serializa fetch: multipart con boundary.
  const req = new Request("https://ejemplo.invalid/", { method: "POST", body: fd });
  assert.match(req.headers.get("content-type") ?? "", /^multipart\/form-data; boundary=/);
  const cuerpo = await req.text();
  assert.match(cuerpo, /Content-Disposition: form-data; name="fiscal_document"; filename="Factura-B-00003-00000001.pdf"/);
  assert.match(cuerpo, /Content-Type: application\/pdf/);
});
