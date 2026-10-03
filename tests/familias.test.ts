// Tests del buscador de familias (lib/erp/familias.ts): por nombre o por
// camino, todas las palabras, sólo propias y sin la familia y lo de abajo.
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
let familias: typeof import("@/lib/erp/familias");

before(async () => {
  db = await import("@/db");
  await (await import("@/lib/erp/esquema")).asegurarEsquemaErp();
  familias = await import("@/lib/erp/familias");
});

after(async () => {
  await db.pool.end();
});

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await db.pool.query(sql, v)).rows as T[];
const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

test("buscar familias por nombre y camino", async () => {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const elec = await id("insert into familia (organizacion_id, nombre, ml_categoria) values ($1, 'Electrónica', 'MLA1') returning id", [org]);
  const comp = await id("insert into familia (organizacion_id, nombre, padre_id, ml_categoria) values ($1, 'Componentes', $2, 'MLA2') returning id", [org, elec]);
  await q("insert into familia (organizacion_id, nombre, padre_id, ml_categoria) values ($1, 'Resistencias', $2, 'MLA3')", [org, comp]);
  const cocina = await id("insert into familia (organizacion_id, nombre) values ($1, 'Cocina') returning id", [org]);
  const sartenes = await id("insert into familia (organizacion_id, nombre, padre_id) values ($1, 'Sartenes', $2) returning id", [org, cocina]);

  const r1 = await familias.buscarFamilias(org, "resist");
  assert.deepEqual(r1.map((f) => f.camino), ["Electrónica › Componentes › Resistencias"]);
  // Por el camino, con palabras sueltas en cualquier orden.
  const r2 = await familias.buscarFamilias(org, "compo electr");
  assert.deepEqual(r2.map((f) => f.nombre).sort(), ["Componentes", "Resistencias"]);
  // Las que empiezan con lo escrito, primero.
  const r3 = await familias.buscarFamilias(org, "co");
  assert.equal(r3[0].nombre, "Cocina");
  // Sólo propias.
  const r4 = await familias.buscarFamilias(org, "", { propias: true });
  assert.deepEqual(r4.map((f) => f.nombre), ["Cocina", "Sartenes"]);
  // Sin ella ni lo de abajo.
  const r5 = await familias.buscarFamilias(org, "", { propias: true, excluir: cocina });
  assert.deepEqual(r5, []);
  // Un comodín escrito no es comodín.
  assert.deepEqual(await familias.buscarFamilias(org, "%"), []);

  assert.equal(await familias.caminoDeFamilia(org, sartenes), "Cocina › Sartenes");
  assert.equal(await familias.caminoDeFamilia(org, 0), null);
  assert.equal(await familias.caminoDeFamilia(`otra-${org}`, sartenes), null);
});
