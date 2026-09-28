// Lee la publicación de Alibaba por dentro: los precios por cantidad (el del
// pedido mínimo es el que vale, Fer 28/9) y la caja de envío por unidad.
// Piloto #9: la búsqueda decía US$ 3,99–5,80 y la página, 10,8 / 9,72 / 8,99.
//
// El actor abre la página del producto ("Include product details"). Cómo
// nombra cada campo no está verificado: se busca por nombre en todo el
// resultado y se guarda una muestra cruda para revisarlo.

import { correrActor } from "@/lib/apify";
import type { Ficha, Tramo } from "./tipos";

export const ACTOR_FICHA = "tortuga~alibaba-scraper";

type Nodo = unknown;
const esObj = (x: Nodo): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  return null;
}

/** Recorre todo el objeto y devuelve [clave, valor] de cada nodo. */
function* recorrer(x: Nodo, clave = "", prof = 0): Generator<[string, Nodo]> {
  if (prof > 8) return;
  yield [clave, x];
  if (Array.isArray(x)) for (const v of x) yield* recorrer(v, clave, prof + 1);
  else if (esObj(x)) for (const [k, v] of Object.entries(x)) yield* recorrer(v, k, prof + 1);
}

export function tramosDe(x: Nodo): Tramo[] {
  for (const [k, v] of recorrer(x)) {
    if (!Array.isArray(v) || v.length < 1 || !v.every(esObj)) continue;
    if (!/tier|ladder|price|range|quantity/i.test(k)) continue;
    const tramos = (v as Record<string, unknown>[]).map((t) => {
      const ks = Object.keys(t);
      const kPrecio = ks.find((c) => /price|usd|amount|value/i.test(c) && !/original|old|list/i.test(c));
      const kDesde = ks.find((c) => /^(min|from|start|begin)|minimum/i.test(c))
        ?? ks.find((c) => /quantity|qty/i.test(c) && !/^(max|to|end)/i.test(c));
      const kHasta = ks.find((c) => /^(max|to|end)|maxq|max_?qty/i.test(c));
      const usd = kPrecio ? numero(t[kPrecio]) : null;
      const desde = kDesde ? numero(t[kDesde]) : null;
      return usd != null && desde != null ? { desde, hasta: kHasta ? numero(t[kHasta]) : null, usd } : null;
    }).filter((t): t is Tramo => !!t && t.usd > 0);
    if (tramos.length) return tramos.sort((a, b) => a.desde - b.desde);
  }
  return [];
}

export function cajaDe(x: Nodo): Ficha["caja"] {
  let dims: number[] | null = null, kg: number | null = null;
  for (const [k, v] of recorrer(x)) {
    // tortuga~alibaba-scraper: packaging.unitSizeCm = "55X45X35", packaging.unitWeightKg = 8 (piloto #10).
    if (!dims && /(package|packing|packaging|carton|box).*(size|dimension)|^dimensions?$|unit.?size|size.?cm/i.test(k)) {
      if (typeof v === "string") {
        const ns = (v.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
        if (ns.length >= 3) dims = ns.slice(0, 3).map((n) => (/inch|\bin\b/i.test(v) ? n * 2.54 : /\bmm\b/i.test(v) ? n / 10 : n));
      } else if (esObj(v)) {
        const l = numero(v.length ?? v.l), w = numero(v.width ?? v.w), h = numero(v.height ?? v.h);
        if (l && w && h) dims = [l, w, h];
      }
    }
    if (kg == null && /gross.?weight|package.?weight|single.?weight|unit.?weight|^weight$/i.test(k) && (typeof v === "string" || typeof v === "number")) {
      const n = numero(v);
      if (n) kg = typeof v === "string" && /\bg\b|gram/i.test(v) && !/kg/i.test(v) ? n / 1000 : typeof v === "string" && /lb/i.test(v) ? n * 0.4536
        : typeof v === "number" && n > 200 && !/kg/i.test(k) ? n / 1000 : n; // un número suelto de más de 200 son gramos
    }
  }
  return dims ? { largo: Math.round(dims[0]), ancho: Math.round(dims[1]), alto: Math.round(dims[2]), kg: kg ?? 0 } : null;
}

export async function leerFicha(url: string): Promise<Ficha & { costoUsd: number; runId?: string }> {
  const r = await correrActor(ACTOR_FICHA, "", 1, 90, { urlBusqueda: url });
  const item = (r.items ?? [])[0] as Record<string, unknown> | undefined;
  const base = { costoUsd: r.costo_usd ?? 0, runId: r.runId };
  if (!item) return { ...base, ok: false, error: r.error ?? "no trajo la publicación", muestra: JSON.stringify(r.entrada ?? {}).slice(0, 500) };
  const tramos = tramosDe(item);
  const caja = cajaDe(item);
  return { ...base, ok: tramos.length > 0, tramos, caja, ...(tramos.length ? {} : { error: "la publicación no muestra precios por cantidad (suele pasar cuando el precio depende de la variante); se usa el más alto de la búsqueda" }),
    muestra: JSON.stringify(item).slice(0, 4000) };
}

/** Precio del pedido mínimo: el del primer tramo (el más caro). */
export const precioMinimo = (f?: Ficha | null) => (f?.tramos?.length ? f.tramos[0].usd : null);
