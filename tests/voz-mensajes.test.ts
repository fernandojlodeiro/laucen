// Cuándo la IA de la tienda contesta con nota de voz (lib/mensajes/voz.ts, copiado de CadaMes).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { correspondeAudio, esSoloLinkNumeroOEmoji, extension, LARGO_MAXIMO_PARA_HABLAR } from "@/lib/mensajes/voz";

describe("nota de voz de la IA", () => {
  const base = { voz: "mujer" as const, siempre: false, entradaFueAudio: true, texto: "Sí, lo tenemos: sale $ 5.854 cada uno." };
  it("apagada, nunca", () => assert.equal(correspondeAudio({ ...base, voz: "apagado" }), false));
  it("en espejo: a quien mandó audio sí, a quien escribió no", () => {
    assert.equal(correspondeAudio(base), true);
    assert.equal(correspondeAudio({ ...base, entradaFueAudio: false }), false);
  });
  it("con «siempre», también a quien escribió", () => assert.equal(correspondeAudio({ ...base, entradaFueAudio: false, siempre: true }), true));
  it("un texto largo, sólo texto", () => assert.equal(correspondeAudio({ ...base, texto: "a".repeat(LARGO_MAXIMO_PARA_HABLAR + 1) }), false));
  it("sólo un link o un número, sólo texto", () => {
    assert.equal(esSoloLinkNumeroOEmoji("https://daitom.com.ar/producto/504"), true);
    assert.equal(esSoloLinkNumeroOEmoji("$ 5.854,56"), true);
    assert.equal(correspondeAudio({ ...base, texto: "https://daitom.com.ar/producto/504" }), false);
  });
  it("el archivo para el transcriptor, por su tipo", () => {
    assert.equal(extension("audio/ogg"), "ogg");
    assert.equal(extension("audio/mp4"), "mp4");
    assert.equal(extension("audio/webm"), "webm");
  });
});
