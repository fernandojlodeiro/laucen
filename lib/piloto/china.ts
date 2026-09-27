// Piloto, lado China: traducir el título, buscar (AliExpress; o 1688 y
// Alibaba en los pilotos viejos), estimar la caja de envío y juzgar. Lo
// mecánico va con el modelo chico de Claude; el juez, con el del medio.

import { correrActor, correrConEntrada } from "@/lib/apify";
import { jsonDe, pedirClaude, type Contenido } from "@/lib/claude";
import { traducir, esFalla } from "@/lib/china/traducir";
import { aBase64 } from "@/lib/imagenes";
import type { Caja, Candidato, Franja, Juicio, Parametros, Sitio } from "./tipos";

// Actores elegidos en el banco de China: rápidos y con precio.
const ACTOR_1688 = "parseforge~1688-scraper";
const ACTOR_ALIBABA = "memo23~alibaba-scraper";
// AliExpress: el primero del banco (27/9); se prueban los otros en el banco.
export const ACTOR_ALIEXPRESS = "dami_studio~aliexpress-products-scraper";
const POR_SITIO = 20;

const primerNumero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const primero = (v: unknown) => (Array.isArray(v) ? str(v[0]) : str(v));
const https = (u: string | null) => (u?.startsWith("//") ? `https:${u}` : u);
// Las fotos de 1688 vienen en tamaño completo; alicdn da la miniatura con este
// sufijo (el mismo que usa el actor de crawleast). Menos tokens para el juez.
const miniatura = (u: string | null) => (u && /alicdn\.com\/.+\.(jpg|png)$/i.test(u) ? `${u}_270x270xzq60.jpg` : u);

function aCandidato(sitio: Candidato["sitio"], x: Record<string, unknown>, yuanPorDolar: number): Candidato {
  if (sitio === "1688") {
    const cny = primerNumero(x.price);
    return {
      sitio, titulo: str(x.title) ?? "(sin título)", precioTexto: cny != null ? `¥${cny}` : null,
      usd: cny != null ? Math.round((cny / yuanPorDolar) * 100) / 100 : null,
      minimo: primerNumero(x.minOrderQuantity), foto: miniatura(https(primero(x.imageUrl))), url: https(str(x.url)),
      proveedor: str(x.supplierName), fabrica: x.factoryInspection != null ? Boolean(x.factoryInspection) : null,
      anios: primerNumero(x.verifiedYears), ventas: str(x.monthlySales) ?? str(x.saleQuantity),
    };
  }
  return {
    sitio, titulo: str(x.title) ?? "(sin título)", precioTexto: str(x.price),
    usd: primerNumero(x.priceMin ?? x.price), minimo: primerNumero(x.minOrder),
    foto: https(primero(x.images) ?? str(x.mainImage)), url: https(str(x.productUrl)),
    proveedor: str(x.supplierName), fabrica: null, anios: primerNumero(x.supplierYears), ventas: null,
  };
}

/** AliExpress: cada actor nombra distinto los campos; se busca por nombre. */
function campo(x: Record<string, unknown>, ...claves: string[]) {
  for (const k of claves) {
    const v = x[k];
    if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) return v;
  }
  return null;
}
function aCandidatoAliexpress(x: Record<string, unknown>): Candidato {
  const precio = campo(x, "salePrice", "price", "minPrice", "priceMin", "currentPrice", "sale_price", "targetSalePrice", "originalPrice");
  const precioObj = precio && typeof precio === "object" ? (precio as Record<string, unknown>) : null;
  const valor = precioObj ? campo(precioObj, "min", "value", "amount", "minPrice") : precio;
  const moneda = String(campo(x, "currency", "currencyCode") ?? (precioObj ? campo(precioObj, "currency") : "") ?? "");
  const usd = primerNumero(valor);
  return {
    sitio: "aliexpress", titulo: str(campo(x, "title", "name", "productTitle", "subject")) ?? "(sin título)",
    precioTexto: valor != null ? `${moneda && moneda !== "USD" ? `${moneda} ` : "US$ "}${valor}` : null,
    // Si el actor no respetó la moneda pedida, el precio no se toma como dólares.
    usd: moneda && moneda.toUpperCase() !== "USD" ? null : usd,
    minimo: 1,
    foto: https(primero(campo(x, "image", "imageUrl", "mainImage", "img", "images", "thumbnail", "productImage"))),
    url: https(str(campo(x, "url", "productUrl", "link", "detailUrl", "href"))),
    proveedor: str(campo(x, "storeName", "store", "sellerName", "shopName")),
    fabrica: null, anios: null,
    ventas: str(campo(x, "orders", "sold", "soldCount", "tradeCount", "salesCount", "totalSold")),
  };
}

export type BusquedaChina = { en: string; zh: string; candidatos: Candidato[]; costoUsd: number; errores: string[]; tokensIn: number; tokensOut: number };

/** Traduce el título y busca en los sitios del piloto: AliExpress (en
 *  inglés, enviando a Argentina, en dólares), 1688 (en chino), Alibaba (en inglés). */
export async function buscarEnChina(titulo: string, p: Parametros, puedeGastar: (usd: number) => boolean): Promise<BusquedaChina & { muestra?: string }> {
  const t = await traducir(titulo);
  if (!t || esFalla(t)) {
    return { en: "", zh: "", candidatos: [], costoUsd: 0, errores: [`No se pudo traducir: ${t && esFalla(t) ? t.motivo : "sin llave de Claude"}`], tokensIn: 0, tokensOut: 0 };
  }
  const sitios: Sitio[] = p.sitios?.length ? p.sitios : ["1688", "alibaba"];
  const errores: string[] = [];
  let costoUsd = 0;
  let muestra: string | undefined;
  const corridas = await Promise.all(sitios.map(async (sitio) => {
    if (!puedeGastar(0.05)) { errores.push(`${sitio}: tope de gasto de Apify`); return []; }
    if (sitio === "aliexpress") {
      // La entrada se arma desde el esquema del actor (lib/apify.ts).
      const r = await correrActor(ACTOR_ALIEXPRESS, t.en, POR_SITIO, 120,
        { urlBusqueda: `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(t.en.replace(/\s+/g, "-"))}.html`, pais: "AR", moneda: "USD" });
      costoUsd += r.costo_usd ?? 0;
      if (!r.items?.length) errores.push(`aliexpress: ${r.error ?? "sin resultados"}`);
      muestra = r.items?.[0] ? JSON.stringify(r.items[0]).slice(0, 2000) : undefined;
      return ((r.items ?? []) as Record<string, unknown>[]).map(aCandidatoAliexpress).filter((c) => c.titulo !== "(sin título)");
    }
    const [actor, entrada] = sitio === "1688"
      ? [ACTOR_1688, { searchTerms: [t.zh], maxItems: POR_SITIO }]
      : [ACTOR_ALIBABA, { searchTerms: [t.en], maxItems: POR_SITIO, maxPages: 1 }];
    const c = await correrConEntrada(actor, entrada, { max: POR_SITIO, esperaSeg: 120, topeUsd: 0.1 });
    costoUsd += c.costoUsd ?? 0;
    if (!c.items.length) errores.push(`${sitio}: ${c.error ?? "sin resultados"}`);
    return (c.items as Record<string, unknown>[]).map((x) => aCandidato(sitio, x, p.yuanPorDolar));
  }));
  // La traducción no se cuenta acá (va con el modelo chico, centavos).
  return { en: t.en, zh: t.zh, candidatos: corridas.flat(), costoUsd, errores, tokensIn: 0, tokensOut: 0, muestra };
}

/** La caja de envío de una unidad (cm y kg) de cada producto, con el
 *  modelo chico. Primero lo que dice Mercado Libre (atributos y descripción,
 *  en `texto`); si no dice nada, estimada mirando título y foto. */
export async function estimarCajas(productos: { id: number; titulo: string; foto: string | null; texto?: string }[]) {
  const contenido: Contenido = [];
  const fotos = await Promise.all(productos.map((p) => aBase64(p.foto)));
  productos.forEach((p, i) => {
    contenido.push({ type: "text", text: `Producto ${p.id}: ${p.titulo}${p.texto ? `\nDatos de la publicación: ${p.texto}` : ""}` });
    const f = fotos[i];
    if (f) contenido.push({ type: "image", source: { type: "base64", media_type: f.media_type, data: f.data } });
  });
  const pedido = {
    system: "Sos despachante e importador. Para cada producto dá la caja de envío de lo que se vende en la publicación (si es un set o pack, " +
      "la caja de todo el set), tal como viene de fábrica: largo, ancho y alto en cm y peso bruto en kg. " +
      "Si los datos de la publicación traen medidas o peso del paquete o del producto, USALOS (sumando un poco de embalaje si son del producto) " +
      "y poné fuente \"descripcion\"; si no hay datos, estimá por la foto y el título y poné fuente \"estimado\". " +
      "Respondé sólo JSON: {\"cajas\":[{\"id\":123,\"largo\":30,\"ancho\":20,\"alto\":10,\"kg\":1.2,\"fuente\":\"descripcion\",\"nota\":\"breve\"}]}.",
    maxTokens: 3000,
    modelo: "chico" as const,
  };
  let r = await pedirClaude({ ...pedido, contenido });
  let tokensIn = r.tokensIn, tokensOut = r.tokensOut, usd = r.usd;
  if ("error" in r) {
    r = await pedirClaude({ ...pedido, contenido: productos.map((p) => `Producto ${p.id}: ${p.titulo}${p.texto ? `\nDatos: ${p.texto}` : ""}`).join("\n\n") });
    tokensIn += r.tokensIn; tokensOut += r.tokensOut; usd += r.usd;
  }
  const cajas = new Map<number, Caja>();
  if ("texto" in r) {
    for (const c of jsonDe<{ cajas?: (Omit<Caja, "fuente"> & { id: number; fuente?: string })[] }>(r.texto)?.cajas ?? []) {
      if ([c.largo, c.ancho, c.alto, c.kg].every((n) => typeof n === "number" && n > 0)) {
        cajas.set(c.id, { largo: c.largo, ancho: c.ancho, alto: c.alto, kg: c.kg, fuente: c.fuente === "descripcion" ? "descripcion" : "claude", nota: c.nota });
      }
    }
  }
  return { cajas, error: "error" in r ? r.error : null, tokensIn, tokensOut, usd };
}

/** Flete por unidad: en dólares y como % del precio de venta, y la franja.
 *  Barco: se paga por m³ o por tonelada (1 m³ = 1.000 kg), lo que dé más.
 *  Avión: por kilo, real o volumétrico (largo × ancho × alto en cm ÷ 6.000),
 *  lo que dé más. */
export function flete(caja: Caja, precioPesos: number | null, p: Parametros): { usd: number; pct: number | null; franja: Franja | null } {
  const m3 = (caja.largo * caja.ancho * caja.alto) / 1_000_000;
  const usd = p.modo === "avion"
    ? Math.max(caja.kg, (caja.largo * caja.ancho * caja.alto) / 6000) * p.fleteKgUsd
    : Math.max(m3, caja.kg / 1000) * p.fleteM3Usd;
  if (!precioPesos) return { usd, pct: null, franja: null };
  const pct = Math.round((usd / (precioPesos / p.dolar)) * 1000) / 10;
  const franja: Franja = p.modo === "avion"
    ? (pct <= p.seguroPct ? "seguro" : pct <= p.grisPct ? "gris" : "fuera")
    : (pct >= p.seguroPct ? "seguro" : pct >= p.grisPct ? "gris" : "fuera");
  return { usd: Math.round(usd * 100) / 100, pct, franja };
}

const lineaCandidato = (c: Candidato, n: number) =>
  `${n}. [${c.sitio}] ${c.titulo} | ${c.usd != null ? `US$ ${c.usd}` : "sin precio"}${c.precioTexto ? ` (${c.precioTexto})` : ""}` +
  ` | mínimo ${c.minimo ?? "?"}${c.proveedor ? ` | ${c.proveedor}` : ""}${c.fabrica ? ", fábrica" : ""}${c.anios ? `, ${c.anios} años` : ""}${c.ventas ? `, ventas ${c.ventas}` : ""}`;

/** El juez, en dos pasos:
 *  1) prefiltro con el modelo chico, sólo texto: de todos los candidatos,
 *     los que podrían ser el mismo producto (hasta 8);
 *  2) juez con el modelo del medio, con las fotos de esos pocos: desarma el
 *     producto de Mercado Libre (cantidad, accesorios), marca los que sirven
 *     y elige el mejor, con el costo de armar lo mismo en China. */
export async function juzgar(ml: { titulo: string; foto: string | null; precio: number | null; texto?: string }, candidatos: Candidato[], p: Parametros) {
  const vacio = (motivo: string, extra: Partial<Juicio> = {}) => ({ veredictos: [], elegido: null, motivo, ...extra }) as Juicio;
  if (!candidatos.length) return { juicio: vacio("No hubo resultados en China."), tokensIn: 0, tokensOut: 0, usd: 0 };
  const cabeza = `Mercado Libre: ${ml.titulo} — $${ml.precio ?? "?"} (pesos)${ml.texto ? `\nDatos de la publicación: ${ml.texto.slice(0, 1200)}` : ""}`;

  // 1) Prefiltro barato.
  const pre = await pedirClaude({
    modelo: "chico", maxTokens: 400,
    system: "Te doy un producto de Mercado Libre y una lista numerada de productos de China. Devolvé los números de los que PODRÍAN ser " +
      "el mismo tipo de producto (o una parte de él, si el de Mercado Libre es un set), como máximo 8, los más parecidos primero. " +
      "Descartá repuestos, accesorios sueltos y otros productos. Respondé sólo JSON: {\"n\":[3,7,1]}.",
    contenido: `${cabeza}\n\nCandidatos:\n${candidatos.map((c, i) => lineaCandidato(c, i + 1)).join("\n")}`,
  });
  let tokensIn = pre.tokensIn, tokensOut = pre.tokensOut, usd = pre.usd;
  const elegidos = "texto" in pre
    ? [...new Set((jsonDe<{ n?: number[] }>(pre.texto)?.n ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= candidatos.length))].slice(0, 8)
    : candidatos.slice(0, 8).map((_, i) => i + 1);
  if (!elegidos.length) return { juicio: vacio("Ningún resultado de China parece el mismo producto.", { preseleccion: [] }), tokensIn, tokensOut, usd };

  // 2) Juez con fotos, sólo sobre los preseleccionados (con su número original).
  const system =
    "Sos el comprador de un importador argentino. Te doy un producto que se vende en Mercado Libre y algunos candidatos de China, con fotos.\n" +
    "Paso 1: desarmá el producto de Mercado Libre en sus componentes, con cantidades (ej: \"2 colchones dobles + 1 inflador eléctrico + 2 almohadas\"). " +
    "Mirá bien el título, la foto y los datos: sets, packs, 'x2', 'combo', 'kit', 'incluye'.\n" +
    "Paso 2: para cada candidato que SIRVA para armar ese mismo producto decí \"si\" o \"dudoso\", cuántas unidades del candidato hacen falta " +
    "(unidades) y qué componente falta (falta), con un motivo corto. No listes los que no sirven.\n" +
    `Paso 3: elegí el mejor: el menor costo total para armar el producto completo (unidades × precio + una estimación de lo que falta), ` +
    `con un pedido mínimo de hasta ${p.minimoMax} unidades; a costo parecido, el de más ventas o mejor proveedor. costoUsd = ese costo total. ` +
    "Si ninguno sirve, elegido = null.\n" +
    "Respondé sólo JSON: {\"componentes\":\"...\",\"veredictos\":[{\"n\":3,\"v\":\"si\",\"unidades\":2,\"falta\":\"inflador\",\"motivo\":\"...\"}]," +
    "\"elegido\":3,\"costoUsd\":24.5,\"motivo\":\"por qué ese\"}. Usá los números de los candidatos tal como vienen.";
  const [fotoML, ...fotos] = await Promise.all([aBase64(ml.foto), ...elegidos.map((n) => aBase64(candidatos[n - 1].foto))]);
  const armar = (conFotos: boolean): Contenido => {
    const c: Contenido = [{ type: "text", text: cabeza }];
    if (fotoML) c.push({ type: "image", source: { type: "base64", media_type: fotoML.media_type, data: fotoML.data } });
    c.push({ type: "text", text: `Candidatos:\n${elegidos.map((n) => lineaCandidato(candidatos[n - 1], n)).join("\n")}` });
    if (conFotos) elegidos.forEach((n, i) => {
      const f = fotos[i];
      if (!f) return;
      c.push({ type: "text", text: `Foto del candidato ${n}:` });
      c.push({ type: "image", source: { type: "base64", media_type: f.media_type, data: f.data } });
    });
    return c;
  };
  let r = await pedirClaude({ system, contenido: armar(true), maxTokens: 2500, modelo: "medio", effort: "low" });
  tokensIn += r.tokensIn; tokensOut += r.tokensOut; usd += r.usd;
  let nota = "";
  if ("error" in r) {
    nota = `Sin fotos de China porque: ${r.error.slice(0, 300)}`;
    console.error("[piloto] juez con fotos falló:", r.error);
    r = await pedirClaude({ system, contenido: armar(false), maxTokens: 2500, modelo: "medio", effort: "low" });
    tokensIn += r.tokensIn; tokensOut += r.tokensOut; usd += r.usd;
  }
  if ("error" in r) return { juicio: vacio("", { error: r.error, preseleccion: elegidos }), tokensIn, tokensOut, usd };
  const j = jsonDe<Juicio>(r.texto);
  if (!j) return { juicio: vacio("", { error: "Claude contestó en otro formato", preseleccion: elegidos }), tokensIn, tokensOut, usd };
  return {
    juicio: {
      componentes: j.componentes, veredictos: (j.veredictos ?? []).filter((v) => v.v === "si" || v.v === "dudoso"),
      elegido: typeof j.elegido === "number" ? j.elegido : null, costoUsd: typeof j.costoUsd === "number" ? j.costoUsd : null,
      motivo: j.motivo ?? "", preseleccion: elegidos, ...(nota ? { nota } : {}),
    } as Juicio,
    tokensIn, tokensOut, usd,
  };
}
