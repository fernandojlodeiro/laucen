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

// Corre adentro de Chrome, en la página de ML. Lee sólo la parte de arriba
// (precio, cuadro de compra, vendedor): lo de abajo son productos relacionados
// de otros vendedores ("+50 vendidos" del control remoto, 30/9).
const pageFunction = `async function pageFunction(context) {
  await new Promise((ok) => setTimeout(ok, 2000));
  const html = document.documentElement.outerHTML;
  const todo = (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ');
  const corte = ['Productos relacionados', 'Características del producto', 'Características principales', 'Descripción', 'Preguntas']
    .map((m) => todo.indexOf(m)).filter((i) => i > 0);
  const texto = todo.slice(0, corte.length ? Math.min(...corte) : 3000);
  const meta = (sel) => { const e = document.querySelector(sel); return e ? (e.getAttribute('content') || e.textContent || '').trim() : null; };
  const cerca = (re, largo) => { const m = texto.match(re); return m ? texto.slice(m.index, m.index + (largo || 60)).trim() : null; };
  const ld = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { ld.push(JSON.parse(s.textContent)); } catch (e) {} });
  const prod = ld.find((x) => x && (x['@type'] === 'Product' || x.offers)) || null;
  const ofertas = prod && prod.offers ? (Array.isArray(prod.offers) ? prod.offers : [prod.offers]) : [];
  const item = html.match(/"item_id":"(MLA\\d+)"/);
  const ultima = /¡?Última (en stock|disponible)/i.test(texto);
  const disp = texto.match(/\\+?([\\d.]+) disponibles?/i);
  const vend = texto.match(/(\\+?[\\d.]+(?: mil)?) vendidos?/i);
  return {
    url: context.request.url,
    titulo_pagina: document.title,
    item_id: item ? item[1] : null,
    precio: ofertas.length ? ofertas[0].price : meta('meta[itemprop="price"]'),
    moneda: ofertas.length ? ofertas[0].priceCurrency : null,
    en_stock_ld: ofertas.length ? String(ofertas[0].availability || '').replace('https://schema.org/', '') : null,
    nombre: prod ? prod.name : null,
    vendidos: vend ? vend[1] : null,
    disponibles: ultima ? '1 (Última en stock)' : (disp ? disp[0] : null),
    vendido_por: cerca(/Vendido por/i, 70),
    mejor_precio: cerca(/Mejor precio/i, 90),
    otras_opciones: cerca(/\\d+ productos? (nuevos?|usados?) desde/i, 60),
    pausada: /Publicación pausada|pausamos esta publicación/i.test(texto),
    finalizada: /Publicación finalizada/i.test(texto),
    texto_arriba: texto.slice(0, 1200),
  };
}`;

const INTENTOS = [
  { nombre: "Chrome AR", proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "AR" } },
  { nombre: "Chrome residencial", proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } },
];

const limpiar = (u: string) => u.replace(/[?#].*$/, "");

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
