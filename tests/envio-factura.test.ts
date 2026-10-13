// Mandar la factura por WhatsApp (lib/facturacion/envio.ts): a quién le corresponde
// y la plantilla de Meta. Pura, sin base ni red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { correspondeWhatsapp, plantillaFactura, PLANTILLA_FACTURA } from "@/lib/facturacion/envio";

const base = { tipo_cbte: 6, factura_por_whatsapp: true, whatsapp: "5493511234567", canal_tipo: "web_minorista", chat_reciente: false };

test("correspondeWhatsapp: venta por fuera de ML con WhatsApp confirmado y la casilla tildada", () => {
  assert.equal(correspondeWhatsapp(base).ok, true);
});

test("correspondeWhatsapp: casilla destildada, sin WhatsApp o nota de crédito → no", () => {
  assert.equal(correspondeWhatsapp({ ...base, factura_por_whatsapp: false }).ok, false);
  assert.equal(correspondeWhatsapp({ ...base, whatsapp: null }).ok, false);
  assert.equal(correspondeWhatsapp({ ...base, tipo_cbte: 8 }).ok, false);
});

test("correspondeWhatsapp: venta de ML sólo si nos escribió por WhatsApp por esa compra", () => {
  assert.equal(correspondeWhatsapp({ ...base, canal_tipo: "mercadolibre" }).ok, false);
  assert.equal(correspondeWhatsapp({ ...base, canal_tipo: "mercadolibre", chat_reciente: true }).ok, true);
});

test("plantillaFactura: utilidad, dos variables en el texto y botón con el enlace al PDF", () => {
  const p = plantillaFactura("https://laucen.com");
  assert.equal(p.name, PLANTILLA_FACTURA);
  assert.equal(p.category, "UTILITY");
  const cuerpo = p.components[0] as { text: string };
  assert.match(cuerpo.text, /\{\{1\}\}.*\{\{2\}\}/);
  const botones = (p.components[1] as { buttons: { url: string }[] }).buttons;
  assert.equal(botones[0].url, "https://laucen.com/api/factura/{{1}}");
});
