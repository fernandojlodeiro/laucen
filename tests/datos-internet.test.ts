// Lo que vuelve de la búsqueda en internet de un dato técnico (lib/datos-internet.ts): puro, sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerHallazgo } from "@/lib/datos-internet";
import { leerPropuesta } from "@/lib/mercadolibre/sugerencia";

test("leerHallazgo: el JSON con su certeza, dato y fuentes (aunque traiga texto alrededor)", () => {
  const h = leerHallazgo('Busqué en la web de Waveshare.\n{"certeza": "seguro", "dato": "Sí: Zigbee 3.0 y Thread (802.15.4).", "fuentes": ["https://www.waveshare.com/esp32-c6.htm"]}');
  assert.deepEqual(h, { certeza: "seguro", dato: "Sí: Zigbee 3.0 y Thread (802.15.4).", fuentes: ["https://www.waveshare.com/esp32-c6.htm"] });
});

test("leerHallazgo: sin JSON, certeza desconocida o sin dato → no_encontrado", () => {
  assert.equal(leerHallazgo("no encontré nada").certeza, "no_encontrado");
  assert.equal(leerHallazgo('{"certeza": "quizas", "dato": "algo"}').certeza, "no_encontrado");
  assert.equal(leerHallazgo('{"certeza": "seguro", "dato": ""}').certeza, "no_encontrado");
});

test("leerHallazgo: no_aplica vale sin dato; las fuentes sólo si son direcciones web, hasta 3", () => {
  assert.equal(leerHallazgo('{"certeza": "no_aplica"}').certeza, "no_aplica");
  const h = leerHallazgo('{"certeza": "contradice", "dato": "Una dice 5 V y otra 3,3 V.", "fuentes": ["javascript:alert(1)", "https://a.com", "http://b.com", "https://c.com", "https://d.com", 3]}');
  assert.deepEqual(h.fuentes, ["https://a.com", "http://b.com", "https://c.com"]);
});

test("leerPropuesta: «derivar» es un estado válido (mensajes de posventa)", () => {
  assert.deepEqual(leerPropuesta('{"estado": "derivar", "texto": "Estoy derivando tu caso a una persona del equipo."}'),
    { estado: "derivar", texto: "Estoy derivando tu caso a una persona del equipo." });
});

test("leerPropuesta: «nada» (un «gracias») no lleva texto", () => {
  assert.deepEqual(leerPropuesta('{"estado": "nada", "texto": "De nada!"}'), { estado: "nada", texto: "" });
});
