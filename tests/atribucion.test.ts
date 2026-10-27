// De dónde vino cada uno (lib/publicidad/atribucion.ts): puro, sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aGalleta, atribucionDe, atribucionDeReferral, codigoInvisible, codigoRef, conCodigo, credito, deGalleta, directo,
  entradaDeParametros, entradaDeVisita, LETRAS_REF, sacarCodigo, sumarEntrada,
} from "@/lib/publicidad/atribucion";

const ahora = new Date("2026-10-25T12:00:00Z");
const dias = (n: number) => new Date(ahora.getTime() + n * 86_400_000);
const p = (q: string, cuando = ahora) => entradaDeParametros(new URLSearchParams(q), cuando);
const visita = (q: string, referer: string | null, cuando = ahora) => entradaDeVisita(new URLSearchParams(q), referer, "daitom.com.ar", cuando);

test("el link de un anuncio de Meta con los parámetros recomendados: plataforma, anuncio, campaña y el fbclid", () => {
  assert.deepEqual(p("utm_source=meta&utm_medium=paid&utm_campaign=Primavera&utm_content=120212345678901234&fbclid=abc"), {
    tipo: "anuncio", plataforma: "meta", anuncio_id: "120212345678901234", campana: "Primavera", fuente: "meta", medio: "paid", clid: "abc", ts: ahora.toISOString(),
  });
});

test("sólo el clid de cada plataforma alcanza para saber de cuál vino", () => {
  assert.equal(p("fbclid=x")?.plataforma, "meta");
  assert.equal(p("gclid=x")?.plataforma, "google");
  assert.equal(p("ttclid=x")?.plataforma, "tiktok");
  assert.equal(p("utm_source=instagram")?.plataforma, "meta");
});

test("un utm de otra cosa es una campaña sin plataforma; sin utm no hay anuncio", () => {
  assert.equal(p("q=notebook"), null);
  const otro = p("utm_source=newsletter&utm_campaign=octubre");
  assert.equal(otro?.tipo, "campana");
  assert.equal(otro?.plataforma, null);
  assert.equal(p("utm_source=meta&utm_content=texto")?.anuncio_id, null);
});

test("de dónde llegó una visita sin anuncio: buscador, Mercado Libre, red social, otra página o directo", () => {
  assert.equal(visita("", "https://www.google.com/").tipo, "organico");
  assert.equal(visita("", "https://www.google.com/").fuente, "google");
  assert.equal(visita("", "https://articulo.mercadolibre.com.ar/MLA-1").tipo, "mercadolibre");
  assert.equal(visita("", "https://l.instagram.com/?u=x").tipo, "social");
  assert.equal(visita("", "https://www.foro.com.ar/hilo").tipo, "referido");
  assert.equal(visita("", null).tipo, "directo");
  assert.equal(visita("gclid=Cj0", "https://www.google.com/").tipo, "anuncio");
});

test("la regla de los 30 días: el último anuncio, aunque después haya vuelto por otro lado", () => {
  let x = sumarEntrada(null, visita("", "https://www.google.com/", dias(-40)), dias(-40));
  x = sumarEntrada(x, visita("gclid=G1&utm_source=google&utm_content=111111", null, dias(-20)), dias(-20));
  x = sumarEntrada(x, visita("fbclid=F1&utm_source=meta&utm_content=222222", null, dias(-10)), dias(-10));
  x = sumarEntrada(x, visita("", "https://articulo.mercadolibre.com.ar/MLA-1", dias(-1)), dias(-1));
  assert.equal(x.primera.tipo, "organico");
  assert.equal(x.ultima.tipo, "mercadolibre");
  assert.equal(credito(x, ahora).anuncio_id, "222222");
  // A los 31 días del último anuncio, ya no cuenta: va la última entrada.
  assert.equal(credito(x, dias(25)).tipo, "mercadolibre");
});

test("sin anuncio en 30 días, el crédito es de la última entrada", () => {
  let x = sumarEntrada(null, visita("fbclid=F1", null, dias(-45)), dias(-45));
  x = sumarEntrada(x, visita("", "https://www.google.com/", dias(-2)), dias(-2));
  assert.equal(credito(x, ahora).tipo, "organico");
  assert.equal(x.anuncios.length, 0);
});

test("lo que se guarda: lo acreditado, la primera entrada, el visitante y por dónde llegó", () => {
  const x = sumarEntrada(null, visita("gclid=G1&utm_source=google", null), ahora);
  const a = atribucionDe(x, "v-123456789", "web", ahora);
  assert.equal(a.plataforma, "google");
  assert.equal(a.primera?.tipo, "anuncio");
  assert.equal(a.visitante, "v-123456789");
  assert.equal(a.desde, "web");
  assert.equal(atribucionDe(null, null, "web", ahora).tipo, "directo");
  assert.equal(directo(ahora).desde, "directo");
});

test("el anuncio que Meta pega al primer mensaje de WhatsApp o de Instagram", () => {
  assert.equal(atribucionDeReferral({ source_type: "ad", source_id: "1202", headline: "Notebooks" }, ahora)?.anuncio_id, "1202");
  assert.equal(atribucionDeReferral({ source: "ADS", type: "OPEN_THREAD", ad_id: "998877" }, ahora)?.desde, "mensaje");
  assert.equal(atribucionDeReferral({ source_type: "post", source_id: "5" }, ahora), null);
  assert.equal(atribucionDeReferral(undefined, ahora), null);
});

test("el sello va y vuelve en la galleta; uno roto no inventa nada", () => {
  const x = sumarEntrada(null, p("utm_source=meta&utm_content=1234567")!, ahora);
  assert.deepEqual(deGalleta(aGalleta(x)), x);
  assert.equal(deGalleta("{no es json"), null);
  assert.equal(deGalleta(""), null);
  assert.equal(deGalleta(JSON.stringify({ plataforma: "meta", ts: "x" })), null);
});

test("el código invisible del botón de WhatsApp: no se ve, va y vuelve, y se saca del texto", () => {
  for (let i = 0; i < 50; i++) {
    const c = codigoRef();
    assert.ok([...c].every((l) => LETRAS_REF.includes(l)));
    const t = conCodigo("Hola Daitom, tengo una consulta.", c);
    assert.equal(t.replace(/[​-‍⁠⁣]/g, ""), "Hola Daitom, tengo una consulta.");
    assert.deepEqual(sacarCodigo(`${t}\n¿Tienen la impresora?`), { codigo: c, limpio: "Hola Daitom, tengo una consulta.\n¿Tienen la impresora?" });
  }
  assert.equal(codigoInvisible("A7K2").length, 14);
  assert.deepEqual(sacarCodigo("Hola, tengo una consulta"), { codigo: null, limpio: "Hola, tengo una consulta" });
});

test("el sufijo recomendado de Google: plataforma y anuncio ({creative} es el id del anuncio)", () => {
  const g = p("utm_source=google&utm_medium=cpc&utm_campaign=2134567890&utm_content=678901234567&gclid=Cj0");
  assert.equal(g?.plataforma, "google");
  assert.equal(g?.anuncio_id, "678901234567");
});

test("los robots no son visitas: buscadores, vistas previas de links y revisores de anuncios", async () => {
  const { esRobot } = await import("@/lib/publicidad/atribucion");
  for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "AdsBot-Google (+http://www.google.com/adsbot.html)",
    "facebookexternalhit/1.1", "WhatsApp/2.23.20.0", "curl/8.4.0", null, ""]) assert.equal(esRobot(ua), true, String(ua));
  for (const ua of ["Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0"]) assert.equal(esRobot(ua), false, ua);
});
