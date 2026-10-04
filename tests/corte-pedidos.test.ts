// El corte de pedidos de Mercado Libre (Fer, 3/10, 21:35): una orden creada antes
// del corte de la cuenta no entra (ni suelta ni dentro de un carrito); una
// posterior sí sigue su camino. No usa la base: el corte corta antes de tocarla.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://nadie:nada@127.0.0.1:1/nada";

import { cargarOrdenes, type OrdenMl } from "@/lib/mercadolibre/pedidos";
import type { CuentaMl } from "@/lib/mercadolibre/api";

const CORTE = new Date("2026-10-04T00:35:00Z"); // 21:35 hora argentina del 3/10
const cuenta: CuentaMl = { id: 1, organizacionId: "org", canalId: 1, meliUserId: 1, nickname: "x", estado: "activa", pedidosCorte: CORTE };
const orden = (id: number, creada: string, pack: number | null = null) => ({ id, date_created: creada, pack_id: pack }) as unknown as OrdenMl;

test("una orden creada antes del corte no entra", async () => {
  assert.equal(await cargarOrdenes(cuenta, [orden(1, "2026-10-04T00:34:59Z")], {}, null), null);
  assert.equal(await cargarOrdenes(cuenta, [orden(2, "2026-09-01T10:00:00Z")], {}, null), null);
});

test("un carrito con una orden anterior al corte no entra", async () => {
  assert.equal(await cargarOrdenes(cuenta, [orden(3, "2026-10-04T00:30:00Z", 9), orden(4, "2026-10-04T01:00:00Z", 9)], {}, null), null);
});

test("sin corte (cuenta vieja de los tests) no se filtra nada", async () => {
  const sinCorte: CuentaMl = { ...cuenta, pedidosCorte: null };
  // sin corte pasa el filtro y llega a la base (que acá no existe): tiene que intentarlo y fallar, no devolver null en silencio.
  await assert.rejects(() => cargarOrdenes(sinCorte, [orden(5, "2026-01-01T00:00:00Z")], {}, null));
});
