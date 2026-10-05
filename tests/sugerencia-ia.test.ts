// "Respondió <usuario> con la IA": sólo si se mandó EXACTAMENTE la sugerencia (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { igualALaSugerencia, leerPropuesta } from "@/lib/mercadolibre/sugerencia";

test("igualALaSugerencia: igual, ignorando espacios de los extremos y el tipo de salto de línea", () => {
  assert.equal(igualALaSugerencia("Hola, sí, hay stock.", "Hola, sí, hay stock."), true);
  assert.equal(igualALaSugerencia("  Hola\r\nChau \n", "Hola\nChau"), true);
});

test("igualALaSugerencia: cualquier cambio, o sin sugerencia, es del usuario solo", () => {
  assert.equal(igualALaSugerencia("Hola, sí, hay stock!", "Hola, sí, hay stock."), false);
  assert.equal(igualALaSugerencia("Hola  mundo", "Hola mundo"), false);
  assert.equal(igualALaSugerencia("Hola", null), false);
  assert.equal(igualALaSugerencia("Hola", ""), false);
  assert.equal(igualALaSugerencia("", ""), false);
});

test("leerPropuesta: el JSON de la IA dice si se puede mandar sola", () => {
  assert.deepEqual(leerPropuesta('{"estado": "ok", "texto": "Hola, sí, hay stock. Saludos!"}'), { estado: "ok", texto: "Hola, sí, hay stock. Saludos!" });
  assert.deepEqual(leerPropuesta('Acá va:\n{"estado":"persona","texto":"Hola, ya te contacta alguien."}'), { estado: "persona", texto: "Hola, ya te contacta alguien." });
  assert.equal(leerPropuesta('{"estado":"falta_dato","texto":"Hola, lo consultamos."}').estado, "falta_dato");
});

test("leerPropuesta: lo que no viene en el formato no se manda solo", () => {
  assert.deepEqual(leerPropuesta('"Hola, sí, hay stock."'), { estado: "falta_dato", texto: "Hola, sí, hay stock." });
  assert.equal(leerPropuesta('{"estado":"quien sabe","texto":"Hola"}').estado, "falta_dato");
  assert.equal(leerPropuesta('{"estado":"ok","texto":""}').estado, "falta_dato");
});
