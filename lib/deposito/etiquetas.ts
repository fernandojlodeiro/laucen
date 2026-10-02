// Códigos de barras para etiquetas (de producto y de ubicación): SVG con
// bwip-js. EAN-13 si el código es un EAN válido de 13 dígitos; si no, Code 128.

import bwipjs from "bwip-js/node";

function esEan13(c: string) {
  if (!/^\d{13}$/.test(c)) return false;
  const d = c.split("").map(Number);
  const suma = d.slice(0, 12).reduce((s, x, i) => s + x * (i % 2 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === d[12];
}

/** SVG del código de barras (con el texto debajo). */
export function codigoBarrasSvg(codigo: string, alto = 12): string {
  const ean = esEan13(codigo);
  return bwipjs.toSVG({ bcid: ean ? "ean13" : "code128", text: codigo, height: alto, includetext: true, textxalign: "center", textsize: 9 });
}

/** SVG de un QR. */
export function qrSvg(texto: string): string {
  return bwipjs.toSVG({ bcid: "qrcode", text: texto, scale: 2 });
}
