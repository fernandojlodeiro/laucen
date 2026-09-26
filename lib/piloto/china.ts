// Piloto, lado China: traducir el título, buscar en 1688 y Alibaba, estimar
// la caja de envío y juzgar los resultados. Claude hace la traducción, la
// estimación de la caja y el juicio.

import { correrConEntrada } from "@/lib/apify";
import { jsonDe, pedirClaude, type Contenido } from "@/lib/claude";
import { traducir, esFalla } from "@/lib/china/traducir";
import type { Caja, Candidato, Franja, Juicio, Parametros } from "./tipos";

// Actores elegidos en el banco de China: rápidos y con precio.
const ACTOR_1688 = "parseforge~1688-scraper";
const ACTOR_ALIBABA = "memo23~alibaba-scraper";
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

export type BusquedaChina = { en: string; zh: string; candidatos: Candidato[]; costoUsd: number; errores: string[]; tokensIn: number; tokensOut: number };

/** Traduce el título y busca en 1688 (en chino) y Alibaba (en inglés). */
export async function buscarEnChina(titulo: string, p: Parametros, puedeGastar: (usd: number) => boolean): Promise<BusquedaChina> {
  const t = await traducir(titulo);
  if (!t || esFalla(t)) {
    return { en: "", zh: "", candidatos: [], costoUsd: 0, errores: [`No se pudo traducir: ${t && esFalla(t) ? t.motivo : "sin llave de Claude"}`], tokensIn: 0, tokensOut: 0 };
  }
  const errores: string[] = [];
  let costoUsd = 0;
  const corridas = await Promise.all(([
    ["1688", ACTOR_1688, { searchTerms: [t.zh], maxItems: POR_SITIO }],
    ["alibaba", ACTOR_ALIBABA, { searchTerms: [t.en], maxItems: POR_SITIO, maxPages: 1 }],
  ] as const).map(async ([sitio, actor, entrada]) => {
    if (!puedeGastar(0.05)) { errores.push(`${sitio}: tope de gasto de Apify`); return []; }
    const c = await correrConEntrada(actor, entrada, { max: POR_SITIO, esperaSeg: 120, topeUsd: 0.1 });
    costoUsd += c.costoUsd ?? 0;
    if (!c.items.length) errores.push(`${sitio}: ${c.error ?? "sin resultados"}`);
    return (c.items as Record<string, unknown>[]).map((x) => aCandidato(sitio, x, p.yuanPorDolar));
  }));
  // La traducción la cuenta traducir() aparte; acá sólo lo de Apify.
  return { en: t.en, zh: t.zh, candidatos: corridas.flat(), costoUsd, errores, tokensIn: 0, tokensOut: 0 };
}

/** Estima la caja de envío de una unidad de cada producto (medidas en cm y
 *  kg), mirando título y foto. De a varios productos por pedido. */
export async function estimarCajas(productos: { id: number; titulo: string; foto: string | null }[]) {
  const contenido: Contenido = [];
  for (const p of productos) {
    contenido.push({ type: "text", text: `Producto ${p.id}: ${p.titulo}` });
    if (p.foto) contenido.push({ type: "image", source: { type: "url", url: p.foto } });
  }
  const pedido = {
    system: "Sos despachante e importador. Para cada producto estimá la caja de envío de UNA unidad tal como viene de fábrica " +
      "(embalaje individual): largo, ancho y alto en centímetros y peso bruto en kg. Si el producto se vende en pack, es la caja del pack. " +
      "Respondé sólo JSON: {\"cajas\":[{\"id\":123,\"largo\":30,\"ancho\":20,\"alto\":10,\"kg\":1.2,\"nota\":\"breve\"}]}.",
    maxTokens: 3000,
  };
  let r = await pedirClaude({ ...pedido, contenido });
  // Si alguna foto no se pudo bajar, se reintenta sin fotos.
  let tokensIn = r.tokensIn, tokensOut = r.tokensOut;
  if ("error" in r) {
    r = await pedirClaude({ ...pedido, contenido: productos.map((p) => `Producto ${p.id}: ${p.titulo}`).join("\n") });
    tokensIn += r.tokensIn; tokensOut += r.tokensOut;
  }
  const cajas = new Map<number, Caja>();
  if ("texto" in r) {
    for (const c of jsonDe<{ cajas?: (Omit<Caja, "fuente"> & { id: number })[] }>(r.texto)?.cajas ?? []) {
      if ([c.largo, c.ancho, c.alto, c.kg].every((n) => typeof n === "number" && n > 0)) {
        cajas.set(c.id, { largo: c.largo, ancho: c.ancho, alto: c.alto, kg: c.kg, fuente: "claude", nota: c.nota });
      }
    }
  }
  return { cajas, error: "error" in r ? r.error : null, tokensIn, tokensOut };
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

/** El juez: compara el producto de Mercado Libre contra los candidatos de
 *  China, marca cada uno (equiparable / dudoso / no es) y elige el mejor. */
export async function juzgar(ml: { titulo: string; foto: string | null; precio: number | null }, candidatos: Candidato[], p: Parametros) {
  if (!candidatos.length) return { juicio: { veredictos: [], elegido: null, motivo: "No hubo resultados en China." } as Juicio, tokensIn: 0, tokensOut: 0 };
  const system =
    "Sos el comprador de un importador argentino que compra en China a través de un agente. Te doy un producto que se vende en Mercado Libre " +
    "y una lista numerada de productos de 1688 y Alibaba. Tareas:\n" +
    "1) Para cada candidato decidí si es EQUIPARABLE al de Mercado Libre (\"si\": mismo producto o equivalente directo, que se podría vender como ese), " +
    "\"dudoso\" (parecido pero con alguna diferencia importante o datos insuficientes) o \"no\" (otro producto, un repuesto, un accesorio, otro tamaño o capacidad muy distinta). " +
    "Motivo en una línea corta, en castellano.\n" +
    `2) Entre los "si", elegí el mejor candidato para comprar: el precio unitario más bajo con un pedido mínimo de hasta ${p.minimoMax} unidades; ` +
    "con precios parecidos (±10%), el proveedor más confiable (fábrica, más años, más ventas). Si no hay ningún \"si\", elegido = null.\n" +
    "Respondé sólo JSON: {\"veredictos\":[{\"n\":1,\"v\":\"si\",\"motivo\":\"...\"}],\"elegido\":3,\"motivo\":\"por qué ese\"}.";
  const lista = candidatos.map((c, i) =>
    `${i + 1}. [${c.sitio}] ${c.titulo} | ${c.usd != null ? `US$ ${c.usd}` : "sin precio"}${c.precioTexto ? ` (${c.precioTexto})` : ""}` +
    ` | mínimo ${c.minimo ?? "?"} | ${c.proveedor ?? "proveedor ?"}${c.fabrica ? ", fábrica" : ""}${c.anios ? `, ${c.anios} años` : ""}${c.ventas ? `, ventas ${c.ventas}` : ""}`).join("\n");
  const cabeza = `Mercado Libre: ${ml.titulo} — $${ml.precio ?? "?"} (pesos)`;

  const conFotos: Contenido = [{ type: "text", text: cabeza }];
  if (ml.foto) conFotos.push({ type: "image", source: { type: "url", url: ml.foto } });
  conFotos.push({ type: "text", text: `Candidatos:\n${lista}\n\nFotos de los candidatos (el número es el de la lista):` });
  candidatos.forEach((c, i) => {
    if (c.foto) {
      conFotos.push({ type: "text", text: `Foto ${i + 1}:` });
      conFotos.push({ type: "image", source: { type: "url", url: c.foto } });
    }
  });
  let r = await pedirClaude({ system, contenido: conFotos, maxTokens: 6000, effort: "medium" });
  let tokensIn = r.tokensIn, tokensOut = r.tokensOut, sinFotos = false;
  if ("error" in r) {
    // Alguna foto de China no se pudo bajar: se juzga sólo con la foto de Mercado Libre.
    const soloML: Contenido = [{ type: "text", text: cabeza }];
    if (ml.foto) soloML.push({ type: "image", source: { type: "url", url: ml.foto } });
    soloML.push({ type: "text", text: `Candidatos (sin fotos):\n${lista}` });
    r = await pedirClaude({ system, contenido: soloML, maxTokens: 6000, effort: "medium" });
    tokensIn += r.tokensIn; tokensOut += r.tokensOut; sinFotos = true;
  }
  if ("error" in r) return { juicio: { veredictos: [], elegido: null, motivo: "", error: r.error } as Juicio, tokensIn, tokensOut };
  const j = jsonDe<Juicio>(r.texto);
  if (!j) return { juicio: { veredictos: [], elegido: null, motivo: "", error: "Claude contestó en otro formato" } as Juicio, tokensIn, tokensOut };
  return {
    juicio: { veredictos: j.veredictos ?? [], elegido: typeof j.elegido === "number" ? j.elegido : null,
      motivo: (j.motivo ?? "") + (sinFotos ? " (juzgado sin las fotos de China)" : "") },
    tokensIn, tokensOut,
  };
}
