// Tests de las etiquetas de Full (bitácora #288): el PDF sale en 50 × 25 mm
// (una por página) o en A4 de 3 × 10, y "desde" corre la primera etiqueta.
// No usan la base.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { armarPdfFull } from "@/lib/deposito/etiquetas-full";

const e = (codigo: string) => ({ codigo, titulo: "Potenciometro Lineal 500k con un título bastante largo para que corte en dos renglones", variante: null });

test("Full: térmica, una etiqueta de 50 × 25 mm por página", async () => {
  const r = await armarPdfFull([e("YVCG00146"), e("YVCG00146"), { ...e("ABC123"), variante: "Color: Negro" }], { impresora: "termica" });
  const d = await PDFDocument.load(r.pdf);
  assert.equal(d.getPageCount(), 3);
  const { width, height } = d.getPage(0).getSize();
  assert.ok(Math.abs(width - 50 * 72 / 25.4) < 0.1 && Math.abs(height - 25 * 72 / 25.4) < 0.1);
});

test("Full: A4 de 30 por hoja, y empezando en la posición 25 pasa a la segunda hoja", async () => {
  const diez = Array.from({ length: 10 }, () => e("YVCG00146"));
  const a = await armarPdfFull(diez, { impresora: "a4" });
  assert.equal(a.paginas, 1);
  const b = await armarPdfFull(diez, { impresora: "a4", desde: 25 });
  assert.equal(b.paginas, 2);
  const d = await PDFDocument.load(b.pdf);
  assert.equal(Math.round(d.getPage(0).getSize().width), 595);
});
