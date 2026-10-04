// Una publicación pausada a mano (botón "Pausar") no se reactiva nunca sola.
import test from "node:test";
import assert from "node:assert/strict";
import { cambioDeStock } from "@/lib/mercadolibre/stock";

const pub = { id: 1, canal_id: 1, variacion_id: 1, id_externo: "MLA1", variacion_externa: null, estado: "pausada", pausada_por_stock: false, pausada_manual: false, cantidad_publicada: 0, disponible: 10, umbral: 0 };

test("pausada por falta de stock y con stock otra vez: se reactiva", () => {
  assert.equal(cambioDeStock({ ...pub, pausada_por_stock: true })?.que, "reactivar");
});

test("pausada a mano: no se reactiva aunque haya stock", () => {
  assert.equal(cambioDeStock({ ...pub, pausada_manual: true }), null);
});

test("pausada a mano y activa en ML (la reactivó otro): la automatización tampoco la toca", () => {
  assert.equal(cambioDeStock({ ...pub, estado: "activa", pausada_manual: true, disponible: 0 }), null);
});
