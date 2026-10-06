// Dónde está la etiqueta en una página del PDF de ML (Fer, 5/10). El A4
// apaisado de ML trae la etiqueta a la izquierda de una línea de puntos
// vertical y, a veces, un resumen de productos a la derecha. La etiqueta no
// cae siempre en el mismo lugar ni mide siempre lo mismo (con un recorte fijo
// a algunas les quedaba afuera el QR): se mide lo que está dibujado a la
// izquierda de la línea de puntos y se recorta eso.

import { PDFArray, PDFRawStream, PDFStream, decodePDFRawStream, type PDFPage } from "pdf-lib";

export type Recorte = { left: number; bottom: number; right: number; top: number };
type M = [number, number, number, number, number, number];
type Caja = [number, number, number, number]; // x0, y0, x1, y1

const por = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const punto = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function caja(m: M, x0: number, y0: number, x1: number, y1: number): Caja {
  const ps = [punto(m, x0, y0), punto(m, x1, y0), punto(m, x0, y1), punto(m, x1, y1)];
  const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function bytesDe(s: unknown): Uint8Array | null {
  if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode();
  if (s instanceof PDFStream) return s.getContents();
  return null;
}

/** El contenido de la página, decodificado y en un solo texto. */
function contenido(pg: PDFPage): string {
  const c = pg.node.Contents();
  const partes = c instanceof PDFArray ? c.asArray().map((x) => pg.doc.context.lookup(x)) : [c];
  return partes.map((p) => { const b = bytesDe(p); return b ? Buffer.from(b).toString("latin1") : ""; }).join("\n");
}

type Tok = { op: string } | { n: number } | { otro: true };

/** Los operadores con sus operandos (números; lo demás cuenta como operando
 *  sin valor). Saltea textos, nombres, arreglos y las imágenes en línea. */
function* tokens(s: string): Generator<Tok> {
  let i = 0;
  const n = s.length;
  const blanco = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
  const delim = (c: string) => blanco(c) || "()<>[]{}/%".includes(c);
  while (i < n) {
    const c = s[i];
    if (blanco(c)) { i++; continue; }
    if (c === "%") { while (i < n && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (c === "(") {
      let prof = 0;
      for (; i < n; i++) {
        if (s[i] === "\\") { i++; continue; }
        if (s[i] === "(") prof++;
        else if (s[i] === ")" && --prof === 0) { i++; break; }
      }
      yield { otro: true }; continue;
    }
    if (c === "<" && s[i + 1] !== "<") { i = s.indexOf(">", i) + 1 || n; yield { otro: true }; continue; }
    if (c === "<" || c === ">") { i += 2; continue; }
    if (c === "[" || c === "]" || c === "{" || c === "}") { i++; continue; }
    if (c === "/") { i++; while (i < n && !delim(s[i])) i++; yield { otro: true }; continue; }
    let j = i;
    while (j < n && !delim(s[j])) j++;
    if (j === i) { i++; continue; } // un delimitador suelto
    const w = s.slice(i, j);
    i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) { yield { n: Number(w) }; continue; }
    if (w === "BI") {
      // Imagen en línea: hasta " EI".
      const fin = s.indexOf("EI", s.indexOf("ID", i));
      i = fin < 0 ? n : fin + 2;
      yield { op: "BI" }; continue;
    }
    yield { op: w };
  }
}

/** Las cajas de lo dibujado en la página (rectángulos, trazos, imágenes y
 *  texto) y las líneas de puntos verticales largas (la que separa la
 *  etiqueta del resumen). */
function dibujado(pg: PDFPage): { cajas: Caja[]; verticales: number[] } {
  const cajas: Caja[] = [];
  const verticales: number[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  let rayado = false; // línea de puntos (operador d con guiones)
  const pila: [M, boolean][] = [];
  let tm: M = [1, 0, 0, 1, 0, 0], tlm: M = [1, 0, 0, 1, 0, 0];
  let tam = 10, interlinea = 0;
  let ops: number[] = [];
  let tramo: { desde: [number, number] } | null = null;

  const texto = (largo: number) => {
    const m = por(tm, ctm);
    cajas.push(caja(m, 0, -tam * 0.25, Math.max(largo, 1) * tam * 0.5, tam));
  };

  for (const t of tokens(contenido(pg))) {
    if ("n" in t) { ops.push(t.n); continue; }
    if ("otro" in t) { ops.push(NaN); continue; }
    const o = ops;
    ops = [];
    switch (t.op) {
      case "q": pila.push([ctm, rayado]); break;
      case "Q": [ctm, rayado] = pila.pop() ?? [[1, 0, 0, 1, 0, 0], false]; break;
      case "d": rayado = o.length > 1 && o.slice(0, -1).some((x) => x > 0); break;
      case "cm": if (o.length >= 6) ctm = por(o.slice(-6) as M, ctm); break;
      case "re": if (o.length >= 4) { const [x, y, w, h] = o.slice(-4); cajas.push(caja(ctm, Math.min(x, x + w), Math.min(y, y + h), Math.max(x, x + w), Math.max(y, y + h))); } break;
      case "m": if (o.length >= 2) { const p = punto(ctm, o[o.length - 2], o[o.length - 1]); tramo = { desde: p }; cajas.push([...p, ...p]); } break;
      case "l": if (o.length >= 2) {
        const p = punto(ctm, o[o.length - 2], o[o.length - 1]);
        cajas.push([...p, ...p]);
        if (rayado && tramo && Math.abs(tramo.desde[0] - p[0]) < 0.5 && Math.abs(tramo.desde[1] - p[1]) > 250) verticales.push(p[0]);
        tramo = { desde: p };
      } break;
      case "c": case "v": case "y":
        for (let k = 0; k + 1 < o.length; k += 2) { const p = punto(ctm, o[k], o[k + 1]); cajas.push([...p, ...p]); }
        tramo = null; break;
      // Una imagen ocupa el cuadrado 1 × 1 (en sus coordenadas).
      case "Do": case "BI": cajas.push(caja(ctm, 0, 0, 1, 1)); break;
      case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case "Tf": if (o.length >= 1 && Number.isFinite(o[o.length - 1])) tam = Math.abs(o[o.length - 1]); break;
      case "TL": if (o.length >= 1) interlinea = o[o.length - 1]; break;
      case "Td": case "TD": if (o.length >= 2) {
        const [tx, ty] = o.slice(-2);
        if (t.op === "TD") interlinea = -ty;
        tlm = por([1, 0, 0, 1, tx, ty], tlm); tm = tlm;
      } break;
      case "Tm": if (o.length >= 6) { tlm = o.slice(-6) as M; tm = tlm; } break;
      case "T*": tlm = por([1, 0, 0, 1, 0, -interlinea], tlm); tm = tlm; break;
      case "Tj": case "TJ": texto(4); break;
      case "'": case "\"": tlm = por([1, 0, 0, 1, 0, -interlinea], tlm); tm = tlm; texto(4); break;
    }
  }
  return { cajas: cajas.filter((c) => c.every(Number.isFinite)), verticales };
}

/** El recorte de la etiqueta en una página de ML: lo dibujado a la izquierda
 *  de la línea de puntos (o en toda la página, si no hay), con un margen. null
 *  si no se encuentra nada razonable. */
export function recorteEtiquetaMl(pg: PDFPage): Recorte | null {
  const { width: W, height: H } = pg.getSize();
  let d: ReturnType<typeof dibujado>;
  try { d = dibujado(pg); } catch { return null; }
  const corte = d.verticales.filter((x) => x > W * 0.2 && x < W * 0.8).sort((a, b) => a - b)[0] ?? W;
  // Lo de la izquierda del corte; sin los fondos del tamaño de la página.
  const izq = d.cajas.filter((c) => c[0] < corte - 1 && !(c[2] - c[0] > W * 0.9 && c[3] - c[1] > H * 0.9));
  if (!izq.length) return null;
  const m = 3;
  const r: Recorte = {
    left: Math.max(0, Math.min(...izq.map((c) => c[0])) - m),
    bottom: Math.max(0, Math.min(...izq.map((c) => c[1])) - m),
    right: Math.min(corte - 1, W, Math.max(...izq.map((c) => c[2])) + m),
    top: Math.min(H, Math.max(...izq.map((c) => c[3])) + m),
  };
  if (r.right - r.left < 100 || r.top - r.bottom < 150) return null;
  return r;
}
