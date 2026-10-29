// ¿Avión o barco? (lib/compras/via.ts): flete por kilo cobrable y por m³, costo final con y sin NCM, y la categoría.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_VIA, calcularVia, costoCourier, costoFinal } from "@/lib/compras/via";
import { resolver } from "@/lib/costo-importacion";

const sinNcm = null;
const m = (peso_g: number | null, cbm: number | null) => ({ peso_g, cbm, origen: "packing" as const, exacto: true });

test("sin NCM: (FOB + flete) × 1,30", () => {
  assert.equal(Math.round(costoFinal(10, 3, sinNcm, CONFIG_VIA) * 100) / 100, 16.9);
});

test("con NCM: CIF + derechos, estadística, despachante y depósito + IVA", () => {
  const r = resolver({ derecho_pct: 10, tasa_estadistica_pct: 3, iva_pct: 21 }, [], { seguro_pct: 1, despachante_pct: 1, deposito_pct: 2 });
  // CIF = 10 + 2 + 0,1 = 12,1; derechos 1,21; estadística 0,363; despachante 0,121; depósito 0,242 → 14,036;
  // IVA = (12,1 + 1,21 + 0,363) × 21 % = 2,87133 → 16,90733
  assert.equal(Math.round(costoFinal(10, 2, r, CONFIG_VIA) * 1000) / 1000, 16.907);
});

test("por avión, courier: FOB + flete + 8 % del FOB", () => {
  assert.equal(Math.round(costoCourier(10, 3, CONFIG_VIA) * 100) / 100, 13.8);
});

test("categorías: avión, conviene barco, no rentable, imposible, sin datos", () => {
  // 100 g, chico: flete 1,30 sobre FOB 10 = 13 % → avión.
  assert.equal(calcularVia(10, m(100, 0.0001), 30, sinNcm, CONFIG_VIA).categoria, "avion");
  // 1 kg: flete 13 = 130 % del FOB, pero con precio alto deja margen → conviene barco.
  const b = calcularVia(10, m(1000, 0.001), 60, sinNcm, CONFIG_VIA);
  assert.equal(b.categoria, "barco");
  assert.equal(Math.round(b.flete_aereo_pct!), 130);
  // Volumétrico manda: 0,01 m³ × 167 = 1,67 kg aunque pese 200 g.
  assert.equal(calcularVia(10, m(200, 0.01), 60, sinNcm, CONFIG_VIA).cobrable_kg, 1.67);
  // Gana, pero menos del 10 %, con flete caro y barco mucho más barato: avión 10,8 + 13 = 23,8; barco (10 + 0,66) × 1,3 = 13,86;
  // neto 25 → 1,2 / 25 = 4,8 %.
  assert.equal(calcularVia(10, m(1000, 0.002), 25, sinNcm, CONFIG_VIA).categoria, "no_rentable");
  // Gana menos del 10 % pero el flete aéreo es barato (1,3 = 13 % del FOB): no es el avión → «No rentable», a revisar.
  assert.equal(calcularVia(10, m(100, null), 13, sinNcm, CONFIG_VIA).categoria, "revisar");
  // Flete caro (39 %), pero por avión cuesta casi lo mismo que por barco: 14,7 contra 13,43 (+9,5 %) → a revisar.
  assert.equal(calcularVia(10, m(300, 0.001), 15, sinNcm, CONFIG_VIA).categoria, "revisar");
  // Pierde plata por avión: 10,8 + 13 = 23,8 > 20.
  assert.equal(calcularVia(10, m(1000, null), 20, sinNcm, CONFIG_VIA).categoria, "imposible");
  assert.equal(calcularVia(null, m(100, null), 20, sinNcm, CONFIG_VIA).categoria, "sin_datos");
  assert.equal(calcularVia(10, m(null, null), 20, sinNcm, CONFIG_VIA).categoria, "sin_datos");
});

test("a comprar: descuenta lo que se vende mientras llega la compra", async () => {
  const { aComprar } = await import("@/lib/compras/sugerencia");
  // 60 u. cada 60 días, llega en 40: se venden 40 de las 50 de hoy, quedan 10 → comprar 50.
  assert.deepEqual(aComprar(60, 60, 40, 50), { alLlegar: 10, comprar: 50 });
  // Se agota antes de llegar: queda 0 → se compran los 60 días enteros.
  assert.deepEqual(aComprar(60, 60, 40, 20), { alLlegar: 0, comprar: 60 });
  // Sin demora, como antes: típico menos stock.
  assert.deepEqual(aComprar(60, 60, 0, 50), { alLlegar: 50, comprar: 10 });
  // Sobra stock aun después de llegar.
  assert.deepEqual(aComprar(30, 60, 40, 200), { alLlegar: 180, comprar: 0 });
  // Stock negativo cuenta como cero.
  assert.deepEqual(aComprar(30, 60, 40, -5), { alLlegar: 0, comprar: 30 });
});

test("precio de venta: Clásica si lo vende, mercado si no; revisar si difieren más de 5 %", async () => {
  const { precioBase, paraRevisar, viasElegidas } = await import("@/lib/compras/sugerencia");
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 18513, mercado: 19549, ultimaHoy: 18632 }), { precio: 18513, de: "clasica", clasicaDudosa: false, mercadoDudoso: false });
  assert.deepEqual(precioBase({ vendiendo: false, clasica: 18513, mercado: 19549, ultimaHoy: 18632 }), { precio: 19549, de: "mercado", clasicaDudosa: false, mercadoDudoso: false });
  // No lo vende y no tiene mercado: sin precio (ni la Clásica ni la última venta).
  assert.deepEqual(precioBase({ vendiendo: false, clasica: 18513, mercado: null, ultimaHoy: 18632 }), { precio: null, de: null, clasicaDudosa: false, mercadoDudoso: false });
  assert.deepEqual(precioBase({ vendiendo: true, clasica: null, mercado: null, ultimaHoy: 18632 }), { precio: 18632, de: "ultima", clasicaDudosa: false, mercadoDudoso: false });
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 0, mercado: null, ultimaHoy: null }), { precio: null, de: null, clasicaDudosa: false, mercadoDudoso: false });
  // SKU03025: Clásica de bloqueo ($ 599.999) para una bomba de US$ 0,44 → se usa el mercado.
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 599999, mercado: 6589, ultimaHoy: null, fobArs: 686 }), { precio: 6589, de: "mercado", clasicaDudosa: true, mercadoDudoso: false });
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 599999, mercado: 6589, ultimaHoy: null }), { precio: 6589, de: "mercado", clasicaDudosa: true, mercadoDudoso: false });
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 9000, mercado: 6589, ultimaHoy: null, fobArs: 686 }), { precio: 9000, de: "clasica", clasicaDudosa: false, mercadoDudoso: false });
  // Un mercado por debajo del FOB en pesos no se usa.
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 1849, mercado: 10, ultimaHoy: null, fobArs: 31 }), { precio: 1849, de: "clasica", clasicaDudosa: false, mercadoDudoso: true });
  assert.deepEqual(precioBase({ vendiendo: false, clasica: 1849, mercado: 10, ultimaHoy: null, fobArs: 31 }), { precio: null, de: null, clasicaDudosa: false, mercadoDudoso: true });
  // Lo barato que se vende muy por encima del FOB pero en línea con el mercado sigue con su Clásica.
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 1980, mercado: 1700, ultimaHoy: null, fobArs: 6 }), { precio: 1980, de: "clasica", clasicaDudosa: false, mercadoDudoso: false });
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 599999, mercado: null, ultimaHoy: 6000, fobArs: 686 }), { precio: 599999, de: "clasica", clasicaDudosa: false, mercadoDudoso: false });
  assert.equal(paraRevisar(18513, 19549), true); // +5,6 %
  assert.equal(paraRevisar(18513, 19000), false); // +2,6 %
  assert.equal(paraRevisar(20000, 18900), true); // −5,5 %
  assert.equal(paraRevisar(null, 19549), false);
  assert.deepEqual([...viasElegidas("rentable")], ["avion", "barco"]);
  assert.deepEqual([...viasElegidas("avion,no_rentable,cualquiera")], ["avion", "no_rentable"]);
  assert.equal(viasElegidas(undefined).size, 0);
});

test("precio de venta: con «Calcular con el precio de mercado», el mercado aunque lo venda", async () => {
  const { precioBase } = await import("@/lib/compras/sugerencia");
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 2159, mercado: 3212, ultimaHoy: 2649, conMercado: true }), { precio: 3212, de: "mercado", clasicaDudosa: false, mercadoDudoso: false });
  assert.deepEqual(precioBase({ vendiendo: true, clasica: 2159, mercado: null, ultimaHoy: 2649, conMercado: true }), { precio: 2159, de: "clasica", clasicaDudosa: false, mercadoDudoso: false });
});

test("cantidad a pedir redondeada a decenas: hasta 3 baja, desde 4 sube", async () => {
  const { redondearPedido } = await import("@/lib/compras/sugerencia");
  assert.deepEqual([72, 73, 74, 12, 14, 3, 1, 4, 0, 70, 105].map(redondearPedido), [70, 70, 80, 10, 20, 10, 10, 10, 0, 70, 110]);
});

test("cantidad del Excel del proveedor: típico, mejor o promedio de las dos cuentas", async () => {
  const { cantidadPedido } = await import("@/lib/compras/sugerencia");
  const x = { comprar_exacto: 52, comprar_mejor_exacto: 96, comprar_tipico: 50, comprar_mejor: 100 };
  assert.equal(cantidadPedido(x, "tipico"), 50);
  assert.equal(cantidadPedido(x, "mejor"), 100);
  assert.equal(cantidadPedido(x, "promedio"), 80); // (52 + 96) / 2 = 74 → 80
});

test("vendedores referentes: candidatas por parecido del título, las más parecidas primero", async () => {
  const { candidatasReferentes } = await import("@/lib/compras/precio-mercado");
  const pubs = [{ title: "Cortador De Vidrio Tipo Lapiz Alta Precision" }, { title: "Lupa Vincha 5 Lentes" }, { title: "Cortador Vidrio Lapiz" }];
  const r = candidatasReferentes("Cortador Vidrio Manual Tipo Lapiz", pubs).map((x) => x.title);
  assert.deepEqual(r, ["Cortador De Vidrio Tipo Lapiz Alta Precision", "Cortador Vidrio Lapiz"]);
});

test("vendedores referentes: criterio, marcas con derechos, grupo y número de vendedor", async () => {
  const { pasaCriterio, esMarcaConDerechos, grupoDe, vendedorDeLink } = await import("@/lib/compras/referentes");
  assert.equal(pasaCriterio({ precio: 10000, vendidos: 1000 }), true);
  assert.equal(pasaCriterio({ precio: 60000, vendidos: 50 }), true);
  assert.equal(pasaCriterio({ precio: 60000, vendidos: 10 }), false);
  assert.equal(pasaCriterio({ precio: 10000, vendidos: 500 }), false);
  assert.equal(esMarcaConDerechos("Set Lego Speed Champions"), true);
  assert.equal(esMarcaConDerechos("Bloques compatibles legos"), false);
  assert.equal(grupoDe("MLA123456", "x"), "MLA123456");
  assert.equal(grupoDe(null, "Lupa Vincha 5 Lentes!"), "lupa vincha 5 lentes");
  assert.equal(vendedorDeLink("https://listado.mercadolibre.com.ar/_CustId_137430519"), 137430519);
  assert.equal(vendedorDeLink("137430519"), 137430519);
  assert.equal(vendedorDeLink("https://www.mercadolibre.com.ar/tienda/candy-ho"), null);
});

test("vendedores referentes con IA: candidatas por palabras raras y lectura de la respuesta", async () => {
  const { candidatasDe, leerIguales, leerElegido } = await import("@/lib/compras/referentes-ia");
  const ws = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  const textos = [ws("Sensor Ultrasonido HC-SR04 Arduino"), ws("Modulo HC SR04 Ultrasonico"), ws("Rele 4 canales 5v"), ws("Arduino Uno R3")];
  const indice = new Map<string, number[]>();
  textos.forEach((s, i) => { for (const w of s) indice.set(w, [...(indice.get(w) ?? []), i]); });
  assert.deepEqual(candidatasDe(textos[0], textos, indice, 12, 0), [1]); // «Arduino Uno» comparte una sola palabra: no alcanza
  assert.deepEqual(leerIguales('{"iguales":[2,1,9]}', 3), [2, 1]);
  assert.deepEqual(leerIguales("[]", 3), []);
  assert.equal(leerIguales("no sé", 3), null);
  assert.deepEqual(leerElegido('{"n":2,"motivo":"mismo módulo"}', 3), { n: 2, motivo: "mismo módulo" });
  assert.deepEqual(leerElegido('{"n":0,"motivo":"ninguno"}', 3), { n: 0, motivo: "ninguno" });
  assert.equal(leerElegido('{"n":5}', 3), null);
});
