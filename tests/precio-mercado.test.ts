// Precio de mercado (lib/compras/precio-mercado.ts) y qué publicaciones compiten (lib/seguimiento/comparables.ts).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { textoBusqueda, aGuardar } from "@/lib/compras/precio-mercado";
import { analizar, leerJuicios, motivoFuera, preseleccion } from "@/lib/seguimiento/comparables";
import { filtroEstadoMercado } from "@/lib/seguimiento/estado-mercado";
import type { PubEncontrada } from "@/lib/seguimiento";

const pub = (itemId: string, titulo: string, precio: number, extra: Partial<PubEncontrada> = {}): PubEncontrada => ({
  itemId, catalogoId: null, titulo, foto: null, permalink: null, vendedor: "OTRO", tiendaOficial: null, precio, precioOriginal: null, moneda: "ARS",
  cuotas: null, envioGratis: null, publicidad: false, estado: "activa", tipoPublicacion: null, ...extra,
});

test("texto de búsqueda: sin paréntesis ni SKU, hasta 60 letras", () => {
  assert.equal(textoBusqueda("Lupa De Cabeza Vincha (SKU00857) Led 5 Lentes"), "Lupa De Cabeza Vincha Led 5 Lentes");
  assert.ok(textoBusqueda("x".repeat(100)).length <= 60);
});

test("preselección: fuera las nuestras, internacionales, demoradas, packs, otra moneda y títulos que no se parecen", () => {
  const nuestro = "Lupa Vincha Led 5 Lentes";
  assert.equal(motivoFuera(nuestro, pub("A", nuestro, 1000, { propia: true }), 10), "Es nuestra");
  assert.equal(motivoFuera(nuestro, pub("B", nuestro, 1000, { internacional: true }), 10), "Internacional");
  assert.equal(motivoFuera(nuestro, pub("C", nuestro, 1000, { entregaDias: 20 }), 10), "Tarda 20 días en llegar");
  assert.equal(motivoFuera(nuestro, pub("D", "Pack 2 Lupa Vincha Led 5 Lentes", 1000), 10), "Pack o varias unidades");
  assert.equal(motivoFuera(nuestro, pub("E", nuestro, 1000, { moneda: "USD" }), 10), "No está en pesos");
  assert.equal(motivoFuera(nuestro, pub("F", "Destornillador philips", 1000), 10), "El título casi no se parece");
  assert.equal(motivoFuera(nuestro, pub("G", "Lupa de vincha con led", 1000), 10), null);
  assert.deepEqual(preseleccion(nuestro, [pub("F", "Destornillador", 1), pub("G", "Lupa de vincha", 2), pub("H", nuestro, 3)], 10).map((p) => p.itemId), ["H", "G"]);
});

test("respuesta de la IA: el arreglo JSON, aunque venga con texto alrededor; ignora números fuera de rango", () => {
  const m = leerJuicios('Acá va:\n[{"n":1,"comparable":true,"motivo":"mismo modelo"},{"n":2,"comparable":false,"motivo":"es otro"},{"n":9,"comparable":true}]', 2);
  assert.deepEqual([...m.keys()], [1, 2]);
  assert.equal(m.get(1)?.comparable, true);
  assert.equal(leerJuicios("no sé", 3).size, 0);
});

test("análisis: los números salen de las que la IA da por comparables", async () => {
  const lista = [pub("A", "Lupa Vincha Led 5 Lentes", 20000), pub("B", "Lupa Vincha Led 5 Lentes Aumento", 24000), pub("C", "Lupa vincha led 3 lentes", 15000),
    pub("D", "Lupa Vincha Led 5 Lentes", 30000), pub("N", "Lupa Vincha Led 5 Lentes", 10000, { propia: true })];
  const juez = async (_n: unknown, cands: PubEncontrada[]) => ({ usd: 0, juicios: new Map(cands.map((p) => [p.itemId, { comparable: p.itemId !== "C", motivo: p.itemId === "C" ? "otro modelo" : "igual" }])) });
  const a = await analizar({ titulo: "Lupa Vincha Led 5 Lentes" }, lista, 10, juez);
  assert.deepEqual(a.comparables.map((p) => p.itemId), ["A", "B", "D"]);
  assert.equal(a.minimo, 20000);
  assert.equal(a.p25, 22000);
  assert.equal(a.mediana, 24000);
  assert.equal(a.lista.find((p) => p.itemId === "N")?.motivoIa, "Es nuestra");
  assert.equal(aGuardar(a.comparables)[0].motivo, "igual");
});

test("análisis sin IA: cuenta el parecido del título", async () => {
  const a = await analizar({ titulo: "Lupa Vincha Led 5 Lentes" }, [pub("A", "Lupa Vincha Led 5 Lentes", 1), pub("B", "Lupa de mano grande", 2)], 10, async () => null);
  assert.deepEqual(a.comparables.map((p) => p.itemId), ["A"]);
  assert.equal(a.conIa, false);
});

test("filtro por estado del precio de mercado: sólo valores de la lista", () => {
  assert.match(filtroEstadoMercado("confirmado", "p.id"), /= 'confirmado'$/);
  assert.equal(filtroEstadoMercado("'; drop table x; --", "p.id"), "");
  assert.equal(filtroEstadoMercado(undefined, "p.id"), "");
});
