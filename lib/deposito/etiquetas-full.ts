// Etiquetas de producto para mandar a Full de Mercado Libre (orden de
// Cowork, bitácora #288; pedido de Fer 3/10): las mismas que baja la Central
// de vendedores de ML ("Descargá las etiquetas para tus productos"), para
// pegar en cada unidad (o pack) antes de mandarla a Full.
//
// El código de barras es el inventory_id de la publicación (o de la
// variante): el "Código ML", ej. YVCG00146. Es fijo por publicación, no
// depende del envío. Laucen lo tiene en meli_item.datos_externos (lo que
// trajo ML); si falta, se le pide a ML (GET /items/{id}, sólo lectura) y se
// guarda.
//
// Disposición copiada del ZPL de ML (50 × 25 mm, 203 dpi = 8 puntos por mm):
//   barras Code 128, módulo 2 puntos (0,25 mm), 54 puntos de alto, arriba
//   y centradas (y = 18); el código en texto y en negrita debajo (base en
//   y = 98); el título de la publicación de ML en hasta 2 renglones
//   (y = 115, x = 22, caja de 370 puntos); un renglón más en negrita con la
//   variante (y = 150).
// Impresoras: térmica de rollo (una etiqueta de 50 × 25 por página) o A4
// (3 × 10 por hoja, con borde fino para cortar).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import bwipjs from "bwip-js/node";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { cuentaDelCanal, ml } from "@/lib/mercadolibre/api";

import { POR_HOJA_FULL, type PublicacionFull } from "./etiquetas-full-tipos";
export * from "./etiquetas-full-tipos";

/** SQL: el inventory_id de una fila de meli_item (`m`): el de su variante,
 *  o el de la publicación si no tiene variantes. */
const SQL_CODIGO = `case when coalesce(m.variation_id, '') = '' then m.datos_externos->'ml'->>'inventory_id'
  else (select v->>'inventory_id' from jsonb_array_elements(case when jsonb_typeof(m.datos_externos->'ml'->'variations') = 'array'
          then m.datos_externos->'ml'->'variations' else '[]'::jsonb end) v where v->>'id' = m.variation_id limit 1) end`;
const SQL_SKU = "coalesce((select v.sku from publicacion pu join variacion v on v.id = pu.variacion_id where pu.id = m.publicacion_id), m.sku)";

/** Buscar publicaciones de ML del canal por SKU (el nuestro o el de ML),
 *  título, atributos, categoría, número de publicación o de variante de ML, o Código ML, con la regla común de lib/busqueda.ts. `comienza`: al principio del texto. */
export async function buscarPublicacionesFull(org: string, canalId: number, q: string, comienza: boolean): Promise<PublicacionFull[]> {
  const t = q.trim();
  if (t.length < 2) return [];
  return consulta<PublicacionFull>(`
    select m.item_id, coalesce(m.variation_id, '') variation_id, m.titulo, m.atributos, ${SQL_SKU} sku, ${SQL_CODIGO} codigo, m.logistica
      from meli_item m
     where m.organizacion_id = $1 and m.canal_id = $2 and coalesce(m.estado, '') <> 'closed'
       and ${sqlBusqueda("$3", [SQL_SKU, "m.sku", "m.titulo", "m.atributos", "m.item_id", "m.variation_id", "m.categoria", SQL_CODIGO])}
     order by (${SQL_CODIGO}) is null, m.titulo limit 40`, [org, canalId, parametroBusqueda(t, comienza)]);
}

/** Esas publicaciones (claves "item~variación"), con su código. */
export async function publicacionesFull(org: string, canalId: number, claves: { item: string; variacion: string }[]): Promise<PublicacionFull[]> {
  if (!claves.length) return [];
  return consulta<PublicacionFull>(`
    select m.item_id, coalesce(m.variation_id, '') variation_id, m.titulo, m.atributos, ${SQL_SKU} sku, ${SQL_CODIGO} codigo, m.logistica
      from meli_item m join unnest($3::text[], $4::text[]) k(item, variacion) on k.item = m.item_id and k.variacion = coalesce(m.variation_id, '')
     where m.organizacion_id = $1 and m.canal_id = $2`, [org, canalId, claves.map((k) => k.item), claves.map((k) => k.variacion)]);
}

/** Si la publicación no tiene el Código ML guardado, se lo pide a ML (sólo
 *  lectura) y lo guarda en meli_item. Devuelve la publicación al día. */
export async function completarCodigoFull(org: string, canalId: number, item: string, variacion: string): Promise<PublicacionFull> {
  const [p] = await publicacionesFull(org, canalId, [{ item, variacion }]);
  if (!p) throw new ErrorErp("Esa publicación no está en Laucen.");
  if (p.codigo) return p;
  const cuenta = await cuentaDelCanal(org, canalId);
  if (!cuenta) return p;
  const r = await ml<{ inventory_id?: string | null; variations?: { id: number | string; inventory_id?: string | null }[] }>(
    cuenta, "GET", `/items/${encodeURIComponent(item)}?attributes=id,inventory_id,variations`);
  if (r.status !== 200 || typeof r.datos !== "object" || !r.datos) return p;
  const codigo = variacion ? r.datos.variations?.find((v) => String(v.id) === variacion)?.inventory_id ?? null : r.datos.inventory_id ?? null;
  if (!codigo) return p;
  // Se guarda donde lo deja la sincronización con ML.
  if (variacion) {
    await consulta(`update meli_item set datos_externos = jsonb_set(coalesce(datos_externos, '{}'), '{ml,variations}', $5::jsonb, true)
                     where organizacion_id = $1 and canal_id = $2 and item_id = $3 and variation_id = $4`,
      [org, canalId, item, variacion, JSON.stringify(r.datos.variations ?? [])]);
  } else {
    await consulta(`update meli_item set datos_externos = jsonb_set(coalesce(datos_externos, '{"ml": {}}'), '{ml,inventory_id}', to_jsonb($4::text), true)
                     where organizacion_id = $1 and canal_id = $2 and item_id = $3 and coalesce(variation_id, '') = ''`, [org, canalId, item, codigo]);
  }
  return { ...p, codigo };
}

// ── El PDF ───────────────────────────────────────────────

const MM = 72 / 25.4;
const ANCHO = 50 * MM, ALTO = 25 * MM;
/** Un punto de la térmica (203 dpi) en puntos de PDF. */
const P = 25.4 / 203 * MM;

/** Lo que va en una etiqueta. */
export type EtiquetaFull = { codigo: string; titulo: string; variante: string | null };

// Lo que la fuente estándar (WinAnsi) sabe dibujar; lo demás, "?".
const limpio = (s: string) => [...s.normalize("NFC")].map((ch) => {
  const c = ch.charCodeAt(0);
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) ? ch : "?";
}).join("");

/** Corta en renglones de `ancho`; el último, con "…" si sobra texto. */
function renglones(s: string, f: PDFFont, tam: number, ancho: number, max: number): string[] {
  const palabras = limpio(s).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let linea = "";
  for (const w of palabras) {
    const prueba = linea ? `${linea} ${w}` : w;
    if (f.widthOfTextAtSize(prueba, tam) <= ancho) { linea = prueba; continue; }
    if (linea) out.push(linea);
    linea = w;
    if (out.length === max) break;
  }
  if (out.length < max && linea) out.push(linea);
  if (out.length === max && out.join(" ").length < palabras.join(" ").length) {
    let u = out[max - 1];
    while (u.length > 1 && f.widthOfTextAtSize(`${u}…`, tam) > ancho) u = u.slice(0, -1);
    out[max - 1] = `${u.trimEnd()}…`;
  }
  return out.map((r) => { let x = r; while (x.length > 1 && f.widthOfTextAtSize(x, tam) > ancho) x = x.slice(0, -1); return x; });
}

type Lienzo = { f: PDFFont; fb: PDFFont; barras: Map<string, { img: PDFImage; modulos: number }> };

/** Una etiqueta con la esquina de abajo a la izquierda en (x0, y0). */
function dibujar(l: Lienzo, p: PDFPage, x0: number, y0: number, e: EtiquetaFull) {
  const arriba = y0 + ALTO;
  const b = l.barras.get(e.codigo)!;
  // Barras: módulo de 2 puntos, 54 de alto, desde y = 18, centradas.
  const bw = Math.min(b.modulos * 2 * P, ANCHO - 4 * MM);
  p.drawImage(b.img, { x: x0 + (ANCHO - bw) / 2, y: arriba - (18 + 54) * P, width: bw, height: 54 * P });
  // El código, en negrita, con la base en y = 98.
  const tc = 22 * P * 0.95, cw = l.fb.widthOfTextAtSize(e.codigo, tc);
  p.drawText(e.codigo, { x: x0 + (ANCHO - cw) / 2, y: arriba - 98 * P, size: tc, font: l.fb, color: rgb(0, 0, 0) });
  // El título de ML, hasta 2 renglones, desde x = 22 e y = 115.
  const tt = 18 * P * 0.95, anchoT = 370 * P;
  renglones(e.titulo, l.f, tt, anchoT, 2).forEach((r, i) =>
    p.drawText(r, { x: x0 + 22 * P, y: arriba - 115 * P - tt * 0.8 - i * 17.5 * P, size: tt, font: l.f, color: rgb(0, 0, 0) }));
  // La variante (si tiene), en negrita, en y = 150.
  if (e.variante) {
    const [r] = renglones(e.variante, l.fb, tt, anchoT, 1);
    if (r) p.drawText(r, { x: x0 + 22 * P, y: arriba - 150 * P - tt * 0.8, size: tt, font: l.fb, color: rgb(0, 0, 0) });
  }
}

/** El PDF: térmica, una etiqueta de 50 × 25 por página; A4, 3 × 10 por
 *  hoja con borde fino (`desde`: en qué posición de la primera hoja empieza,
 *  1 a 30, para aprovechar una hoja usada). */
export async function armarPdfFull(etiquetas: EtiquetaFull[], o: { impresora: "termica" | "a4"; desde?: number }): Promise<{ pdf: Uint8Array; paginas: number }> {
  const doc = await PDFDocument.create();
  doc.setTitle("Etiquetas de Full");
  const l: Lienzo = { f: await doc.embedFont(StandardFonts.Helvetica), fb: await doc.embedFont(StandardFonts.HelveticaBold), barras: new Map() };
  for (const e of etiquetas) if (!l.barras.has(e.codigo)) {
    // Un píxel por módulo: el ancho del PNG es la cantidad de módulos.
    const png = await bwipjs.toBuffer({ bcid: "code128", text: e.codigo, scale: 1, scaleY: 1, height: 10, includetext: false, paddingwidth: 0 });
    const img = await doc.embedPng(png);
    l.barras.set(e.codigo, { img, modulos: img.width });
  }
  if (o.impresora === "termica") {
    for (const e of etiquetas) dibujar(l, doc.addPage([ANCHO, ALTO]), 0, 0, e);
  } else {
    // Medido en el PDF de ML: la primera, a 12,6 mm del borde izquierdo y
    // 3,9 mm del de arriba, de 50,2 × 25,1 mm con borde. El resto de la
    // grilla, repartido parejo (no verificado contra una hoja entera de ML).
    const [W, H] = [595.28, 841.89];
    const cw = 50.2 * MM, ch = 25.1 * MM, mx = 12.6 * MM, my = 3.9 * MM;
    const gx = (W - 2 * mx - 3 * cw) / 2, gy = (H - 2 * my - 10 * ch) / 9;
    const desde = Math.min(Math.max(Math.trunc(o.desde ?? 1), 1), POR_HOJA_FULL) - 1;
    let p: PDFPage | null = null;
    etiquetas.forEach((e, i) => {
      const n = i + desde, pos = n % POR_HOJA_FULL;
      if (!p || pos === 0) p = doc.addPage([W, H]);
      const x = mx + (pos % 3) * (cw + gx), y = H - my - (Math.floor(pos / 3) + 1) * ch - Math.floor(pos / 3) * gy;
      p.drawRectangle({ x, y, width: cw, height: ch, borderWidth: 0.4, borderColor: rgb(0.6, 0.6, 0.6) });
      dibujar(l, p, x + (cw - ANCHO) / 2, y + (ch - ALTO) / 2, e);
    });
  }
  if (!doc.getPageCount()) doc.addPage(o.impresora === "termica" ? [ANCHO, ALTO] : [595.28, 841.89]);
  return { pdf: await doc.save(), paginas: doc.getPageCount() };
}
