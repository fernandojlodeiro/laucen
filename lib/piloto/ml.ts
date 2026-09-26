// Piloto, lado Mercado Libre. Por cada categoría:
// - "vendidos": el listado de la categoría (sin palabra, con el rango de
//   precio en la dirección) leído con Apify, ordenado por vendidos.
// - "buscados": las palabras más buscadas de las tendencias de la categoría,
//   cada una buscada gratis en el catálogo; la primera publicación dentro del
//   rango de precio.
// - cruce: qué buscados aparecen también entre los vendidos (campeones).

import { correrConEntrada } from "@/lib/apify";
import { jsonDe, pedirClaude } from "@/lib/claude";
import { ml, tokenML } from "@/lib/radar/base";
import { lecturaDeLaSemana, palabrasDe } from "@/lib/radar/tendencias";
import { categoria } from "@/lib/radar/categorias";
import type { ListadoActor, PubML } from "./tipos";

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v).replace(/[^\d.,]/g, "");
  if (!t) return null;
  // "12.345" y "12.345,67" son pesos argentinos.
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const pisoVendidos = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  const t = String(v ?? "").toLowerCase().replace(/\./g, "");
  const m = t.match(/(\d+)\s*(mil|k)?/);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
};
const texto = (o: Record<string, unknown>, ...claves: string[]) => {
  for (const k of claves) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return null;
};

/** Normaliza una publicación de cualquier actor de Mercado Libre. */
export function aPubML(x: Record<string, unknown>): PubML {
  const url = texto(x, "permalink", "productUrl", "url", "url_item", "link");
  const itemId = texto(x, "publicationId", "item_id", "ml_id", "itemId", "id")?.match(/MLA-?\d+/)?.[0]?.replace("-", "")
    ?? url?.match(/MLA-?\d+/)?.[0]?.replace("-", "") ?? null;
  const vend = x.soldQuantity ?? x.sold_quantity ?? x.sold_quantity_text ?? x.soldText ?? x.sold;
  return {
    itemId,
    productoId: texto(x, "catalogProductId", "catalog_product_id", "productId", "product_id"),
    titulo: texto(x, "title", "name", "titulo") ?? "(sin título)",
    url,
    foto: texto(x, "thumbnailUrl", "thumbnail", "image", "imageUrl", "picture", "images", "pictures"),
    precio: num(x.currentPrice ?? x.price ?? x.precio ?? x.salePrice),
    vendidos: pisoVendidos(vend),
    vendidosTexto: vend != null ? (typeof vend === "number" ? `+${vend} vendidos` : String(vend)) : null,
    opiniones: num(x.reviewCount ?? x.reviews_count ?? x.ratingCount),
  };
}

/** Dirección del listado de la categoría en Mercado Libre, con el rango de precio. */
export async function urlDeCategoria(categoriaId: string, organizacionId: string, min: number | null, max: number | null) {
  const token = await tokenML(organizacionId);
  const r = await ml(`/categories/${categoriaId}`, token);
  const permalink = (r.datos as { permalink?: string } | null)?.permalink?.replace(/\/$/, "");
  const base = permalink || `https://listado.mercadolibre.com.ar/_CategoryID_${categoriaId}`;
  const rango = min != null || max != null ? `/_PriceRange_${min ?? 0}-${max ?? 999999999}_NoIndex_True` : "";
  return `${base}${rango}`;
}

const enRango = (p: number | null, min: number | null, max: number | null) =>
  p != null && (min == null || p >= min) && (max == null || p <= max);

/** Lee el listado de la categoría con dos actores a la vez (es un ensayo: no
 *  sabemos cuál acepta una dirección de categoría) y junta lo que traigan. */
export async function listadoDeCategoria(url: string, n: number, min: number | null, max: number | null, puedeGastar: (usd: number) => boolean) {
  const actores: ListadoActor[] = [];
  const pubs: PubML[] = [];
  const intentos: { actor: string; entrada: Record<string, unknown> }[] = [
    { actor: "scrapesage~mercadolibre-scraper", entrada: {
      site: "MLA", startUrls: [{ url }], maxItems: n, maxPagesPerQuery: Math.ceil(n / 48),
      ...(min != null ? { minPrice: min } : {}), ...(max != null ? { maxPrice: max } : {}),
    } },
  ];
  const ruta = url.match(/^https:\/\/listado\.mercadolibre\.com\.ar\/(.+)$/)?.[1];
  if (ruta) intentos.push({ actor: "karamelo~mercado-libre-listings-scraper", entrada: {
    keyword: ruta, country: "https://listado.mercadolibre.com.ar/", maxPages: Math.ceil(n / 48),
    extractProductDetails: false, includeReviews: false, includeQuestions: false, includeVariations: false,
  } });
  await Promise.all(intentos.map(async ({ actor, entrada }) => {
    if (!puedeGastar(0.3)) return actores.push({ actor, url, ok: false, cantidad: 0, costoUsd: null, error: "Tope de gasto de Apify" });
    const c = await correrConEntrada(actor, entrada, { max: n, esperaSeg: 150, topeUsd: 0.3 });
    const propias = (c.items as Record<string, unknown>[]).map(aPubML).filter((p) => p.titulo !== "(sin título)");
    actores.push({ actor, url, ok: propias.length > 0, cantidad: propias.length, costoUsd: c.costoUsd, error: propias.length ? undefined : c.error ?? "No trajo publicaciones",
      muestra: c.items[0] ? JSON.stringify(c.items[0]).slice(0, 2000) : undefined });
    pubs.push(...propias);
  }));
  // Sin repetidos; dentro del rango de precio; más vendidos primero (a igual
  // escalón, más opiniones).
  const vistos = new Set<string>();
  const unicas = pubs.filter((p) => {
    const k = p.itemId ?? p.url ?? p.titulo;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return enRango(p.precio, min, max);
  });
  unicas.sort((a, b) => (b.vendidos ?? -1) - (a.vendidos ?? -1) || (b.opiniones ?? -1) - (a.opiniones ?? -1));
  return { actores, listado: unicas };
}

/** ¿La categoría `id` está dentro de la rama `rama` (o es ella)? */
async function dentroDeRama(id: string, rama: string) {
  if (id === rama) return true;
  const [c, r] = await Promise.all([categoria(id).catch(() => null), categoria(rama).catch(() => null)]);
  return !!c && !!r && c.ruta.startsWith(`${r.ruta} › `);
}

/** Las palabras más buscadas de la categoría y, por cada una, la primera
 *  publicación de catálogo dentro del rango de precio. Gratis. Para no traer
 *  cualquier cosa que comparta una palabra (un libro, un disco), Mercado
 *  Libre primero dice en qué categoría cae la palabra (domain_discovery): si
 *  no cae dentro de la categoría elegida, se descarta; si cae, se busca sólo
 *  en ese tipo de producto (domain_id). */
export async function buscadosDeCategoria(categoriaId: string, organizacionId: string, cuantos: number, min: number | null, max: number | null) {
  const lectura = await lecturaDeLaSemana(categoriaId, organizacionId);
  if (!lectura) return { palabras: [], pubs: [], error: "No se pudieron leer las tendencias de la categoría" };
  const token = await tokenML(organizacionId);
  const lista = (await palabrasDe([lectura.id])).filter((p) => p.grupo === "buscadas").sort((a, b) => a.posicion - b.posicion);
  const palabras: { palabra: string; encontrada: boolean; motivo?: string }[] = [];
  const pubs: (PubML & { palabra: string })[] = [];
  for (const p of lista) {
    if (pubs.length >= cuantos || palabras.length >= cuantos * 4) break;
    const q = encodeURIComponent(p.palabra);
    const disc = await ml(`/sites/MLA/domain_discovery/search?q=${q}&limit=3`, token);
    const opciones = (Array.isArray(disc.datos) ? disc.datos : []) as { domain_id?: string; category_id?: string; category_name?: string }[];
    let dominio: string | null = null;
    for (const o of opciones) {
      if (o.category_id && o.domain_id && await dentroDeRama(o.category_id, categoriaId)) { dominio = o.domain_id; break; }
    }
    if (!dominio) {
      palabras.push({ palabra: p.palabra, encontrada: false,
        motivo: opciones[0]?.category_name ? `Mercado Libre la ubica en otra categoría (${opciones[0].category_name})` : "Mercado Libre no la ubica en ninguna categoría" });
      continue;
    }
    const r = await ml(`/products/search?status=active&site_id=MLA&q=${q}&domain_id=${encodeURIComponent(dominio)}&limit=10`, token);
    const productos = ((r.datos as { results?: { id: string; name: string; domain_id?: string; pictures?: { url: string }[] }[] })?.results ?? [])
      .filter((x) => !x.domain_id || x.domain_id === dominio);
    let elegida: (PubML & { palabra: string }) | null = null;
    for (const prod of productos.slice(0, 6)) {
      if (pubs.some((x) => x.productoId === prod.id)) continue;
      const it = await ml(`/products/${prod.id}/items?limit=10`, token);
      const ofertas = ((it.datos as { results?: Record<string, unknown>[] })?.results ?? []);
      if (!ofertas.length) continue;
      const o = ofertas.reduce((a, x) => (Number(x.price) < Number(a.price) ? x : a));
      const precio = Number(o.price) || null;
      if (!enRango(precio, min, max)) continue;
      elegida = { palabra: p.palabra, itemId: String(o.item_id ?? "") || null, productoId: prod.id, titulo: prod.name,
        url: `https://www.mercadolibre.com.ar/p/${prod.id}`, foto: prod.pictures?.[0]?.url ?? null, precio,
        vendidos: null, vendidosTexto: null, opiniones: null };
      break;
    }
    if (elegida) {
      pubs.push(elegida);
      palabras.push({ palabra: p.palabra, encontrada: true });
    } else {
      palabras.push({ palabra: p.palabra, encontrada: false, motivo: productos.length ? "ninguna en el rango de precio" : "sin productos de catálogo" });
    }
  }
  return { palabras, pubs, error: null };
}

/** Cruce: qué buscados aparecen también entre los vendidos. Primero por
 *  publicación o producto de catálogo idéntico; después Claude decide los
 *  equivalentes (mismo producto, distinto vendedor). */
export async function cruzar(buscados: PubML[], vendidos: PubML[]) {
  const pares: { b: number; v: number; como: "mismo producto" | "equivalente" }[] = [];
  buscados.forEach((b, i) => vendidos.forEach((v, j) => {
    if ((b.itemId && b.itemId === v.itemId) || (b.productoId && b.productoId === v.productoId)) pares.push({ b: i, v: j, como: "mismo producto" });
  }));
  let tokens = { tokensIn: 0, tokensOut: 0 };
  if (buscados.length && vendidos.length) {
    const r = await pedirClaude({
      system: "Comparás publicaciones de Mercado Libre Argentina. Te doy dos listas: B (productos buscados) y V (productos vendidos). " +
        "Decí qué pares son el MISMO tipo de producto con características equivalentes (mismo uso, tamaño/capacidad parecidos), aunque sean de distinta marca o vendedor. " +
        "No emparejes productos sólo porque son del mismo rubro. Respondé sólo JSON: {\"pares\":[{\"b\":1,\"v\":3}]}.",
      contenido: `B:\n${buscados.map((x, i) => `${i + 1}. ${x.titulo} — $${x.precio ?? "?"}`).join("\n")}\n\nV:\n${vendidos.map((x, i) => `${i + 1}. ${x.titulo} — $${x.precio ?? "?"}`).join("\n")}`,
      maxTokens: 2000,
    });
    tokens = { tokensIn: r.tokensIn, tokensOut: r.tokensOut };
    if ("texto" in r) {
      for (const p of jsonDe<{ pares?: { b: number; v: number }[] }>(r.texto)?.pares ?? []) {
        const b = p.b - 1, v = p.v - 1;
        if (buscados[b] && vendidos[v] && !pares.some((x) => x.b === b && x.v === v)) pares.push({ b, v, como: "equivalente" });
      }
    }
  }
  return { pares, ...tokens };
}
