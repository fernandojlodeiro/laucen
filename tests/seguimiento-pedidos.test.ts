// El seguimiento de los pedidos sin pagar (lib/pedidos/seguimiento.ts, db/correo.sql) contra una base de verdad:
// qué avisos encola pg_cron y cuándo, a quién no, la reserva de 24 horas del pago sin completar y su anulación.
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

type Mods = { db: typeof import("@/db"); esquema: typeof import("@/lib/erp/esquema"); reserva: typeof import("@/lib/pedidos/reserva"); seg: typeof import("@/lib/pedidos/seguimiento") };
let m: Mods;

before(async () => {
  m = { db: await import("@/db"), esquema: await import("@/lib/erp/esquema"), reserva: await import("@/lib/pedidos/reserva"), seg: await import("@/lib/pedidos/seguimiento") };
  await m.esquema.asegurarEsquemaErp();
});
after(async () => { await m.db.pool.end(); });

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);
const HOY = "(now() at time zone 'America/Argentina/Buenos_Aires')::date";

async function escenario() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const web = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Web', 'web_minorista') returning id", [org]);
  const local = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Local', 'local') returning id", [org]);
  const ml = await id("insert into canal (organizacion_id, nombre, tipo) values ($1, 'ML', 'mercadolibre') returning id", [org]);
  const cc = await id("insert into cliente (organizacion_id, nombre, cuenta_corriente) values ($1, 'A cuenta', true) returning id", [org]);
  /** Un pedido Nuevo sin pagar, de hace `horas`, con reserva hasta hoy + `dias`. */
  const pedido = async (canal: number, horas: number, dias: number, o: { medio?: string; cliente?: number; avisos?: boolean } = {}) => id(`
    insert into pedido (organizacion_id, canal_id, cliente_id, estado, estado_pago, fecha, reserva_hasta, total_ars, total_usd, moneda, datos_externos, avisos_reserva)
    values ($1, $2, $3, 'nuevo', 'pendiente', now() - make_interval(hours => $4), ${HOY} + $5::int, 1000, 1, 'ARS', $6::jsonb, $7) returning id`,
  [org, canal, o.cliente ?? null, horas, dias, JSON.stringify(o.medio ? { tienda: { medio: o.medio } } : {}), o.avisos ?? true]);
  return { org, web, local, ml, cc, pedido };
}
const cola = async (pid: number) => (await q<{ tipo: string }>("select tipo from correo_cola where pedido_id = $1 order by id", [pid])).map((x) => x.tipo);

test("tarjeta sin pagar a los 10 minutos: aviso y reserva de 24 horas; antes de los 10, nada", async () => {
  const e = await escenario();
  const viejo = await e.pedido(e.web, 1, 7, { medio: "payway" });
  const reciente = await q<{ id: string }>(`insert into pedido (organizacion_id, canal_id, estado, estado_pago, fecha, reserva_hasta, total_ars, total_usd, moneda, datos_externos)
    values ($1, $2, 'nuevo', 'pendiente', now() - interval '3 minutes', ${HOY} + 7, 1000, 1, 'ARS', '{"tienda":{"medio":"mercadopago"}}') returning id`, [e.org, e.web]);
  await q("select pedido_seguimiento_encolar()");
  assert.deepEqual(await cola(viejo), ["pago_incompleto"]);
  assert.deepEqual(await cola(Number(reciente[0].id)), []);
  const [r] = await q<{ horas: number }>("select extract(epoch from reserva_vence_ts - now()) / 3600 horas from pedido where id = $1", [viejo]);
  assert.ok(Math.abs(Number(r.horas) - 24) < 0.1, `quedó ${r.horas} horas`);
  // La segunda vuelta no lo repite ni le estira la reserva.
  await q("select pedido_seguimiento_encolar()");
  assert.deepEqual(await cola(viejo), ["pago_incompleto"]);
});

test("a los 2 días, el recordatorio; si ya es el último día, no (va el del último día)", async () => {
  const e = await escenario();
  const conTiempo = await e.pedido(e.local, 49, 3, { medio: "transferencia" });
  const ultimo = await e.pedido(e.local, 49, 0, { medio: "transferencia" });
  const nuevo = await e.pedido(e.local, 5, 7);
  await q("select pedido_seguimiento_encolar()");
  assert.deepEqual(await cola(conTiempo), ["recordatorio"]);
  const hora = Number((await q<{ h: number }>("select extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')::int h"))[0].h);
  assert.deepEqual(await cola(ultimo), hora >= 9 ? ["ultimo_dia"] : []);
  assert.deepEqual(await cola(nuevo), []);
});

test("no reciben avisos: Mercado Libre, cuenta corriente, pagados y los de antes (avisos_reserva en false)", async () => {
  const e = await escenario();
  const ml = await e.pedido(e.ml, 49, 3);
  const cc = await e.pedido(e.local, 49, 3, { cliente: e.cc });
  const viejo = await e.pedido(e.local, 49, 3, { avisos: false });
  const pagado = await e.pedido(e.local, 49, 3);
  await q("update pedido set estado_pago = 'pagado' where id = $1", [pagado]);
  await q("select pedido_seguimiento_encolar()");
  for (const p of [ml, cc, viejo, pagado]) assert.deepEqual(await cola(p), [], `pedido ${p}`);
});

test("la reserva de 24 horas vencida cancela el pedido y encola «reserva anulada»", async () => {
  const e = await escenario();
  const p = await e.pedido(e.web, 30, 1, { medio: "payway" });
  await q("update pedido set reserva_vence_ts = now() - interval '1 minute' where id = $1", [p]);
  await m.reserva.vencerReservas(Date.now() + 30_000);
  const [x] = await q<{ estado: string; vence: string | null }>("select estado, reserva_vence_ts vence from pedido where id = $1", [p]);
  assert.equal(x.estado, "cancelado");
  assert.equal(x.vence, null);
  assert.ok((await cola(p)).includes("reserva_anulada"));
  assert.equal(await m.seg.sigueCorrespondiendo(p, "reserva_anulada"), true);
  assert.equal(await m.seg.sigueCorrespondiendo(p, "recordatorio"), false);
});

test("la reserva en criollo: por días con el nombre del día; por horas, «mañana a las …»", async () => {
  const e = await escenario();
  const dias = await e.pedido(e.local, 1, 3);
  assert.match((await m.seg.reservaLegible(dias))!, /^el (lunes|martes|miércoles|jueves|viernes|sábado|domingo) \d\d\/\d\d$/);
  const horas = await e.pedido(e.web, 1, 1);
  await q("update pedido set reserva_vence_ts = now() + interval '24 hours' where id = $1", [horas]);
  assert.match((await m.seg.reservaLegible(horas))!, /^mañana a las \d\d:\d\d$/);
});
