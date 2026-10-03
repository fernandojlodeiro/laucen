// Tests de los atajos de fechas (lib/rango-fechas.ts). No usan la base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rangoDeAtajo, atajoDeRango, hoyArgentina } from "@/lib/rango-fechas";

test("atajos de fechas", () => {
  const hoy = "2026-03-01";
  assert.deepEqual(rangoDeAtajo("hoy", hoy), { desde: hoy, hasta: hoy });
  assert.deepEqual(rangoDeAtajo("ayer", hoy), { desde: "2026-02-28", hasta: "2026-02-28" });
  assert.deepEqual(rangoDeAtajo("7dias", hoy), { desde: "2026-02-23", hasta: hoy });
  assert.deepEqual(rangoDeAtajo("mes", hoy), { desde: "2026-03-01", hasta: hoy });
  assert.deepEqual(rangoDeAtajo("mes_anterior", hoy), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(rangoDeAtajo("trimestre_anterior", hoy), { desde: "2025-10-01", hasta: "2025-12-31" });
  assert.deepEqual(rangoDeAtajo("trimestre_anterior", "2026-08-15"), { desde: "2026-04-01", hasta: "2026-06-30" });
  assert.deepEqual(rangoDeAtajo("mes_anterior", "2026-01-10"), { desde: "2025-12-01", hasta: "2025-12-31" });
  assert.deepEqual(rangoDeAtajo("anio_anterior", hoy), { desde: "2025-01-01", hasta: "2025-12-31" });
  assert.equal(atajoDeRango("2026-02-01", "2026-02-28", hoy), "mes_anterior");
  assert.equal(atajoDeRango("2026-02-02", "2026-02-28", hoy), "personalizado");
  assert.equal(atajoDeRango("", "", hoy), "");
  // A las 23:30 de Buenos Aires ya es el día siguiente en UTC: cuenta el de la Argentina.
  assert.equal(hoyArgentina(new Date("2026-03-02T02:30:00Z")), "2026-03-01");
});
