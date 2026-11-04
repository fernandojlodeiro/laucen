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

describe("los links no se dicen", () => {
  it("los renglones con link van escritos; el resto, en la voz", async () => {
    const { partirParaVoz } = await import("@/lib/mensajes/voz");
    const r = partirParaVoz("¡Sí, lo tenemos! Sale $ 5.854 cada uno. Te paso el link por escrito.\nConversor CP2102: https://daitom.com.ar/producto/504");
    assert.equal(r.hablado, "¡Sí, lo tenemos! Sale $ 5.854 cada uno. Te paso el link por escrito.");
    assert.equal(r.escrito, "Conversor CP2102: https://daitom.com.ar/producto/504");
  });
  it("sin links, todo en la voz y nada escrito", async () => {
    const { partirParaVoz } = await import("@/lib/mensajes/voz");
    assert.deepEqual(partirParaVoz("Retirás en barrio General Paz, de 9 a 18."), { hablado: "Retirás en barrio General Paz, de 9 a 18.", escrito: null });
  });
  it("un link sin https también", async () => {
    const { partirParaVoz } = await import("@/lib/mensajes/voz");
    assert.equal(partirParaVoz("Miralo\ndaitom.com.ar/producto/696").escrito, "daitom.com.ar/producto/696");
  });
});

describe("los productos no se detallan hablando", () => {
  it("lo de abajo del --- va escrito entero; arriba, lo que se dice", async () => {
    const { partirParaVoz, sinSeparador } = await import("@/lib/mensajes/voz");
    const t = "Tengo tres opciones, te paso la lista con los links para que las veas.\n---\n- Impresora A1 Mini — $ 300.000\nhttps://daitom.com.ar/producto/1\n- Impresora K1 — $ 500.000\nhttps://daitom.com.ar/producto/2";
    const r = partirParaVoz(t);
    assert.equal(r.hablado, "Tengo tres opciones, te paso la lista con los links para que las veas.");
    assert.equal(r.escrito, "- Impresora A1 Mini — $ 300.000\nhttps://daitom.com.ar/producto/1\n- Impresora K1 — $ 500.000\nhttps://daitom.com.ar/producto/2");
    assert.ok(!sinSeparador(t).includes("---"));
  });
});
