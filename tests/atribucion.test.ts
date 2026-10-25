// De qué anuncio vino cada uno (lib/publicidad/atribucion.ts): puro, sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { atribucionDeParametros, atribucionDeReferral, aGalleta, deGalleta } from "@/lib/publicidad/atribucion";

const ahora = new Date("2026-10-25T12:00:00Z");
const p = (q: string) => atribucionDeParametros(new URLSearchParams(q), ahora);

test("el link de un anuncio de Meta con los parámetros recomendados: plataforma, anuncio y campaña", () => {
  assert.deepEqual(p("utm_source=meta&utm_medium=paid&utm_campaign=Primavera&utm_content=120212345678901234&fbclid=abc"), {
    plataforma: "meta", anuncio_id: "120212345678901234", campana: "Primavera", fuente: "meta", medio: "paid", ts: ahora.toISOString(),
  });
});

test("sólo el clid de cada plataforma alcanza para saber de cuál vino", () => {
  assert.equal(p("fbclid=x")?.plataforma, "meta");
  assert.equal(p("gclid=x")?.plataforma, "google");
  assert.equal(p("ttclid=x")?.plataforma, "tiktok");
  assert.equal(p("utm_source=instagram")?.plataforma, "meta");
});

test("sin anuncio ni utm no hay atribución; un utm de otra cosa queda como campaña sin plataforma", () => {
  assert.equal(p("q=notebook"), null);
  assert.equal(p(""), null);
  const otro = p("utm_source=newsletter&utm_campaign=octubre");
  assert.equal(otro?.plataforma, null);
  assert.equal(otro?.fuente, "newsletter");
  assert.equal(p("utm_source=meta&utm_content=texto")?.anuncio_id, null);
});

test("el anuncio que Meta pega al primer mensaje de WhatsApp o de Instagram", () => {
  assert.equal(atribucionDeReferral({ source_type: "ad", source_id: "1202", headline: "Notebooks" }, ahora)?.anuncio_id, "1202");
  assert.equal(atribucionDeReferral({ source: "ADS", type: "OPEN_THREAD", ad_id: "998877" }, ahora)?.anuncio_id, "998877");
  assert.equal(atribucionDeReferral({ source_type: "post", source_id: "5" }, ahora), null);
  assert.equal(atribucionDeReferral(undefined, ahora), null);
});

test("la galleta va y vuelve; una rota o vieja no inventa nada", () => {
  const a = p("utm_source=meta&utm_content=1234567")!;
  assert.deepEqual(deGalleta(aGalleta(a)), a);
  assert.equal(deGalleta("{no es json"), null);
  assert.equal(deGalleta(""), null);
});
