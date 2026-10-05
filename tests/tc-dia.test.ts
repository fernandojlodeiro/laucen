// El dólar de cada día se graba con cada importe en pesos (db/tc_dia.sql): al crear la fila,
// al cambiar su fecha, y lo anterior se completa con el del día que corresponde.

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
before(async () => {
  db = await import("@/db");
  await (await import("@/lib/erp/esquema")).asegurarEsquemaErp();
});
after(async () => { await db.pool.end(); });
const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await db.pool.query(sql, v)).rows as T[];

test("pedido y reclamo llevan el dólar de su día; si cambia la fecha, el del nuevo día", async () => {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, 'Org TC')", [org]);
  await q("insert into tipo_cambio (organizacion_id, fecha, tipo, compra, venta, origen) values ($1, '2031-01-01', 'oficial', 900, 1000, 'manual'), ($1, '2031-01-10', 'oficial', 1100, 1200, 'manual')", [org]);
  const [canal] = await q<{ id: string }>("insert into canal (organizacion_id, nombre, tipo) values ($1, 'Local', 'local') returning id", [org]);
  const [ped] = await q<{ id: string; tc_dia: string }>("insert into pedido (organizacion_id, canal_id, estado, total_ars, fecha) values ($1, $2, 'pagado', 5000, '2031-01-05 15:00-03') returning id, tc_dia", [org, canal.id]);
  assert.equal(Number(ped.tc_dia), 1000);
  const [rec] = await q<{ tc_dia: string }>("insert into reclamo (organizacion_id, canal_id, origen, tipo, estado, monto, fecha) values ($1, $2, 'local', 'reclamo', 'abierto', 2400, '2031-01-12 10:00-03') returning tc_dia", [org, canal.id]);
  assert.equal(Number(rec.tc_dia), 1200);
  // Cambia el día del pedido: toma el dólar de ese día.
  const [mov] = await q<{ tc_dia: string }>("update pedido set fecha = '2031-01-11 09:00-03' where id = $1 returning tc_dia", [ped.id]);
  assert.equal(Number(mov.tc_dia), 1200);
  // Un importe en pesos queda en dólares exactos de su día: 2400 / 1200 = 2.
  assert.equal(2400 / Number(rec.tc_dia), 2);
});
