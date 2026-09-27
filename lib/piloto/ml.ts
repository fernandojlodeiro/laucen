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
import type { Caja, ListadoActor, PubML } from "./tipos";

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
  // En el listado casi todo viene como ficha de catálogo (/p/MLA…, 8 dígitos)
  // o producto de vendedor (/up/MLAU…); la publicación (MLA de 10 dígitos)
  // sólo a veces. Piloto #6: se tomaba el número de la ficha como si fuera la
  // publicación y Mercado Libre no devolvía el peso.
  const ficha = url?.match(/\/p\/(MLA\d+)/)?.[1] ?? url?.match(/\/up\/(MLAU\d+)/)?.[1] ?? null;
  const candidatoItem = texto(x, "publicationId", "item_id", "ml_id", "itemId", "id")?.match(/MLA-?\d+/)?.[0]?.replace("-", "")
    ?? String(x.clickUrl ?? "").match(/[?&]wid=(MLA\d+)/)?.[1]
    ?? url?.match(/articulo\.mercadolibre\.com\.ar\/(MLA-?\d+)/)?.[1]?.replace("-", "") ?? null;
  const itemId = candidatoItem && candidatoItem !== ficha && /^MLA\d{9,}$/.test(candidatoItem) ? candidatoItem : null;
  const vend = x.soldQuantity ?? x.sold_quantity ?? x.sold_quantity_text ?? x.soldText ?? x.sold;
  const internacional = x.isInternationalPurchase === true || x.internationalPurchase === true || x.international === true
    || /internacional/i.test(String(x.shipping ?? "")) || x.shippingOrigin === "international";
  return {
    publicidad: x.sponsored === true || x.isAd === true || x.resultType === "AD" || /is_advertising=true/.test(String(x.clickUrl ?? "")),
    internacional,
    categoriaId: texto(x, "categoryId", "category_id"),
    itemId,
    productoId: texto(x, "catalogProductId", "catalog_product_id", "productId", "product_id") ?? ficha,
    titulo: texto(x, "title", "name", "titulo") ?? "(sin título)",
    url,
    foto: texto(x, "thumbnailUrl", "thumbnail", "image", "imageUrl", "picture", "images", "pictures"),
    precio: num(x.currentPrice ?? x.price ?? x.precio ?? x.salePrice),
    vendidos: pisoVendidos(vend),
    vendidosTexto: vend != null ? (typeof vend === "number" ? `+${vend} vendidos` : String(vend)) : null,
    opiniones: num(x.reviewCount ?? x.reviews_count ?? x.ratingCount),
  };
}

/** Cómo arma Mercado Libre la dirección de una categoría: cada nivel en
 *  minúsculas, sin acentos ni signos, palabras separadas por "-" y sin la "y"
 *  ni conectores ("Hogar, Muebles y Jardín › Jardin y Aire Libre" →
 *  listado.mercadolibre.com.ar/hogar-muebles-jardin/jardin-aire-libre/, visto
 *  por Fer el 27/9). */
// "Muebles para Exterior" → muebles-exterior (visto por Fer el 27/9). Los
// demás conectores se sacan por las dudas (no verificado).
const CONECTORES = new Set(["y", "e", "o", "para", "de", "del", "la", "las", "el", "los", "en", "con", "a", "por"]);

export function slugCategoria(nombre: string) {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ").trim().split(/\s+/).filter((w) => !CONECTORES.has(w)).join("-");
}

/** Dirección del listado de la categoría en Mercado Libre, con el rango de
 *  precio y, si se pide, sólo envío local (sin compra internacional). Formato
 *  copiado de la dirección que armó Fer en el navegador (27/9):
 *  …/colchones-inflables/_PriceRange_70000ARS-500000ARS_NoIndex_True_SHIPPING*ORIGIN_10215068 */
export async function urlDeCategoria(categoriaId: string, _organizacionId: string, min: number | null, max: number | null, soloLocal = false) {
  const c = await categoria(categoriaId);
  if (!c) throw new Error(`No se encontró la categoría ${categoriaId}`);
  const camino = c.ruta.split(" › ").map(slugCategoria).join("/");
  // Con un filtro en la dirección, Mercado Libre muestra el listado (sin
  // filtro, en las categorías grandes muestra una portada con carruseles).
  const rango = `_PriceRange_${min ?? 0}ARS-${max ?? 999999999}ARS_NoIndex_True`;
  return `https://listado.mercadolibre.com.ar/${camino}/${rango}${soloLocal ? "_SHIPPING*ORIGIN_10215068" : ""}`;
}

const enRango = (p: number | null, min: number | null, max: number | null) =>
  p != null && (min == null || p >= min) && (max == null || p <= max);

/** Lee el listado de la categoría con dos actores a la vez (es un ensayo: no
 *  sabemos cuál acepta una dirección de categoría) y junta lo que traigan. */
export async function listadoDeCategoria(url: string, categoriaId: string, n: number, min: number | null, max: number | null, puedeGastar: (usd: number) => boolean) {
  const actores: ListadoActor[] = [];
  const pubs: PubML[] = [];
  const intentos: { actor: string; entrada: Record<string, unknown> }[] = [
    { actor: "scrapesage~mercadolibre-scraper", entrada: {
      site: "MLA", startUrls: [{ url }], maxItems: n, maxPagesPerQuery: Math.ceil(n / 48),
      ...(min != null ? { minPrice: min } : {}), ...(max != null ? { maxPrice: max } : {}),
    } },
  ];
  // karamelo quedó afuera (28/9): no entiende la dirección de una categoría.
  await Promise.all(intentos.map(async ({ actor, entrada }) => {
    if (!puedeGastar(0.3)) return actores.push({ actor, url, ok: false, cantidad: 0, costoUsd: null, error: "Tope de gasto de Apify" });
    const c = await correrConEntrada(actor, entrada, { max: n, esperaSeg: 150, topeUsd: 0.3 });
    const todas = (c.items as Record<string, unknown>[]).map(aPubML).filter((p) => p.titulo !== "(sin título)");
    // Si el actor dice de qué categoría es cada publicación, se descartan las
    // de otras ramas (karamelo no entiende la dirección de la categoría y trae
    // de todo el rubro).
    const dentro = await Promise.all(todas.map((p) => (p.categoriaId ? dentroDeRama(p.categoriaId, categoriaId) : Promise.resolve(true))));
    // Sin publicidad (aparece primera por pagar, no por vender) ni compra internacional.
    const propias = todas.filter((p, i) => dentro[i] && !p.publicidad && !p.internacional);
    actores.push({ actor, url, ok: propias.length > 0, cantidad: propias.length, costoUsd: c.costoUsd, runId: c.runId, descartadas: todas.length - propias.length,
      publicidad: todas.filter((p) => p.publicidad).length,
      error: propias.length ? undefined : todas.length ? "Todo lo que trajo era de otras categorías" : c.error ?? "No trajo publicaciones",
      muestra: c.items[0] ? JSON.stringify(c.items[0]).slice(0, 2000) : undefined });
    pubs.push(...propias);
  }));
  // Sin repetidos; dentro del rango de precio; primero las que tienen el dato
  // de vendidos (más vendidas primero, a igual escalón más opiniones) y
  // después las demás en el orden de Mercado Libre ("más relevantes", que
  // ya pesa las ventas).
  const vistos = new Set<string>();
  const unicas = pubs.filter((p) => {
    const k = p.itemId ?? p.productoId ?? p.url ?? p.titulo;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return enRango(p.precio, min, max);
  });
  const conVendidos = unicas.filter((p) => p.vendidos != null)
    .sort((a, b) => b.vendidos! - a.vendidos! || (b.opiniones ?? -1) - (a.opiniones ?? -1));
  unicas.splice(0, unicas.length, ...conVendidos, ...unicas.filter((p) => p.vendidos == null));
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
  let tokens = { tokensIn: 0, tokensOut: 0, usd: 0 };
  if (buscados.length && vendidos.length) {
    const r = await pedirClaude({
      system: "Comparás publicaciones de Mercado Libre Argentina. Te doy dos listas: B (productos buscados) y V (productos vendidos). " +
        "Decí qué pares son el MISMO tipo de producto con características equivalentes (mismo uso, tamaño/capacidad parecidos), aunque sean de distinta marca o vendedor. " +
        "No emparejes productos sólo porque son del mismo rubro. Respondé sólo JSON: {\"pares\":[{\"b\":1,\"v\":3}]}.",
      contenido: `B:\n${buscados.map((x, i) => `${i + 1}. ${x.titulo} — $${x.precio ?? "?"}`).join("\n")}\n\nV:\n${vendidos.map((x, i) => `${i + 1}. ${x.titulo} — $${x.precio ?? "?"}`).join("\n")}`,
      maxTokens: 2000, modelo: "chico",
    });
    tokens = { tokensIn: r.tokensIn, tokensOut: r.tokensOut, usd: r.usd };
    if ("texto" in r) {
      for (const p of jsonDe<{ pares?: { b: number; v: number }[] }>(r.texto)?.pares ?? []) {
        const b = p.b - 1, v = p.v - 1;
        if (buscados[b] && vendidos[v] && !pares.some((x) => x.b === b && x.v === v)) pares.push({ b, v, como: "equivalente" });
      }
    }
  }
  return { pares, ...tokens };
}

// ── Medidas y peso desde Mercado Libre ────────────────────
// Los vendedores suelen cargar el paquete en los atributos (PACKAGE_*) o las
// medidas en la descripción. Si están los atributos del paquete, esa es la
// caja; si no, el texto (atributos + descripción) se le pasa a Claude para
// que la saque de ahí antes de adivinar.

type Atributo = { id?: string; name?: string; value_name?: string | null; value_struct?: { number?: number; unit?: string } | null };

function enCm(a?: Atributo) {
  const n = a?.value_struct?.number, u = (a?.value_struct?.unit ?? "").toLowerCase();
  if (typeof n !== "number" || !(n > 0)) return null;
  return u === "mm" ? n / 10 : u === "m" ? n * 100 : u === "in" || u === "\"" ? n * 2.54 : n;
}
function enKg(a?: Atributo) {
  const n = a?.value_struct?.number, u = (a?.value_struct?.unit ?? "").toLowerCase();
  if (typeof n !== "number" || !(n > 0)) return null;
  return u === "g" ? n / 1000 : u === "lb" ? n * 0.4536 : u === "oz" ? n * 0.02835 : n;
}

const MEDIDAS = /PACKAGE|HEIGHT|WIDTH|LENGTH|DEPTH|WEIGHT|DIAMETER|UNITS_PER_PACK|SALE_FORMAT|INCLUDES|CAPACITY|SIZE/;

export async function datosDeEnvio(pub: { itemId: string | null; productoId: string | null }, organizacionId: string) {
  const token = await tokenML(organizacionId);
  let atributos: Atributo[] = [];
  let descripcion = "";
  const item = pub.itemId && /^MLA\d+$/.test(pub.itemId) ? await ml(`/items/${pub.itemId}`, token) : null;
  if (item?.status === 200) {
    atributos = ((item.datos as { attributes?: Atributo[] })?.attributes) ?? [];
    const d = await ml(`/items/${pub.itemId}/description`, token);
    descripcion = String((d.datos as { plain_text?: string } | null)?.plain_text ?? "");
  } else if (pub.productoId?.startsWith("MLAU")) {
    // Producto de vendedor (/up/MLAU…).
    const p = await ml(`/user-products/${pub.productoId}`, token);
    if (p.status === 200) atributos = ((p.datos as { attributes?: Atributo[] })?.attributes) ?? [];
  } else if (pub.productoId) {
    // Ficha de catálogo (/p/MLA…): sus atributos, y los de la publicación que
    // gana la ficha, que es la que suele traer el paquete (PACKAGE_*).
    const p = await ml(`/products/${pub.productoId}`, token);
    if (p.status === 200) {
      const datos = p.datos as { attributes?: Atributo[]; short_description?: { content?: string }; buy_box_winner?: { item_id?: string } | null };
      atributos = datos.attributes ?? [];
      descripcion = String(datos.short_description?.content ?? "");
      const ganador = datos.buy_box_winner?.item_id;
      if (ganador) {
        const g = await ml(`/items/${ganador}`, token);
        if (g.status === 200) atributos = [...(((g.datos as { attributes?: Atributo[] })?.attributes) ?? []), ...atributos];
      }
    }
  }
  const por = (id: string) => atributos.find((a) => a.id === id);
  const l = enCm(por("PACKAGE_LENGTH")), w = enCm(por("PACKAGE_WIDTH")), h = enCm(por("PACKAGE_HEIGHT")), kg = enKg(por("PACKAGE_WEIGHT"));
  // El peso es lo que más importa (Fer, 28/9) y casi todas las publicaciones
  // lo traen: el del paquete o, si no, el del producto.
  const kgProducto = enKg(por("WEIGHT")) ?? enKg(atributos.find((a) => /^(PRODUCT_)?WEIGHT$|NET_WEIGHT/.test(a.id ?? "")));
  const peso = kg ?? kgProducto;
  const caja: Caja | null = peso
    ? { largo: l ? Math.round(l) : 0, ancho: w ? Math.round(w) : 0, alto: h ? Math.round(h) : 0, kg: Math.round(peso * 100) / 100,
        fuente: "mercadolibre", nota: `${kg ? "peso del paquete" : "peso del producto"} en Mercado Libre${l && w && h ? " y medidas del paquete" : ""}` }
    : null;
  const lineas = atributos.filter((a) => a.id && MEDIDAS.test(a.id) && a.value_name).map((a) => `${a.name ?? a.id}: ${a.value_name}`);
  const texto = [lineas.join("\n"), descripcion.replace(/\s+/g, " ").slice(0, 1500)].filter(Boolean).join("\nDescripción: ");
  return { caja, texto };
}
