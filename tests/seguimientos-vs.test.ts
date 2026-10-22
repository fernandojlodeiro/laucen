// Importar los seguimientos de Virtual Seller (lib/seguimiento/importar-vs.ts): el informe «Seguimientos totales».
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerHtml } from "@/lib/importar/leer";
import { skuDeIdSeguimiento, estadoVs, tipoVs, itemDe, apodoInternacional, leerSeguimientosVs } from "@/lib/seguimiento/importar-vs";

test("el SKU sale del ID del seguimiento, sin «SEG-» ni el año y número", () => {
  assert.equal(skuDeIdSeguimiento("SKU00680-U-2026-1"), "SKU00680-U");
  assert.equal(skuDeIdSeguimiento("SKU03319-2026-1"), "SKU03319");
  assert.equal(skuDeIdSeguimiento("SEG-SKU00123-2016-12"), "SKU00123");
  assert.equal(skuDeIdSeguimiento(" seg-sku00123-u-2018-2 "), "SKU00123-U");
  assert.equal(skuDeIdSeguimiento("SKU00999"), "SKU00999");
  assert.equal(skuDeIdSeguimiento(""), null);
  assert.equal(skuDeIdSeguimiento(null), null);
});

test("estado, tipo, número de publicación y vendedores chinos", () => {
  assert.equal(estadoVs("active"), "activa");
  assert.equal(estadoVs("paused"), "pausada");
  assert.equal(estadoVs("closed"), "cerrada");
  assert.equal(estadoVs(""), "sin_dato");
  assert.equal(tipoVs("Clásica"), "gold_special");
  assert.equal(tipoVs("Premium"), "gold_pro");
  assert.equal(tipoVs("otra"), null);
  assert.equal(itemDe("MLA741557610", null), "MLA741557610");
  assert.equal(itemDe(null, "https://articulo.mercadolibre.com.ar/MLA-741557610-rele"), "MLA741557610");
  assert.equal(apodoInternacional("CNLUOYANGSHISONGPENGKUAARR"), true);
  assert.equal(apodoInternacional("CNWOLWOLARR"), true);
  assert.equal(apodoInternacional("FRA NOI"), false);
  assert.equal(apodoInternacional("CNC ARGENTINA"), false);
});

const ENC = ["Usuario ML", "Publicación en Monitoreo: Publicación", "Título", "Catalogo", "Estado", "Marca", "Modelo", "SKU", "Precio Tachado", "Precio",
  "Tipo Publicación", "Opciones de Cuotas", "Precio Pactado", "% Tolerancia Infracciones", "% Dif Precio con Precio Pactado", "Dif Precio con Precio Pactado",
  "Link a Publicación", "Monitoreo de Publicaciones: ID Seguimiento"];
const fila = (c: string[]) => `<tr>${c.map((x) => `<td>${x}</td>`).join("")}</tr>`;
const html = `<html><body><table><tr>${ENC.map((x) => `<th>${x}</th>`).join("")}</tr>
${fila(["TIENDAVIRTUAL.BAIRES", "MLA726743416", "Rele", "0", "paused", "", "", "", "", "1650,00", "Clásica", "", "", "", "", "", "https://articulo.mercadolibre.com.ar/MLA-726743416", "SKU00680-U-2026-1"])}
${fila(["INFORMATICASANISIDRO", "MLA847308250", "Placa &amp; cable", "0", "active", "", "", "618", "37990,00", "29690,10", "Clásica", "6 cuotas", "", "", "", "", "https://articulo.mercadolibre.com.ar/MLA-847308250", "SKU03319-2026-1"])}
${fila(["CNWOLWOLARR", "MLA1901801209", "Algo", "1", "active", "", "", "SZAR", "", "29302,09", "Premium", "", "", "", "", "", "", "SEG-SKU03429-2019-3"])}
</table></body></html>`;

test("lee el informe (HTML guardado como .xls)", () => {
  const filas = leerSeguimientosVs(leerHtml(new TextEncoder().encode(html).buffer as ArrayBuffer));
  assert.equal(filas.length, 3);
  const [a, b, c] = filas;
  assert.equal(a.vendedor, "TIENDAVIRTUAL.BAIRES");
  assert.equal(a.estado, "pausada");
  assert.equal(a.sku, "SKU00680-U");
  assert.equal(b.itemId, "MLA847308250");
  assert.equal(b.titulo, "Placa & cable");
  assert.equal(b.precio, 29690.1);
  assert.equal(b.precioOriginal, 37990);
  assert.equal(b.tipo, "gold_special");
  assert.equal(b.cuotas, "6 cuotas");
  assert.equal(b.sku, "SKU03319");
  assert.equal(c.catalogo, true);
  assert.equal(c.tipo, "gold_pro");
  assert.equal(c.sku, "SKU03429");
});

test("otro archivo: avisa que no es el informe", () => {
  assert.throws(() => leerSeguimientosVs({ columnas: ["SKU", "Precio"], filas: [] }), /informe de seguimientos/);
});

test("notebooks: el título de enfrente alcanza para dejarlas afuera", async () => {
  const { esTituloNotebook } = await import("@/lib/seguimiento/a-la-venta");
  assert.equal(esTituloNotebook("Notebook Lenovo Ideapad 15"), true);
  assert.equal(esTituloNotebook("  laptop hp 14"), true);
  assert.equal(esTituloNotebook("Cooler para notebook"), false);
  assert.equal(esTituloNotebook(null), false);
});
