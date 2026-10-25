// Los avisos del pedido por WhatsApp (lib/mensajes/avisos-pedido.ts): el texto dentro de las 24 h y la
// plantilla de Meta para fuera de la ventana.

import { test } from "node:test";
import assert from "node:assert/strict";
import { plantillaAviso, textoAviso } from "@/lib/mensajes/avisos-pedido";

test("el texto dentro de las 24 h lleva el link escrito y no menciona un botón", () => {
  const t = textoAviso("listo_retirar", "Fernando", 150422, "https://daitom.com.ar/pedido/abc");
  assert.match(t, /^Hola Fernando, tu pedido #150422 ya está listo para retirar\./);
  assert.ok(!t.includes("botón"));
  assert.ok(t.endsWith("Ver tu pedido: https://daitom.com.ar/pedido/abc"));
});

test("sin nombre, «Hola,» a secas; la nota del despacho va en el medio", () => {
  const t = textoAviso("despachado", "", 1, null, "OCA 123");
  assert.ok(t.startsWith("Hola, despachamos tu pedido #1."));
  assert.ok(t.includes("OCA 123"));
});

test("la plantilla: utilidad, en es_AR, con el botón al pedido", () => {
  const p = plantillaAviso("pagado", "https://daitom.com.ar");
  assert.equal(p.name, "pedido_pagado");
  assert.equal(p.category, "UTILITY");
  const botones = (p.components[1] as { buttons: { url: string }[] }).buttons;
  assert.equal(botones[0].url, "https://daitom.com.ar/pedido/{{1}}");
});
