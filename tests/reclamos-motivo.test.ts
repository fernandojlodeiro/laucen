// El motivo entero y la reputación de un reclamo de Mercado Libre (lib/mercadolibre/reclamos.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoDeCadena, reputacionLegible } from "@/lib/mercadolibre/reclamos";

test("el motivo junta los textos del árbol de ML, sin códigos ni repetidos", () => {
  assert.equal(motivoDeCadena([{ id: "PDD9943", name: "PDD_ARRIVED_OK", detail: "Llegó bien" }, { id: "PDD9949", name: "not_working", detail: "No funciona" }]), "Llegó bien › No funciona");
  assert.equal(motivoDeCadena([{ detail: "Llegó bien" }, { detail: "Llegó bien" }]), "Llegó bien");
  assert.equal(motivoDeCadena([{ name: "PDD_X" }]), null);
  assert.equal(motivoDeCadena([]), null);
});

test("la reputación: te afecta o no te afecta; sin dato, nada", () => {
  assert.deepEqual(reputacionLegible({ affects_reputation: "affected" }), { texto: "Te afecta", afecta: true });
  assert.deepEqual(reputacionLegible({ affects_reputation: "not_affected" }), { texto: "No te afecta", afecta: false });
  assert.equal(reputacionLegible(null), null);
  assert.equal(reputacionLegible({ otra: 1 }), null);
});
