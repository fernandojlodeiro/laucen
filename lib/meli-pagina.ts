// Lectura de la página de una publicación de Mercado Libre con Apify, para lo
// que la API no deja ver de una publicación ajena común (/up/…): precio, si
// está activa, vendedor, vendidos y disponibles. ML le devuelve una página
// anti-bot a un pedido común, así que va con Chrome (apify~web-scraper) y
// proxy residencial de Argentina, como el piloto (lib/piloto/ml.ts).
//
// Para gastar menos (Fer, 30/9: cada página costaba USD 0,04 a 0,05): varias
// publicaciones en una sola corrida, Chrome sin bajar fotos ni CSS (el proxy
// residencial cobra por lo que se baja) y 1 GB de memoria (usaba ~600 MB).

import { correrConEntrada } from "@/lib/apify";

export type LecturaPagina = {
  intento: string;
  runId?: string;
  urls: string[];
  segundos: number;
  error?: string;
  items: Record<string, unknown>[];
};

// Corre adentro de Chrome, en la página de ML. Antes de leer el texto saca los
// carruseles de productos relacionados ("+50 vendidos" del control remoto era de
// otro producto, 30/9). No se corta el texto por palabras: el menú de atajos de
// arriba de todo ya dice "Descripción" y "Preguntas", y el cuadro de compra
// (vendedor, stock) viene después de las Características.
const pageFunction = `async function pageFunction(context) {
  await new Promise((ok) => setTimeout(ok, 2000));
  const html = document.documentElement.outerHTML;
  document.querySelectorAll('[class*="recommendations"], [class*="carousel"], [id*="recommendations"], [class*="ui-pdp-related"], footer, nav')
    .forEach((e) => e.remove());
  const todo = (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ');
  const rel = todo.indexOf('Productos relacionados');
  const texto = rel > 0 ? todo.slice(0, rel) : todo;
  const clase = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; };
  const meta = (sel) => { const e = document.querySelector(sel); return e ? (e.getAttribute('content') || e.textContent || '').trim() : null; };
  const cerca = (re, largo) => { const m = texto.match(re); return m ? texto.slice(m.index, m.index + (largo || 60)).trim() : null; };
  const ld = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { ld.push(JSON.parse(s.textContent)); } catch (e) {} });
  const prod = ld.find((x) => x && (x['@type'] === 'Product' || x.offers)) || null;
  const ofertas = prod && prod.offers ? (Array.isArray(prod.offers) ? prod.offers : [prod.offers]) : [];
  const item = html.match(/"item_id":"(MLA\\d+)"/);
  const subtitulo = clase('.ui-pdp-subtitle');
  const vend = (subtitulo || texto).match(/(\\+?[\\d.]+(?: mil)?) vendidos?/i);
  const ultima = texto.match(/¡?Última (en stock|disponible)!?/i);
  const disp = (clase('.ui-pdp-buybox__quantity__available') || texto).match(/\\+?[\\d.]+ disponibles?/i);
  return {
    url: context.request.url,
    titulo_pagina: document.title,
    item_id: item ? item[1] : null,
    precio: ofertas.length ? ofertas[0].price : meta('meta[itemprop="price"]'),
    moneda: ofertas.length ? ofertas[0].priceCurrency : null,
    en_stock_ld: ofertas.length ? String(ofertas[0].availability || '').replace('https://schema.org/', '') : null,
    nombre: prod ? prod.name : null,
    subtitulo,
    vendidos: vend ? vend[1] : null,
    disponibles: ultima ? '1 (' + ultima[0] + ')' : (disp ? disp[0] : null),
    vendido_por: cerca(/Vendido por/i, 70),
    mejor_precio: cerca(/Mejor precio/i, 90),
    otras_opciones: cerca(/\\d+ productos? (nuevos?|usados?) desde/i, 60),
    pausada: /Publicación pausada|pausamos esta publicación/i.test(texto),
    finalizada: /Publicación finalizada/i.test(texto),
    texto: texto.slice(0, 4000),
  };
}`;

const INTENTOS = [
  { nombre: "Chrome AR", proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "AR" } },
  { nombre: "Chrome residencial", proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } },
];

const limpiar = (u: string) => u.replace(/[?#].*$/, "");

/** Link o código → link de la página. MLAU… es producto del vendedor (/up/);
 *  un MLA… suelto puede ser ficha de catálogo (/p/) o publicación: `esCatalogo`
 *  lo decide (con la API). */
export async function aLink(x: string, esCatalogo: (id: string) => Promise<boolean>): Promise<string | null> {
  const l = x.trim();
  if (/^https?:\/\/\S*mercadolibre\.com\.ar\//i.test(l)) return l;
  const up = l.match(/^MLAU-?(\d+)$/i);
  if (up) return `https://www.mercadolibre.com.ar/up/MLAU${up[1]}`;
  const m = l.match(/^MLA-?(\d+)$/i);
  if (!m) return null;
  return (await esCatalogo(`MLA${m[1]}`))
    ? `https://www.mercadolibre.com.ar/p/MLA${m[1]}`
    : `https://articulo.mercadolibre.com.ar/MLA-${m[1]}`;
}

/** Lee varias páginas en una corrida; las que no traen la publicación se
 *  reintentan juntas con otra conexión. Devuelve cada corrida. Nunca tira. */
export async function leerPaginas(urls: string[]): Promise<LecturaPagina[]> {
  let faltan = [...new Set(urls.map(limpiar))];
  const out: LecturaPagina[] = [];
  for (const x of INTENTOS) {
    if (!faltan.length) break;
    const t0 = Date.now();
    const c = await correrConEntrada("apify~web-scraper", {
      startUrls: faltan.map((url) => ({ url })), maxRequestsPerCrawl: faltan.length, maxConcurrency: 2, maxRequestRetries: 3,
      pageFunction, injectJQuery: false, downloadMedia: false, downloadCss: false, proxyConfiguration: x.proxy,
    }, { max: faltan.length, esperaSeg: 200, topeUsd: 0.1 * faltan.length, memoria: 1024 })
      .catch((e) => ({ items: [], error: String(e), runId: undefined }));
    const items = (c.items ?? []) as Record<string, unknown>[];
    out.push({ intento: x.nombre, runId: c.runId, urls: faltan, segundos: Math.round((Date.now() - t0) / 1000), error: c.error, items });
    const bien = new Set(items.filter((i) => i.item_id || i.precio).map((i) => limpiar(String(i.url))));
    faltan = faltan.filter((u) => !bien.has(u));
  }
  return out;
}
