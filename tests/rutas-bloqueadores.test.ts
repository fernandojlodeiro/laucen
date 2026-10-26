// Ninguna pantalla puede tener en su dirección una palabra que los bloqueadores de anuncios cortan (Fer, 26/10).
//
// Pasó: Informes › Embudo de publicidad vivía en /informes/embudo-publicidad. El bloqueador del navegador de Fer
// cortaba el archivo de la pantalla (su nombre lleva la dirección) por decir «publicidad»: la pantalla se veía, pero
// ningún botón andaba, ni el menú de arriba, y recargar no lo arreglaba. Sin un solo error a la vista.
//
// Vale también para lo que el navegador pide por su cuenta (una imagen, un fetch): lo corta igual.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const PROHIBIDAS = /publicidad|anuncio|banner|advert|sponsor|promo|(^|[-_])ads?($|[-_])/i;

/** Las direcciones que el navegador nunca carga como archivo o pedido de la página, con el motivo. */
const EXCEPTUADAS: Record<string, string> = {
  "/api/meli/publicidad": "la llama pg_cron desde la base, nunca un navegador",
  "/api/meta-ads/conectar/ir": "es una página entera a la que se va (no la corta un bloqueador) y Meta tiene cargada esta dirección",
  "/api/meta-ads/conectar/callback": "la vuelta de Meta, cargada así en la app de Meta",
  "/api/google-ads/conectar/ir": "es una página entera a la que se va y Google tiene cargada esta dirección",
  "/api/google-ads/conectar/callback": "la vuelta de Google, cargada así en el cliente OAuth",
};

/** PENDIENTES de otra sesión (banners de la tienda, 26/10): cada uno con su motivo. Se sacan de acá al renombrarlos. */
const PENDIENTES: Record<string, string> = {
  "/config/tienda/banners": "pantalla de banners de la tienda: renombrar (la está trabajando otra sesión)",
  "/api/tienda/banners-drive": "trae los banners del Drive: renombrar con la pantalla",
  "/api/tienda/banner-drive/[id]": "las imágenes de los banners en la tienda: un visitante con bloqueador no las ve",
  "/informes/promociones": "a revisar: «promociones» puede estar en las listas de los bloqueadores",
};

function rutas(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) {
      const seg = n.startsWith("(") ? "" : `/${n}`;
      out.push(...rutas(p, `${base}${seg}`));
    } else if (/^(page|route)\.tsx?$/.test(n)) out.push(base || "/");
  }
  return out;
}

test("ninguna dirección del sistema tiene una palabra que cortan los bloqueadores de anuncios", () => {
  const malas = rutas(path.join(process.cwd(), "app"))
    .filter((r) => r.split("/").some((seg) => PROHIBIDAS.test(seg)))
    .filter((r) => !(r in EXCEPTUADAS) && !(r in PENDIENTES));
  assert.deepEqual(malas, [], `Estas direcciones las corta un bloqueador de anuncios: ${malas.join(", ")}. Elegí otra palabra.`);
});

test("las excepciones y los pendientes existen (si se renombró, sacalo de la lista)", () => {
  const todas = new Set(rutas(path.join(process.cwd(), "app")));
  const viejas = [...Object.keys(EXCEPTUADAS), ...Object.keys(PENDIENTES)].filter((r) => !todas.has(r));
  assert.deepEqual(viejas, []);
});
