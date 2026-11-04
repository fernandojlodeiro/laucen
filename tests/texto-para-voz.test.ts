// Preparar un texto para que se escuche bien, no para que se lea bien
// (doc 74, bitácora #205 — bug real de la prueba de Fer con Garden Sur).

import { test } from "node:test";
import assert from "node:assert/strict";

import { textoParaVoz, numeroAPalabras } from "@/lib/mensajes/texto-para-voz";

// ── El bug real, tal cual lo reportó Fer ───────────────

test("la frase exacta de la bitácora #205 sale bien", () => {
  const frase = "Son $13.500 en total (2 saldos), y el más próximo vence mañana, 10/9. ¿Te paso por dónde pagar?";
  assert.equal(
    textoParaVoz(frase),
    "Son trece mil quinientos pesos en total, dos saldos, y el más próximo vence mañana, el diez de septiembre. ¿Te paso por dónde pagar?",
  );
});

// ── numeroAPalabras: los casos que se rompen fácil ─────

test("numeroAPalabras: cien exacto, no cien-o", () => {
  assert.equal(numeroAPalabras(100), "cien");
  assert.equal(numeroAPalabras(101), "ciento uno");
});

test("numeroAPalabras: el apócope de uno, sólo cuando corresponde", () => {
  assert.equal(numeroAPalabras(1, false), "uno", "suelto, sin sustantivo detrás");
  assert.equal(numeroAPalabras(1, true), "un", "antes de un sustantivo masculino");
  assert.equal(numeroAPalabras(21, true), "veintiún");
  assert.equal(numeroAPalabras(31, true), "treinta y un");
  assert.equal(numeroAPalabras(31, false), "treinta y uno");
});

test("numeroAPalabras: el apócope se cuela hasta 'mil', no sólo hasta el final", () => {
  assert.equal(numeroAPalabras(21000, true), "veintiún mil");
  assert.equal(numeroAPalabras(1000, true), "mil", "exactamente 1000 es 'mil', nunca 'un mil'");
});

test("numeroAPalabras: miles y su resto", () => {
  assert.equal(numeroAPalabras(13500), "trece mil quinientos");
  assert.equal(numeroAPalabras(2000), "dos mil");
});

test("numeroAPalabras: millones", () => {
  assert.equal(numeroAPalabras(1000000), "un millón");
  assert.equal(numeroAPalabras(2500000), "dos millones quinientos mil");
});

// ── Montos ──────────────────────────────────────────────

test("textoParaVoz: un peso, en singular", () => {
  assert.equal(textoParaVoz("Debés $1"), "Debés un peso");
});

test("textoParaVoz: con centavos", () => {
  assert.equal(textoParaVoz("Son $1.234,50"), "Son mil doscientos treinta y cuatro pesos con cincuenta centavos");
});

test("textoParaVoz: sin miles ni decimales", () => {
  assert.equal(textoParaVoz("Cuesta $500"), "Cuesta quinientos pesos");
});

// ── Fechas y horas ──────────────────────────────────────

test("textoParaVoz: fecha sin año", () => {
  assert.equal(textoParaVoz("Vence 5/3"), "Vence el cinco de marzo");
});

test("textoParaVoz: fecha con año, el año no se lee", () => {
  assert.equal(textoParaVoz("La fecha es 10/09/2026"), "La fecha es el diez de septiembre");
});

test("textoParaVoz: hora en punto", () => {
  assert.equal(textoParaVoz("Te espero a las 9:00"), "Te espero a las nueve en punto");
});

test("textoParaVoz: hora con minutos", () => {
  assert.equal(textoParaVoz("A las 17:30"), "A las diecisiete y treinta");
});

// ── Lo que se limpia sin convertir en número ───────────

test("textoParaVoz: saca asteriscos y guiones bajos de WhatsApp", () => {
  assert.equal(textoParaVoz("*Hola* _Juan_"), "Hola Juan");
});

test("textoParaVoz: un link se reemplaza por una frase, no se lee la URL", () => {
  assert.equal(textoParaVoz("Pagás acá: https://cadames.com/pagar/abc123"), "Pagás acá: te lo paso por acá");
});

test("textoParaVoz: un emoji se saca entero", () => {
  assert.equal(textoParaVoz("Gracias 🎉 por pagar"), "Gracias por pagar");
});

test("textoParaVoz: un paréntesis se abre en una pausa entre comas", () => {
  assert.equal(textoParaVoz("Llegó tu pago (comprobante validado) y quedó al día"),
    "Llegó tu pago, comprobante validado, y quedó al día");
});

test("textoParaVoz: un paréntesis pegado al final no deja una coma colgando", () => {
  assert.equal(textoParaVoz("Llegó tu pago (comprobante validado)"), "Llegó tu pago, comprobante validado");
});

// ── Porcentajes ─────────────────────────────────────────

test("textoParaVoz: un porcentaje entero", () => {
  assert.equal(textoParaVoz("Tenés 20% de descuento"), "Tenés veinte por ciento de descuento");
});

// ── Alias / CBU: se deletrea, no se lee como cantidad ──

test("textoParaVoz: una tira larga de dígitos se deletrea con pausas", () => {
  assert.equal(textoParaVoz("El CBU es 1234567890"), "El CBU es uno, dos, tres, cuatro, cinco, seis, siete, ocho, nueve, cero");
});

test("textoParaVoz: un número corto (no es CBU) se sigue leyendo como cantidad", () => {
  assert.equal(textoParaVoz("Sos el socio 45"), "Sos el socio cuarenta y cinco");
});

// ── Lo que no toca ──────────────────────────────────────

test("textoParaVoz: un texto sin nada especial queda igual", () => {
  assert.equal(textoParaVoz("Hola, ¿en qué te puedo ayudar?"), "Hola, ¿en qué te puedo ayudar?");
});

// ── Bitácora #208: la puntuación que entona no se toca ─
//
// Es lo único que el modelo usa para saber que algo es una pregunta o una
// exclamación — sacarla (como se sospechó, sin ser la causa real) hace que
// una pregunta suene afirmativa aunque el texto diga lo mismo.

test("textoParaVoz: los signos de apertura ¿ ¡ sobreviven intactos", () => {
  assert.equal(textoParaVoz("¿Te paso por dónde abonar?"), "¿Te paso por dónde abonar?");
  assert.equal(textoParaVoz("¡Gracias por pagar!"), "¡Gracias por pagar!");
});

test("textoParaVoz: puntos, comas, punto y coma, dos puntos y puntos suspensivos quedan igual", () => {
  assert.equal(textoParaVoz("Che, esperá... ¿en serio? Sí: confirmado; gracias."),
    "Che, esperá... ¿en serio? Sí: confirmado; gracias.");
});

test("textoParaVoz: nunca modifica el texto original que recibe (no hay mutación por referencia)", () => {
  const original = "Son $500";
  const transformado = textoParaVoz(original);
  assert.equal(original, "Son $500", "el texto de WhatsApp no se toca");
  assert.notEqual(transformado, original);
});
