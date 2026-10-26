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

test("seguimiento: la reserva va en el texto y en la plantilla como tercer dato; el pago sin completar lleva «Elegir cómo pagar»", () => {
  const t = textoAviso("recordatorio", "Juan", 150421, "https://daitom.com.ar/pedido/abc", null, "el martes 28/10");
  assert.match(t, /hasta el martes 28\/10\./);
  assert.ok(!t.includes("{{"));
  const r = plantillaAviso("recibido", "https://daitom.com.ar");
  const ej = (r.components[0] as { example: { body_text: string[][] } }).example.body_text[0];
  assert.equal(ej.length, 3);
  assert.match((r.components[0] as { text: string }).text, /ves lo que compraste, cómo pagarlo y cómo recibirlo/);
  const pi = textoAviso("pago_incompleto", "Juan", 1, "https://daitom.com.ar/pedido/abc");
  assert.ok(pi.endsWith("Elegir cómo pagar: https://daitom.com.ar/pedido/abc"));
  assert.ok(!pi.includes("botón"));
});

test("la reserva anulada no tiene botón", () => {
  const p = plantillaAviso("reserva_anulada", "https://daitom.com.ar");
  assert.equal(p.components.length, 1);
  assert.ok(!textoAviso("reserva_anulada", "Juan", 1, "https://x/pedido/a").includes("https://"));
});

test("ninguna plantilla empieza o termina con un dato (Meta las rechaza)", async () => {
  for (const tipo of ["pagado", "despachado", "listo_retirar", "recibido", "pago_incompleto", "recordatorio", "ultimo_dia", "reserva_anulada"] as const) {
    const cuerpo = (plantillaAviso(tipo, "https://x").components[0] as { text: string }).text;
    assert.ok(!/^\{\{|\}\}$/.test(cuerpo.trim()), tipo);
  }
});
