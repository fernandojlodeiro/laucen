// El "#" para citar publicaciones: qué se busca y en qué orden salen (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { pedidoDePublicacion } from "@/lib/pedido-publicacion";
import { ordenarPorPlan } from "@/lib/mercadolibre/buscar-publicaciones";

test("pedidoDePublicacion: el # al principio o después de un espacio abre la búsqueda hasta el cursor", () => {
  assert.deepEqual(pedidoDePublicacion("#asus", 5), { desde: 0, busqueda: "asus" });
  assert.deepEqual(pedidoDePublicacion("Hola, mirá #note asus", 21), { desde: 11, busqueda: "note asus" });
  assert.deepEqual(pedidoDePublicacion("Hola #", 6), { desde: 5, busqueda: "" });
  assert.equal(pedidoDePublicacion("Hola mirá", 9), null);
  assert.equal(pedidoDePublicacion("modelo#3 es", 11), null);          // un # pegado a una palabra no es un pedido
  assert.equal(pedidoDePublicacion("#asus\nsaludos", 13), null);       // otra línea: se cerró
  assert.deepEqual(pedidoDePublicacion("#asus saludos", 5), { desde: 0, busqueda: "asus" });  // el cursor decide qué se busca
});

test("ordenarPorPlan: primero el mismo plan, después de la más barata a la más cara", () => {
  const filas = [
    { titulo: "B", plan: "premium" }, { titulo: "A", plan: "12x_campaign" }, { titulo: "C", plan: "clasica" },
    { titulo: "D", plan: "9x_campaign" }, { titulo: "E", plan: null },
  ];
  assert.deepEqual(ordenarPorPlan(filas, "premium").map((x) => x.titulo + (x.mismoPlan ? "*" : "")), ["B*", "C", "D", "A", "E"]);
  assert.deepEqual(ordenarPorPlan(filas, null).map((x) => x.titulo), ["C", "B", "D", "A", "E"]);
  assert.deepEqual(ordenarPorPlan(filas, "3x_campaign").some((x) => x.mismoPlan), false);
});

import { leerProductos } from "@/lib/mercadolibre/productos-pedidos";

test("leerProductos: lee el JSON de la IA aunque venga con texto alrededor y descarta lo inútil", () => {
  const t = 'Acá va: {"productos":[{"pedido":"Sensor BME280","palabras":["BME280"]},{"pedido":"Pantalla TFT 3.5","palabras":["TFT","3.5","SPI","x"]},{"pedido":"","palabras":["a"]},{"pedido":"Cosa","palabras":[]}]} listo';
  assert.deepEqual(leerProductos(t), [
    { pedido: "Sensor BME280", palabras: ["BME280"] },
    { pedido: "Pantalla TFT 3.5", palabras: ["TFT", "3.5", "SPI"] },
  ]);
  assert.deepEqual(leerProductos("no sé"), []);
  assert.deepEqual(leerProductos('{"productos":[]}'), []);
  assert.deepEqual(leerProductos('{"productos":[{"pedido":"X","palabras":["a?b*c"]}]}'), [{ pedido: "X", palabras: ["a b c"] }]);
});
