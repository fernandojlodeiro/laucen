// Teléfonos legibles (lib/telefono.ts). Puro, sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { telefonoLegible, telefonoConAclaracion } from "@/lib/telefono";

test("telefonoLegible", () => {
  assert.equal(telefonoLegible("01146130698"), "011 4613-0698");
  assert.equal(telefonoLegible("1146130698"), "11 4613-0698");
  assert.equal(telefonoLegible("3514683200"), "351 468-3200");
  assert.equal(telefonoLegible("5491146130698"), "+54 9 11 4613-0698");
  assert.equal(telefonoLegible("46130698"), "4613-0698");
  assert.equal(telefonoLegible("123"), "123");
  assert.equal(telefonoLegible(null), "");
  assert.equal(telefonoConAclaracion("01146130698", "INT 32"), "011 4613-0698 (INT 32)");
  assert.equal(telefonoConAclaracion(null, "Pablo"), "Pablo");
});
