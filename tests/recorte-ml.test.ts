// La etiqueta del PDF de ML se recorta midiendo dónde está (Fer, 5/10: con un
// recorte fijo, a las que caían más abajo o medían más se les cortaba el QR).
// Sin base: arma páginas A4 apaisadas como las de ML.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, rgb } from "pdf-lib";
import { recorteEtiquetaMl } from "@/lib/deposito/recorte-ml";

/** Una página de ML: el marco de la etiqueta en (x, y) de ancho × alto, el
 *  "QR" en la esquina de abajo a la derecha, la línea de puntos y, a la
 *  derecha, el resumen de productos. */
async function paginaMl(x: number, y: number, ancho: number, alto: number) {
  const d = await PDFDocument.create();
  const p = d.addPage([841.89, 595.28]);
  p.drawRectangle({ x, y, width: ancho, height: alto, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
  p.drawRectangle({ x: x + ancho - 50, y: y + 5, width: 45, height: 45, color: rgb(0, 0, 0) });
  p.drawText("Remitente", { x: x + 30, y: y + alto - 20, size: 7 });
  p.drawLine({ start: { x: 295.65, y: 556 }, end: { x: 295.65, y: 34 }, thickness: 0.5, dashArray: [1.7, 1.1] });
  p.drawRectangle({ x: 383, y: 486, width: 360, height: 42 });
  p.drawText("Resumen de productos", { x: 397, y: 500, size: 9 });
  // Como llega de ML: un PDF ya grabado.
  return (await PDFDocument.load(await d.save())).getPage(0);
}

test("recorte de la etiqueta de ML: sigue al marco, con el QR adentro y sin el resumen", async () => {
  for (const [x, y, ancho, alto] of [[31, 145, 255, 421], [31, 40, 255, 421], [40, 20, 250, 520], [20, 200, 270, 380]]) {
    const r = recorteEtiquetaMl(await paginaMl(x, y, ancho, alto));
    assert.ok(r, "encuentra la etiqueta");
    assert.ok(r.left <= x && r.bottom <= y && r.top >= y + alto, `marco entero (${JSON.stringify(r)})`);
    assert.ok(r.right >= x + ancho && r.right < 296, `hasta la línea de puntos (${JSON.stringify(r)})`);
    assert.ok(r.left > x - 10 && r.bottom > y - 10 && r.top < y + alto + 10, "sin aire de más");
  }
});

test("recorte de la etiqueta de ML: una página en blanco no da recorte", async () => {
  const d = await PDFDocument.create();
  assert.equal(recorteEtiquetaMl(d.addPage([841.89, 595.28])), null);
});
