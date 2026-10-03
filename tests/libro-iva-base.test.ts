// Tests de los Libros de IVA contra la base: qué entra (ventas autorizadas en
// producción, compras registradas, despachos registrados) y qué no
// (homologación, borradores, letras E y X), el filtro por canal, la
// conversión de dólares, los totales y los avisos (sin CUIT, A sin IVA,
// cargada en el período con fecha de otro, duplicados, borradores). Cada test
// arma su propia organización y no borra nada.

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
  base: typeof import("@/lib/administracion/libro-iva-base");
  libro: typeof import("@/lib/administracion/libro-iva");
};
let m: Mods;

before(async () => {
  m = {
    db: await import("@/db"),
    esquema: await import("@/lib/erp/esquema"),
    base: await import("@/lib/administracion/libro-iva-base"),
    libro: await import("@/lib/administracion/libro-iva"),
  };
  await m.esquema.asegurarEsquemaErp();
});

after(async () => {
  await m.db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const ml = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Mercado Libre', 'mercadolibre') returning id", [org]);
  const local = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Local', 'local') returning id", [org]);
  const pedido = (canal: number) => id("insert into pedido (organizacion_id, canal_id) values ($1, $2) returning id", [org, canal]);
  const cbte = async (d: { tipo: number; numero: number; fecha: string; total: number; neto: number; iva: number; detalle?: unknown[]; doc?: [number, string];
    nombre?: string; moneda?: string; cot?: number; ambiente?: string; estado?: string; pedido?: number | null; cond?: number }) =>
    id(`insert into comprobante (organizacion_id, pedido_id, ambiente, tipo_cbte, punto_venta, numero, fecha, doc_tipo, doc_nro, receptor_nombre, receptor_condicion_iva,
                                 moneda, cotizacion, importe_total, importe_neto, importe_iva, iva_detalle, estado, cae)
        values ($1, $2, $3, $4, 2, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, '12345678901234') returning id`,
      [org, d.pedido ?? null, d.ambiente ?? "produccion", d.tipo, d.numero, d.fecha, d.doc?.[0] ?? 99, d.doc?.[1] ?? "0", d.nombre ?? "Consumidor final", d.cond ?? 5,
        d.moneda ?? "PES", d.cot ?? 1, d.total, d.neto, d.iva, JSON.stringify(d.detalle ?? []), d.estado ?? "autorizado"]);
  const proveedor = (nombre: string, cuit: string | null, cond = "responsable_inscripto") =>
    id("insert into proveedor (organizacion_id, nombre, cuit, condicion_iva) values ($1, $2, $3, $4) returning id", [org, nombre, cuit, cond]);
  const factura = async (d: { prov: number; letra: string; nc?: boolean; pv: number; numero: number; fecha: string; neto: number; iva: number; detalle?: unknown[];
    percIva?: number; percIibb?: number; otros?: number; total: number; estado?: string; registrada?: string; moneda?: string; cot?: number }) =>
    id(`insert into factura_compra (organizacion_id, proveedor_id, letra, es_nota_credito, punto_venta, numero, fecha, moneda, cotizacion, neto, iva, iva_detalle,
                                    percepcion_iva, percepcion_iibb, otros_impuestos, total, estado, registrada_ts)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18::timestamptz) returning id`,
      [org, d.prov, d.letra, d.nc ?? false, d.pv, d.numero, d.fecha, d.moneda ?? "ARS", d.cot ?? 1, d.neto, d.iva, JSON.stringify(d.detalle ?? []),
        d.percIva ?? 0, d.percIibb ?? 0, d.otros ?? 0, d.total, d.estado ?? "registrada", d.registrada ?? `${d.fecha}T15:00:00-03:00`]);
  return { org, ml, local, pedido, cbte, proveedor, factura };
}

test("libro de ventas: autorizadas en producción, NC restan, dólares, canal; homologación y pendientes no entran", async () => {
  const e = await escenario();
  const pMl = await e.pedido(e.ml);
  const pLocal = await e.pedido(e.local);
  await e.cbte({ tipo: 1, numero: 10, fecha: "2026-09-03", total: 1210, neto: 1000, iva: 210, detalle: [{ id: 5, pct: 21, base: 1000, importe: 210 }], doc: [80, "30712345678"], nombre: "Cliente SA", cond: 1, pedido: pMl });
  await e.cbte({ tipo: 6, numero: 20, fecha: "2026-09-04", total: 1105, neto: 1000, iva: 105, detalle: [{ id: 4, pct: 10.5, base: 1000, importe: 105 }], pedido: pLocal });
  await e.cbte({ tipo: 3, numero: 11, fecha: "2026-09-05", total: 121, neto: 100, iva: 21, detalle: [{ id: 5, pct: 21, base: 100, importe: 21 }], doc: [80, "30712345678"], nombre: "Cliente SA", cond: 1, pedido: pMl });
  await e.cbte({ tipo: 6, numero: 21, fecha: "2026-09-06", total: 12.1, neto: 10, iva: 2.1, detalle: [{ id: 5, pct: 21, base: 10, importe: 2.1 }], moneda: "DOL", cot: 1000 });
  // No entran: homologación, pendiente, otro mes.
  await e.cbte({ tipo: 6, numero: 1, fecha: "2026-09-07", total: 999, neto: 999, iva: 0, ambiente: "homologacion" });
  await e.cbte({ tipo: 6, numero: 22, fecha: "2026-09-07", total: 999, neto: 999, iva: 0, estado: "error" });
  await e.cbte({ tipo: 6, numero: 23, fecha: "2026-10-01", total: 999, neto: 999, iva: 0 });

  const { ventas, avisos } = await m.base.libroIvaPeriodo(e.org, "2026-09-01", "2026-09-30");
  assert.equal(ventas.length, 4);
  const { filas, totales } = m.libro.armarLibro(ventas);
  assert.deepEqual(filas.map((f) => Number(f.c.numero)), [10, 20, 11, 21]);
  assert.equal(totales.neto[21], 1000 - 100 + 10000);
  assert.equal(totales.iva[21], 210 - 21 + 2100);
  assert.equal(totales.neto[10.5], 1000);
  assert.equal(totales.total, 1210 + 1105 - 121 + 12100);
  assert.equal(filas[0].c.condicionIva, "IVA Responsable Inscripto");
  assert.equal(filas[0].c.canal, "Mercado Libre");
  assert.equal(filas[0].c.enlace?.startsWith("/administracion/facturacion/"), true);
  assert.equal(ventas.filter((v) => v.canalId === e.ml).length, 2);
  assert.ok(avisos.some((a) => /homologación/.test(a.texto)));
  assert.ok(avisos.some((a) => /no están autorizados/.test(a.texto)));
});

test("libro de compras: A 21 + 10,5, B sin crédito, NC, dólares, despacho; E/X y borradores no entran; avisos", async () => {
  const e = await escenario();
  const pa = await e.proveedor("Proveedor A SRL", "30-50001091-2");
  const pb = await e.proveedor("Monotributista B", "20111111112", "monotributo");
  const sinCuit = await e.proveedor("Sin CUIT", null);
  const dup = await e.proveedor("Proveedor A (copia)", "30500010912");
  const ext = await e.proveedor("Shenzhen Co", null);
  await e.factura({ prov: pa, letra: "A", pv: 3, numero: 456, fecha: "2026-09-10", neto: 3000, iva: 420, percIva: 30, percIibb: 25.5, total: 3475.5,
    detalle: [{ pct: 21, base: 1000, importe: 210 }, { pct: 10.5, base: 2000, importe: 210 }] });
  await e.factura({ prov: pa, letra: "A", nc: true, pv: 3, numero: 460, fecha: "2026-09-15", neto: 100, iva: 21, total: 121, detalle: [{ pct: 21, base: 100, importe: 21 }] });
  await e.factura({ prov: pb, letra: "B", pv: 2, numero: 99, fecha: "2026-09-11", neto: 1210, iva: 0, total: 1210, detalle: [{ pct: 0, base: 1210, importe: 0 }] });
  await e.factura({ prov: pa, letra: "A", pv: 3, numero: 470, fecha: "2026-09-16", neto: 100, iva: 21, total: 121, moneda: "USD", cot: 1000, detalle: [{ pct: 21, base: 100, importe: 21 }] });
  // Avisos: sin CUIT, A sin IVA discriminado, duplicado (mismo CUIT, otro proveedor), cargada en septiembre con fecha de agosto.
  await e.factura({ prov: sinCuit, letra: "C", pv: 1, numero: 1, fecha: "2026-09-12", neto: 500, iva: 0, total: 500 });
  await e.factura({ prov: pa, letra: "A", pv: 3, numero: 480, fecha: "2026-09-18", neto: 800, iva: 0, total: 800 });
  await e.factura({ prov: dup, letra: "A", pv: 3, numero: 456, fecha: "2026-09-19", neto: 3000, iva: 420, total: 3420, detalle: [{ pct: 21, base: 2000, importe: 420 }] });
  await e.factura({ prov: pa, letra: "A", pv: 3, numero: 400, fecha: "2026-08-20", neto: 100, iva: 21, total: 121, registrada: "2026-09-02T10:00:00-03:00", detalle: [{ pct: 21, base: 100, importe: 21 }] });
  // No entran.
  await e.factura({ prov: pa, letra: "A", pv: 3, numero: 490, fecha: "2026-09-20", neto: 100, iva: 21, total: 121, estado: "borrador" });
  await e.factura({ prov: ext, letra: "E", pv: 1, numero: 5, fecha: "2026-09-21", neto: 1000, iva: 0, total: 1000 });
  // Despacho registrado: IVA, IVA adicional, ganancias, IIBB.
  await id(`insert into despacho_importacion (organizacion_id, numero, proveedor_id, fecha, cotizacion, fob_usd, flete_usd, seguro_usd, gastos, impuestos, estado, registrado_ts)
            values ($1, '26001IC04012345X', $2, '2026-09-20', 1000, 1000, 100, 0, $3::jsonb, $4::jsonb, 'registrado', now()) returning id`,
    [e.org, ext, JSON.stringify([{ concepto: "Derechos de importación", importe_ars: 176000 }, { concepto: "Tasa estadística", importe_ars: 33000 }, { concepto: "Despachante", importe_ars: 50000 }]),
      JSON.stringify([{ concepto: "IVA", importe_ars: 274890 }, { concepto: "IVA adicional", importe_ars: 261800 }, { concepto: "Ganancias", importe_ars: 78540 }, { concepto: "IIBB", importe_ars: 32725 }])]);

  const { ventas, compras, avisos } = await m.base.libroIvaPeriodo(e.org, "2026-09-01", "2026-09-30");
  assert.equal(compras.length, 8); // 7 facturas del período registradas (sin la E) + el despacho
  const { totales } = m.libro.armarLibro(compras);
  assert.equal(totales.neto[21], 1000 - 100 + 100000 + 2000 + 1_309_000);
  assert.equal(totales.neto[10.5], 2000);
  assert.equal(totales.iva[21], 210 - 21 + 21000 + 420 + 274890);
  assert.equal(totales.sinDiscriminar, 1210 + 500);
  assert.equal(totales.noGravado, 800); // la A sin IVA discriminado
  assert.equal(totales.percepcionIva, 30 + 261800);
  assert.equal(totales.percepcionIibb, 25.5 + 32725);
  assert.equal(totales.otros, 78540);
  const desp = compras.find((c) => c.origen === "despacho")!;
  assert.equal(desp.tipo, 66);
  assert.equal(desp.docNro, "33693450239");
  assert.equal(compras.find((c) => c.origen === "compra" && Number(c.numero) === 456 && c.docNro === "30500010912")?.tipo, 1);
  const textos = avisos.map((a) => a.texto).join("\n");
  assert.match(textos, /Sin CUIT: el proveedor no tiene CUIT válido/);
  assert.match(textos, /480 de Proveedor A SRL: factura A sin IVA discriminado/);
  assert.match(textos, /Posible duplicado: FA 00003-00000456/);
  assert.match(textos, /Factura A 00003-400 de Proveedor A SRL: se cargó en este período pero tiene fecha 20\/08\/2026/);
  assert.match(textos, /1 factura\(s\) de compra del período siguen en borrador/);
  assert.match(textos, /letra E, no entra en el libro/);

  const r = m.libro.resumenIva(m.libro.armarLibro(ventas).totales, totales);
  assert.equal(r.debito, 0);
  assert.equal(r.credito, 210 + 210 - 21 + 21000 + 420 + 274890);
  assert.equal(r.saldoTecnico, -r.credito);

  // Los archivos: largos exactos, y la NC de compra con su tipo (3).
  const a = m.libro.archivosLibroIvaDigital("202609", ventas, compras);
  const cbte = a.find((x) => x.nombre.startsWith("LIBRO_IVA_DIGITAL_COMPRAS_CBTE"))!;
  const renglones = cbte.contenido.split("\r\n").filter(Boolean);
  assert.equal(renglones.length, 8);
  assert.ok(renglones.every((l) => l.length === 325));
  assert.ok(renglones.some((l) => l.slice(8, 11) === "003"));
  assert.equal(a.find((x) => x.nombre.startsWith("LIBRO_IVA_DIGITAL_IMPORTACIONES"))!.renglones, 1);
});
