// La precarga de un mayorista desde el chat (lib/mensajes/mayorista.ts): qué datos se aceptan. Sin base.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { datosMayorista } from "@/lib/mensajes/mayorista";

const wa = { canal: "whatsapp" as const, externo: "5493515551234" };

test("con razón social y el WhatsApp desde el que escribe alcanza", () => {
  assert.deepEqual(datosMayorista({ razon_social: "  Electro  Sur SRL ", contacto: "Ana Gómez" }, wa),
    { razon_social: "Electro Sur SRL", contacto: "Ana Gómez", cuit: "", email: "", telefono: "5493515551234" });
});

test("el teléfono que da manda sobre el del chat, normalizado", () => {
  const d = datosMayorista({ razon_social: "Electro Sur", telefono: "0351 15 444-1234" }, wa);
  assert.ok(!("motivo" in d) && d.telefono === "5493514441234");
});

test("sin razón social, con un mail mal escrito o un CUIT que no cierra, no se guarda y se pide de nuevo", () => {
  assert.ok("motivo" in datosMayorista({ razon_social: "" }, wa));
  assert.ok("motivo" in datosMayorista({ razon_social: "Electro Sur", email: "ana@" }, wa));
  assert.ok("motivo" in datosMayorista({ razon_social: "Electro Sur", cuit: "20-12345678-0" }, wa));
  assert.equal((datosMayorista({ razon_social: "Electro Sur", cuit: "30-71430633-9" }, wa) as { cuit: string }).cuit, "30714306339");
});

test("en Instagram hace falta un mail o un teléfono (el chat no trae número)", () => {
  const ig = { canal: "instagram" as const, externo: "1784012345" };
  assert.ok("motivo" in datosMayorista({ razon_social: "Electro Sur" }, ig));
  assert.equal((datosMayorista({ razon_social: "Electro Sur", email: "Ana@Sur.com" }, ig) as { email: string }).email, "ana@sur.com");
});
