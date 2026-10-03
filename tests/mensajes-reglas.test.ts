// Las reglas de la carpeta de mensajes de WhatsApp (lib/mensajes/reglas.ts) y
// la firma de Meta (lib/mensajes/meta.ts), sin base ni red.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { conQuienHablaban, ecosDelCambio, esOrdenDeMando, loQueDijo, mismoTelefono, revisarMarca, sinLaMarca, telefonoLindo, ultimos10, ventanaAbierta } from "@/lib/mensajes/reglas";
import { firmaValida, firmarEstado, verificarEstado } from "@/lib/mensajes/meta";

describe("ecos de coexistencia", () => {
  it("la persona es `to`, no `from`", () => {
    assert.equal(conQuienHablaban({ from: "5493510000000", to: "+54 9 351 555-1234" }), "5493515551234");
  });
  it("lo que dijo: texto, epígrafe, otro tipo; borrado y corregido no", () => {
    assert.equal(loQueDijo({ type: "text", text: { body: " hola " } }), "hola");
    assert.equal(loQueDijo({ type: "image", image: { caption: "mirá" } }), "mirá");
    assert.equal(loQueDijo({ type: "audio" }), "(contestó desde el teléfono)");
    assert.equal(loQueDijo({ type: "revoke" }), null);
    assert.equal(loQueDijo({ type: "edit", text: { body: "x" } }), null);
  });
  it("saca los ecos del cambio", () => {
    assert.equal(ecosDelCambio({ message_echoes: [{ to: "1" }] }).length, 1);
    assert.deepEqual(ecosDelCambio({ messages: [] }), []);
  });
});

describe("la marca del teléfono", () => {
  it("sólo al principio", () => {
    assert.equal(esOrdenDeMando("  * te atiendo yo", "*"), true);
    assert.equal(esOrdenDeMando("son 2*3", "*"), false);
    assert.equal(sinLaMarca("* pasale el link", "*"), "pasale el link");
  });
  it("no se aceptan letras ni números", () => {
    assert.equal(revisarMarca("H").ok, false);
    assert.equal(revisarMarca("").ok, false);
    assert.equal(revisarMarca("*****").ok, false);
    assert.deepEqual(revisarMarca(" // "), { ok: true, marca: "//" });
  });
});

describe("ventana de 24 horas", () => {
  const ahora = new Date("2026-10-03T12:00:00Z");
  it("abierta dentro de las 24 h, cerrada después o sin mensajes", () => {
    assert.equal(ventanaAbierta("2026-10-02T13:00:00Z", ahora), true);
    assert.equal(ventanaAbierta("2026-10-02T11:59:00Z", ahora), false);
    assert.equal(ventanaAbierta(null, ahora), false);
  });
});

describe("teléfonos", () => {
  it("compara el 549 de WhatsApp con cómo se carga en Argentina", () => {
    assert.equal(ultimos10("0351 15 555-1234"), "3515551234");
    assert.equal(mismoTelefono("5493515551234", "0351 15 555-1234"), true);
    assert.equal(mismoTelefono("5493515551234", "+54 9 351 555 1234"), true);
    assert.equal(mismoTelefono("5493515551234", "3515551235"), false);
    assert.equal(mismoTelefono("123", "123"), false);
  });
  it("se muestra lindo", () => {
    assert.equal(telefonoLindo("5493515551234"), "+54 9 351 555-1234");
    assert.equal(telefonoLindo("14155550000"), "+14155550000");
  });
});

describe("firma de Meta y estado del alta", () => {
  it("acepta sólo lo firmado con el secreto de la app", () => {
    process.env.META_APP_SECRET = "secreto-de-prueba";
    const cuerpo = '{"entry":[]}';
    const firma = "sha256=" + createHmac("sha256", "secreto-de-prueba").update(cuerpo).digest("hex");
    assert.equal(firmaValida(cuerpo, firma), true);
    assert.equal(firmaValida(cuerpo + " ", firma), false);
    assert.equal(firmaValida(cuerpo, null), false);
    assert.equal(firmaValida(cuerpo, "sha256=00"), false);
  });
  it("el estado firmado vuelve igual y no se puede tocar", () => {
    process.env.META_APP_SECRET = "secreto-de-prueba";
    const e = firmarEstado({ org: "o1", usuario: "u1" });
    assert.equal(verificarEstado(e)?.org, "o1");
    const [cuerpo, firma] = e.split(".");
    const otro = Buffer.from(JSON.stringify({ org: "o2", usuario: "u1", vence: Date.now() + 1e6 })).toString("base64url");
    assert.equal(verificarEstado(`${otro}.${firma}`), null);
    assert.equal(verificarEstado(`${cuerpo}.x`), null);
  });
});
