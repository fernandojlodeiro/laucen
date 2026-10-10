// Textos de cada canal (lib/canales/textos.ts): firma, reglas y encabezado/pie. Sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { agregarFirma, conFirma, descripcionCopiada, descripcionDelCanal, instruccionesExtra, TEXTOS_VACIOS } from "@/lib/canales/textos";

test("conFirma: la firma va al final y nunca se corta; el cuerpo se achica para entrar en el tope", () => {
  assert.equal(conFirma("Hola, sí tenemos.", "Saludos, el equipo de Daitom", 350), "Hola, sí tenemos.\nSaludos, el equipo de Daitom");
  const r = conFirma("x".repeat(400), "Firma", 350);
  assert.equal(r.length, 350);
  assert.ok(r.endsWith("\nFirma"));
  assert.equal(conFirma("Hola", "", 350), "Hola");
});

test("descripcionDelCanal: encabezado, técnica y pie; los vacíos no dejan renglones", () => {
  assert.equal(descripcionDelCanal("Técnica", { encabezado: "Arriba", pie: "Abajo" }), "Arriba\n\nTécnica\n\nAbajo");
  assert.equal(descripcionDelCanal("Técnica", { encabezado: "", pie: " " }), "Técnica");
});

test("instruccionesExtra: con firma la IA no se despide; las reglas se suman", () => {
  assert.equal(instruccionesExtra(TEXTOS_VACIOS), "");
  const x = instruccionesExtra({ ...TEXTOS_VACIOS, firma: "F", reglasIa: "Nunca sugerir un reclamo" });
  assert.match(x, /No termines con saludo/);
  assert.match(x, /Nunca sugerir un reclamo/);
});

test("agregarFirma: la agrega a lo que escribe una persona; si ya la trae, no la repite", () => {
  assert.equal(agregarFirma("Hola, sí.", "Saludos, el equipo de Daitom"), "Hola, sí.\nSaludos, el equipo de Daitom");
  assert.equal(agregarFirma("Hola, sí.\nSaludos, el equipo de Daitom", "Saludos, el equipo de Daitom"), "Hola, sí.\nSaludos, el equipo de Daitom");
  assert.equal(agregarFirma("Hola", ""), "Hola");
});

test("descripcionCopiada: cambia el encabezado y el pie de origen por los de destino; si no coinciden, va tal cual", () => {
  const origen = { encabezado: "Somos A", pie: "Gracias A" }, destino = { encabezado: "Somos B", pie: "Gracias B" };
  assert.deepEqual(descripcionCopiada("Somos A\r\n\r\nTécnica\n\nGracias A", origen, destino),
    { texto: "Somos B\n\nTécnica\n\nGracias B", tecnica: "Técnica", separada: true });
  assert.equal(descripcionCopiada("Otro encabezado\nTécnica", origen, destino).separada, false);
  assert.equal(descripcionCopiada("Otro encabezado\nTécnica", origen, destino).texto, "Otro encabezado\nTécnica");
  assert.equal(descripcionCopiada("Técnica", { encabezado: "", pie: "" }, destino).separada, false);
});
