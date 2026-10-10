// Pautas de las publicaciones nuevas en ML: título, marca y descripción. Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogoSegunMarca, esMarcaReemplazable, limpiarDescripcion, marcaFinal, mezclarTitulo } from "@/lib/mercadolibre/pautas";

test("mezclarTitulo: la primera palabra queda, las demás son las mismas en otro orden, distinto por cuenta y hasta 60 letras", () => {
  const t = "Zocalo Ic Socket 40 P 40 Pin Dip 40 Wide Body P/soldar";
  const a = mezclarTitulo(t, "10:clasica:SKU00600"), b = mezclarTitulo(t, "8:clasica:SKU00600");
  assert.ok(a.startsWith("Zocalo ") && b.startsWith("Zocalo "));
  assert.notEqual(a, t);
  assert.notEqual(a, b);
  assert.deepEqual(a.split(" ").sort(), t.split(" ").sort());
  assert.equal(mezclarTitulo(t, "10:clasica:SKU00600"), a, "la misma semilla da el mismo título");
  const largo = mezclarTitulo("Transistor " + "Palabra ".repeat(20), "x");
  assert.ok(largo.length <= 60 && largo.startsWith("Transistor"));
});

test("marcaFinal: los «sin marca» y Arduino llevan la de la cuenta; las de fábrica quedan", () => {
  assert.deepEqual(marcaFinal([{ id: "BRAND", value_name: "Genérica" }], "Laucen"), { marca: "Laucen", cambiada: true });
  assert.deepEqual(marcaFinal([{ id: "BRAND", value_name: "Arduino" }], "Daitom"), { marca: "Daitom", cambiada: true });
  assert.deepEqual(marcaFinal([], "Deirolab"), { marca: "Deirolab", cambiada: true });
  assert.deepEqual(marcaFinal([{ id: "BRAND", value_name: "Mastech" }], "Daitom"), { marca: "Mastech", cambiada: false });
  assert.deepEqual(marcaFinal([{ id: "BRAND", value_name: "Daitom" }], "Daitom"), { marca: "Daitom", cambiada: false });
  assert.ok(esMarcaReemplazable("TIENDAVIRTUAL") && esMarcaReemplazable("OEM") && !esMarcaReemplazable("Raspberry Pi"));
});

test("catalogoSegunMarca: con la marca cambiada, sólo un catálogo de esa misma marca", () => {
  assert.equal(catalogoSegunMarca("MLA1", { marca: "Daitom", decision: "entra" }, { marca: "Daitom", cambiada: true }), "MLA1");
  assert.equal(catalogoSegunMarca("MLA1", { marca: "Arduino", decision: "entra" }, { marca: "Daitom", cambiada: true }), null);
  assert.equal(catalogoSegunMarca("MLA1", { marca: "Mastech", decision: "entra" }, { marca: "Mastech", cambiada: false }), "MLA1");
  assert.equal(catalogoSegunMarca("MLA1", { marca: "Riotecno", decision: "no_entra" }, { marca: "Riotecno", cambiada: false }), null);
});

test("limpiarDescripcion: saca el encabezado y el pie de la casa y deja lo técnico", () => {
  const tv = "Tiendavirtual - Importadores de la mejor tecnología con mas de 20 años de trayectoria\r\n-----------------------------------------------\nPack x 100 Unidades \r\nResistencias 1/4w 330 Ohm 0.25w Metal Film 5%\r\n\r\nLa imagen es a titulo Ilustrativo.\n-----------------------------------------------\r\n\r\nLlevamos más de 20 años proveyendo soluciones en informática, electrónica y tecnología.\r\nEnviamos a todo el país con seguro y seguimiento online.\r\nTodos nuestros productos son nuevos y originales. \r\nRealizamos factura A o B según corresponda.\r\nSi ves la publicación es porque tenemos stock, no es necesario que consultes.";
  assert.equal(limpiarDescripcion(tv), "Pack x 100 Unidades \nResistencias 1/4w 330 Ohm 0.25w Metal Film 5%\n\nLa imagen es a titulo Ilustrativo.");
  const dl = "Somos Deirolab - Importadores de la mejor tecnología - Ventas a por mayor y al gremio\nMedidor 3 en 1 Suelo Ph\r\n\r\nRango de ph: 3.5 a 8\n-----------------------------------------------------\r\n\r\nEnviamos a todo el país con seguro y seguimiento online.\r\nTodos nuestros productos son nuevos y originales.";
  assert.equal(limpiarDescripcion(dl), "Medidor 3 en 1 Suelo Ph\n\nRango de ph: 3.5 a 8");
  assert.equal(limpiarDescripcion("Controlador LCD 12864\n\nLector de tarjetas SD."), "Controlador LCD 12864\n\nLector de tarjetas SD.");
});
