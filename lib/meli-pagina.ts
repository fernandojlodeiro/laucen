// Lectura de la página de una publicación de Mercado Libre con Apify, para lo
// que la API no deja ver de una publicación ajena común (/up/…): precio, si
// está activa, vendedor, vendidos y disponibles. ML le devuelve una página
// anti-bot a un pedido común, así que va con Chrome (apify~web-scraper) y
// proxy residencial de Argentina, como el piloto (lib/piloto/ml.ts).

import { correrConEntrada, costosFinales } from "@/lib/apify";

export type LecturaPagina = {
  url: string;
  intento: string;
  runId?: string;
  costoUsd: number | null;
  segundos: number;
  error?: string;
  datos?: Record<string, unknown>;
};

// Corre adentro de Chrome, en la página de ML. Junta cada dato de más de un
// lado (metadatos, JSON-LD, texto visible) para ver cuál sirve.
const pageFunction = `async function pageFunction(context) {
  await new Promise((ok) => setTimeout(ok, 2500));
  const html = document.documentElement.outerHTML;
  const texto = (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ');
  const meta = (sel) => { const e = document.querySelector(sel); return e ? (e.getAttribute('content') || e.textContent || '').trim() : null; };
  const cerca = (re, largo) => { const m = texto.match(re); return m ? texto.slice(Math.max(0, m.index - 20), m.index + (largo || 80)).trim() : null; };
  const ld = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { ld.push(JSON.parse(s.textContent)); } catch (e) {} });
  const prod = ld.find((x) => x && (x['@type'] === 'Product' || x.offers)) || null;
  const ofertas = prod && prod.offers ? (Array.isArray(prod.offers) ? prod.offers : [prod.offers]) : [];
  const item = html.match(/"item_id":"(MLA\\d+)"/);
  return {
    url: context.request.url,
    titulo_pagina: document.title,
    largo_html: html.length,
    item_id: item ? item[1] : null,
    precio_meta: meta('meta[itemprop="price"]'),
    moneda_meta: meta('meta[itemprop="priceCurrency"]'),
    precio_ld: ofertas.map((o) => ({ precio: o.price, moneda: o.priceCurrency, disponibilidad: o.availability, vendedor: o.seller && o.seller.name })),
    nombre_ld: prod ? prod.name : null,
    vendidos: cerca(/\\+?[\\d.]+ vendidos?/i, 40),
    disponibles: cerca(/\\(\\+?[\\d.]+ disponibles?\\)|[\\d.]+ disponibles?/i, 40),
    vendido_por: cerca(/Vendido por/i, 80),
    pausada: /Publicación pausada|pausamos esta publicación/i.test(texto),
    finalizada: /Publicación finalizada|finalizó/i.test(texto),
    otras_opciones: cerca(/\\d+ productos? nuevos? desde/i, 60),
    mejor_precio: cerca(/Mejor precio/i, 120),
    texto_inicio: texto.slice(0, 1500),
  };
}`;

const INTENTOS = [
  { nombre: "Chrome AR", proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "AR" } },
  { nombre: "Chrome residencial", proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } },
];

/** Lee una página; si el primer intento no trae la publicación, prueba el
 *  segundo. Devuelve cada intento con su costo. Nunca tira. */
export async function leerPagina(url: string): Promise<LecturaPagina[]> {
  const limpia = url.replace(/[?#].*$/, "");
  const out: LecturaPagina[] = [];
  for (const x of INTENTOS) {
    const t0 = Date.now();
    const c = await correrConEntrada("apify~web-scraper", {
      startUrls: [{ url: limpia }], maxRequestsPerCrawl: 1, maxConcurrency: 1, maxRequestRetries: 3,
      pageFunction, injectJQuery: false, proxyConfiguration: x.proxy,
    }, { max: 1, esperaSeg: 120, topeUsd: 0.1 }).catch((e) => ({ items: [], error: String(e), costoUsd: null, runId: undefined }));
    const datos = c.items?.[0] as Record<string, unknown> | undefined;
    out.push({ url: limpia, intento: x.nombre, runId: c.runId, costoUsd: c.costoUsd ?? null,
      segundos: Math.round((Date.now() - t0) / 1000), error: c.error, datos });
    if (datos?.item_id || datos?.precio_meta || (datos?.precio_ld as unknown[] | undefined)?.length) break;
  }
  return out;
}

/** Apify asienta el cobro un rato después de terminar: se relee el costo final. */
export async function conCostoFinal(lecturas: LecturaPagina[]) {
  await new Promise((ok) => setTimeout(ok, 8000));
  const finales = await costosFinales(lecturas.map((l) => l.runId).filter((x): x is string => !!x));
  return lecturas.map((l) => ({ ...l, costoUsd: (l.runId && finales[l.runId]?.usd) ?? l.costoUsd }));
}
