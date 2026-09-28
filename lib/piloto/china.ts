// Piloto, lado China: traducir el título, buscar (AliExpress con precio
// puesto en China —de ahí lo embarca el agente—; o 1688 y
// Alibaba en los pilotos viejos), estimar la caja de envío y juzgar. Lo
// mecánico va con el modelo chico de Claude; el juez, con el del medio.

import { correrActor, correrConEntrada } from "@/lib/apify";
import Anthropic from "@anthropic-ai/sdk";
import { pedirIA, type Proveedor } from "@/lib/ia";
import { MODELOS, USD_POR_BUSQUEDA, clienteClaude, costoUsd, jsonDe, pedirClaude, type Contenido } from "@/lib/claude";
import { traducir, esFalla } from "@/lib/china/traducir";
import { aBase64 } from "@/lib/imagenes";
import type { Caja, Candidato, Ficha, Franja, Juicio, Parametros, Sitio } from "./tipos";

// Actores elegidos en el banco de China: rápidos y con precio.
const ACTOR_1688 = "parseforge~1688-scraper";
const ACTOR_ALIBABA = "memo23~alibaba-scraper";
// AliExpress: el primero del banco (27/9); se prueban los otros en el banco.
export const ACTOR_ALIEXPRESS = "dami_studio~aliexpress-products-scraper";
const POR_SITIO = 20;
// Mientras el piloto está en prueba, el mejor modelo en todos los pasos (Fer,
// 28/9: "la idea es que funcione y sirva"). Cuando esté estable, se prueba bajar.
const MODELO = "grande" as const;

const primerNumero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const ultimoNumero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const ms = String(v ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/g);
  return ms ? Number(ms[ms.length - 1]) : null;
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
    // El más alto del rango: suele ser el del pedido mínimo (Fer, 28/9: siempre el más conservador).
    usd: ultimoNumero(x.price) ?? primerNumero(x.priceMax ?? x.priceMin), minimo: primerNumero(x.minOrder),
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

export type BusquedaChina = { en: string; zh: string; candidatos: Candidato[]; costoUsd: number; runIds?: string[]; errores: string[]; tokensIn: number; tokensOut: number };

/** Traduce el título y busca en los sitios del piloto: AliExpress (en
 *  inglés, con envío dentro de China, en dólares), 1688 (en chino), Alibaba (en inglés). */
/** Arma la búsqueda para China a partir de la publicación de Mercado Libre:
 *  sin marca, modelo, color ni palabras de venta, como la escribiría un
 *  comprador (Fer, 28/9: "no hay chances de que en China un producto no
 *  exista"; si no aparece, es que se buscó mal). Con `previa`, la búsqueda
 *  anterior no sirvió y se pide otra distinta. */
async function armarBusqueda(titulo: string, ia: Proveedor | undefined, texto?: string, previa?: { en: string; motivo: string }) {
  const r = await pedirIA(ia, {
    maxTokens: 600,
    system: "Armás la búsqueda para encontrar en Alibaba el mismo producto que se vende en Mercado Libre. Sacá marca, número de modelo, " +
      "color, capacidad de carga, garantía y palabras de venta: nada de eso existe en China con ese nombre. Dejá el tipo de producto, " +
      "la medida o tamaño principal y lo que lo distingue (con bomba eléctrica, flocado, con inflador manual, etc.). En inglés, de 3 a 7 " +
      "palabras, como lo buscaría un comprador mayorista; y en chino simplificado para 1688. Respondé sólo JSON: {\"en\":\"...\",\"zh\":\"...\"}.",
    contenido: `Producto: ${titulo}${texto ? `\nDatos: ${texto.slice(0, 800)}` : ""}` +
      (previa ? `\n\nLa búsqueda anterior "${previa.en}" no encontró el mismo producto. Por qué: ${previa.motivo}\n` +
        "Proponé otra búsqueda distinta: más general o con otras palabras (sinónimos de la industria), sin repetir la anterior." : ""),
  });
  const j = "texto" in r ? jsonDe<{ en?: string; zh?: string }>(r.texto) : null;
  return { en: j?.en?.trim() ?? "", zh: j?.zh?.trim() ?? "", tokensIn: r.tokensIn, tokensOut: r.tokensOut, usd: r.usd };
}

export async function buscarEnChina(titulo: string, p: Parametros, puedeGastar: (usd: number) => boolean,
  opciones: { texto?: string; previa?: { en: string; motivo: string } } = {}): Promise<BusquedaChina & { muestra?: string; claudeUsd?: number }> {
  const armada = await armarBusqueda(titulo, p.ia, opciones.texto, opciones.previa).catch(() => null);
  const t = armada?.en ? { en: armada.en, zh: armada.zh || armada.en } : await traducir(titulo);
  if (!t || esFalla(t)) {
    return { en: "", zh: "", candidatos: [], costoUsd: 0, errores: [`No se pudo traducir: ${t && esFalla(t) ? t.motivo : "sin llave de Claude"}`], tokensIn: 0, tokensOut: 0 };
  }
  const sitios: Sitio[] = p.sitios?.length ? p.sitios : ["1688", "alibaba"];
  const errores: string[] = [];
  let costoUsd = 0;
  const runIds: string[] = [];
  let muestra: string | undefined;
  const corridas = await Promise.all(sitios.map(async (sitio) => {
    if (!puedeGastar(0.05)) { errores.push(`${sitio}: tope de gasto de Apify`); return []; }
    if (sitio === "aliexpress") {
      // La entrada se arma desde el esquema del actor (lib/apify.ts).
      const r = await correrActor(ACTOR_ALIEXPRESS, t.en, POR_SITIO, 120,
        { urlBusqueda: `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(t.en.replace(/\s+/g, "-"))}.html`, pais: "CN", moneda: "USD" });
      costoUsd += r.costo_usd ?? 0;
      if (r.runId) runIds.push(r.runId);
      if (!r.items?.length) errores.push(`aliexpress: ${r.error ?? "sin resultados"}`);
      muestra = r.items?.[0] ? JSON.stringify(r.items[0]).slice(0, 2000) : undefined;
      return ((r.items ?? []) as Record<string, unknown>[]).map(aCandidatoAliexpress).filter((c) => c.titulo !== "(sin título)");
    }
    const [actor, entrada] = sitio === "1688"
      ? [ACTOR_1688, { searchTerms: [t.zh], maxItems: POR_SITIO }]
      : [ACTOR_ALIBABA, { searchTerms: [t.en], maxItems: POR_SITIO, maxPages: 1 }];
    const c = await correrConEntrada(actor, entrada, { max: POR_SITIO, esperaSeg: 120, topeUsd: 0.1 });
    costoUsd += c.costoUsd ?? 0;
    if (c.runId) runIds.push(c.runId);
    if (!c.items.length) errores.push(`${sitio}: ${c.error ?? "sin resultados"}`);
    return (c.items as Record<string, unknown>[]).map((x) => aCandidato(sitio, x, p.yuanPorDolar));
  }));
  // La traducción no se cuenta acá (va con el modelo chico, centavos).
  return { en: t.en, zh: t.zh, candidatos: corridas.flat(), costoUsd, runIds, errores,
    tokensIn: armada?.tokensIn ?? 0, tokensOut: armada?.tokensOut ?? 0, claudeUsd: armada?.usd ?? 0, muestra };
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
      "OJO: la caja es la del producto EMBALADO, no armado: un colchón inflable viaja desinflado y doblado (una caja de zapatos grande), " +
      "una silla plegable viaja plegada, un mueble viaja desarmado. Las medidas de uso (inflado, armado, desplegado) NO son la caja. " +
      "Si los datos de la publicación traen medidas o peso DEL PAQUETE, usalos; si sólo traen las del producto armado, estimá el embalaje a partir de eso " +
      "y poné fuente \"descripcion\"; si no hay datos, estimá por la foto y el título y poné fuente \"estimado\". " +
      "Respondé sólo JSON: {\"cajas\":[{\"id\":123,\"largo\":30,\"ancho\":20,\"alto\":10,\"kg\":1.2,\"fuente\":\"descripcion\",\"nota\":\"breve\"}]}.",
    maxTokens: 3000,
    modelo: MODELO,
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

/** El filtro barco/avión (Fer, 28/9): siempre con lo que costaría por AVIÓN.
 *  Peso cobrable = el mayor entre el peso real y el volumétrico (largo ×
 *  ancho × alto en cm ÷ 6.000; si no hay medidas, sólo el peso). Flete =
 *  kg cobrables × US$ por kilo, como % del precio de venta.
 *  Barco: entra si el avión se come mucho (% ≥ seguro), zona gris entre gris
 *  y seguro, abajo no se busca (conviene avión). Avión: al revés. */
export function flete(caja: Caja, precioPesos: number | null, p: Parametros): { usd: number; pct: number | null; franja: Franja | null } {
  const volumetrico = caja.largo && caja.ancho && caja.alto ? (caja.largo * caja.ancho * caja.alto) / 6000 : 0;
  const usd = Math.max(caja.kg, volumetrico) * p.fleteKgUsd;
  if (!precioPesos) return { usd: Math.round(usd * 100) / 100, pct: null, franja: null };
  const pct = Math.round((usd / (precioPesos / p.dolar)) * 1000) / 10;
  const franja: Franja = p.modo === "avion"
    ? (pct <= p.seguroPct ? "seguro" : pct <= p.grisPct ? "gris" : "fuera")
    : (pct >= p.seguroPct ? "seguro" : pct >= p.grisPct ? "gris" : "fuera");
  return { usd: Math.round(usd * 100) / 100, pct, franja };
}

/** Peso y caja con búsqueda web (como hace Fer en Google: "‹producto› peso
 *  medidas caja"), para los que la publicación no trae el peso. Modelo del
 *  medio con la búsqueda web básica de Anthropic. */
export async function cajasConWeb(productos: { id: number; titulo: string; texto?: string }[]) {
  const cajas = new Map<number, Caja>();
  let tokensIn = 0, tokensOut = 0, usd = 0, busquedas = 0;
  const cliente = clienteClaude();
  const system = "Sos despachante. Para cada producto buscá en la web el peso y las medidas de la CAJA de envío de una unidad " +
    "(producto embalado: desinflado, plegado o desarmado; si es un set, todo el set). Buscá por modelo y marca (ej: \"‹producto› peso medidas caja\"). " +
    "El peso es lo más importante; si no encontrás medidas, poné 0. Si no encontrás nada, estimá y aclaralo en la nota. " +
    "Respondé al final sólo JSON: {\"cajas\":[{\"id\":1,\"kg\":10,\"largo\":100,\"ancho\":40,\"alto\":20,\"fuente\":\"web\" o \"estimado\",\"nota\":\"de dónde\"}]}.";
  const texto = productos.map((p) => `Producto ${p.id}: ${p.titulo}${p.texto ? `\nDatos de la publicación: ${p.texto.slice(0, 600)}` : ""}`).join("\n\n");
  try {
    const mensajes: Anthropic.MessageParam[] = [{ role: "user", content: texto }];
    let r: Anthropic.Message | null = null;
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      r = await cliente.messages.create({
        model: MODELOS[MODELO].id, max_tokens: 3000, system, output_config: { effort: "low" },
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: productos.length * 2 }],
        messages: mensajes,
      });
      tokensIn += r.usage.input_tokens; tokensOut += r.usage.output_tokens;
      busquedas += r.usage.server_tool_use?.web_search_requests ?? 0;
      if (r.stop_reason !== "pause_turn") break;
      mensajes.push({ role: "assistant", content: r.content });
    }
    usd = costoUsd(MODELO, tokensIn, tokensOut) + busquedas * USD_POR_BUSQUEDA;
    const salida = (r?.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("\n");
    for (const c of jsonDe<{ cajas?: { id: number; kg: number; largo?: number; ancho?: number; alto?: number; fuente?: string; nota?: string }[] }>(salida)?.cajas ?? []) {
      if (typeof c.kg === "number" && c.kg > 0) {
        cajas.set(c.id, { largo: c.largo || 0, ancho: c.ancho || 0, alto: c.alto || 0, kg: c.kg,
          fuente: c.fuente === "web" ? "web" : "claude", nota: c.nota });
      }
    }
    return { cajas, error: null as string | null, tokensIn, tokensOut, usd, busquedas };
  } catch (e) {
    return { cajas, error: (e instanceof Error ? e.message : String(e)).slice(0, 300), tokensIn, tokensOut, usd, busquedas };
  }
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
  const usdML = ml.precio ? Math.round((ml.precio / p.dolar) * 100) / 100 : null;
  const cabeza = `Mercado Libre: ${ml.titulo} — $${ml.precio ?? "?"} (pesos)${usdML ? ` ≈ US$ ${usdML} al público en Argentina` : ""}` +
    `${ml.texto ? `\nDatos de la publicación: ${ml.texto.slice(0, 1200)}` : ""}`;

  // 1) Prefiltro barato.
  const pre = await pedirIA(p.ia, {
    maxTokens: 1500,
    // Ampliado por pedido de Fer (28/9, piloto #7): dejaba afuera candidatos
    // que servían porque el título de China es genérico o nombra varias medidas.
    system: "Te doy un producto de Mercado Libre y una lista numerada de productos de China. Devolvé los números de los que PODRÍAN ser " +
      "el mismo tipo de producto (o una parte de él, si el de Mercado Libre es un set), como máximo 15, los más parecidos primero. " +
      "Sé amplio: dejá pasar los de título genérico, los que nombran varias medidas o versiones y los que no dicen la medida, porque la " +
      "variante justa puede estar adentro de la publicación. Descartá sólo lo que es claramente otra cosa: repuestos, accesorios sueltos, " +
      "otro producto. De cada uno que descartes, el motivo en pocas palabras. " +
      "Respondé sólo JSON: {\"n\":[3,7,1],\"fuera\":{\"2\":\"repuesto\",\"5\":\"otro producto: bomba sola\"}}.",
    contenido: `${cabeza}\n\nCandidatos:\n${candidatos.map((c, i) => lineaCandidato(c, i + 1)).join("\n")}`,
  });
  let tokensIn = pre.tokensIn, tokensOut = pre.tokensOut, usd = pre.usd;
  const respPre = "texto" in pre ? jsonDe<{ n?: number[]; fuera?: Record<string, string> }>(pre.texto) : null;
  const descartes = respPre?.fuera && typeof respPre.fuera === "object" ? respPre.fuera : undefined;
  const elegidos = "texto" in pre
    ? [...new Set((respPre?.n ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= candidatos.length))].slice(0, 15)
    : candidatos.slice(0, 15).map((_, i) => i + 1);
  if (!elegidos.length) return { juicio: vacio("Ningún resultado de China parece el mismo producto.", { preseleccion: [], ...(descartes ? { descartes } : {}) }), tokensIn, tokensOut, usd };

  // 2) Juez con fotos, sólo sobre los preseleccionados (con su número original).
  const system =
    "Sos el comprador de un importador argentino. Te doy un producto que se vende en Mercado Libre y algunos candidatos de China, con fotos.\n" +
    "Paso 1: desarmá el producto de Mercado Libre en sus componentes, con cantidades (ej: \"2 colchones dobles + 1 inflador eléctrico + 2 almohadas\"). " +
    "Mirá bien el título, la foto y los datos: sets, packs, 'x2', 'combo', 'kit', 'incluye'.\n" +
    "Paso 2: para cada candidato que sea EL MISMO producto decí \"si\": el producto principal con las mismas características (medida, capacidad, " +
    "potencia, material). Una versión peor en lo principal (otra medida, menos potencia, otro material) es \"dudoso\", nunca \"si\". " +
    "ACCESORIOS Y EXTRAS (Fer, 28/9): si al candidato le falta un accesorio barato que el original trae (almohadas, inflador manual, bolsa, " +
    "parche), igual es \"si\": poné en falta qué falta y sumá su costo estimado en China al costo total; un combo se arma con N unidades del " +
    "producto más los accesorios. Si el candidato trae un extra barato que el original no tiene (almohada, inflador de pie, bolsa), también es " +
    "\"si\" mientras el producto principal sea el mismo y el precio siga dando. MEDIDAS (Fer, 28/9): compará largo, ancho y alto con los de Mercado Libre; una diferencia de 2 o 3 cm está bien, " +
    "pero más de un 10% en cualquiera (ej. 30 cm de alto contra 40) es otro producto: \"si\" sólo si la publicación ofrece la medida justa como variante. " +
    "PRECIO (sentido común): el mismo producto en China cuesta normalmente entre el 10% y el 35% de lo que se vende al público en Argentina; si un " +
    "candidato cuesta más de la mitad del precio de Mercado Libre en dólares, casi seguro es otro producto, otra calidad u otra cantidad: no es \"si\". " +
    "Indicá cuántas unidades del candidato hacen falta (unidades) y qué componente falta (falta), con un motivo corto. " +
    "Listá TODOS los candidatos que te doy, también los que no sirven (v \"no\"), cada uno con su motivo corto: Fer quiere saber por qué " +
    "se descartó cada uno.\n" +
    // Pedido de Fer (28/9, piloto #6): en AliExpress y Alibaba una misma
    // publicación trae varias medidas o versiones y el título no siempre lo dice.
    "Ojo: en China una misma publicación suele tener VARIAS VARIANTES adentro (medidas, versiones, colores, con o sin accesorios) que se eligen " +
    "al comprar; el título a veces las nombra todas ('Single/Double', 'Twin/Queen', '1/2/3 Person', medidas separadas por '/') y a veces ninguna. " +
    "Si el título o la foto indican que entre las variantes está la que coincide con el de Mercado Libre, es \"si\" y en variante poné cuál elegir " +
    "(ej: \"1 plaza 191x99\"). Si el tipo coincide pero no se sabe si está la medida justa, es \"dudoso\" con variante = \"ver medidas en la publicación\". " +
    "El precio que viene es el de la variante más barata: si la que hay que elegir puede ser más cara, decilo en el motivo.\n" +
    `Paso 3: elegí el mejor SÓLO entre los \"si\": el menor costo total para armar el producto completo (unidades × precio + una estimación de lo que falta), ` +
    `con un pedido mínimo de hasta ${p.minimoMax} unidades; a costo parecido, el de más ventas o mejor proveedor. costoUsd = ese costo total. ` +
    // Piloto #8: dejó afuera uno de Alibaba a la mitad de precio "por el pedido mínimo".
    `Un pedido mínimo dentro de ese tope NO es motivo para preferir otro más caro: Alibaba y AliExpress compiten igual. ` +
    "Si ninguno sirve, elegido = null.\n" +
    "Paso 4: la posición arancelaria NCM (Mercosur, 8 dígitos, formato 0000.00.00) con la que se despacharía en Argentina el producto " +
    "de Mercado Libre, según su material y función. Respetá las notas legales de sección y capítulo (por ejemplo, los colchones " +
    "neumáticos o inflables NO van en 94.04: van en 39.26 si son de plástico, 40.16 si son de caucho o 63.06 si son de textil). " +
    "Si dudás entre dos posiciones, poné la otra en ncmAlternativa (si no, no la pongas).\n" +
    "Respondé sólo JSON: {\"componentes\":\"...\",\"veredictos\":[{\"n\":3,\"v\":\"si\",\"unidades\":2,\"falta\":\"inflador\",\"variante\":\"1 plaza\",\"motivo\":\"...\"}]," +
    "\"elegido\":3,\"costoUsd\":24.5,\"motivo\":\"por qué ese\",\"ncm\":\"8516.29.00\"}. Usá los números de los candidatos tal como vienen.";
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
  let r = await pedirIA(p.ia, { system, contenido: armar(true), maxTokens: 6000, effort: "medium" });
  tokensIn += r.tokensIn; tokensOut += r.tokensOut; usd += r.usd;
  let nota = "";
  if ("error" in r) {
    nota = `Sin fotos de China porque: ${r.error.slice(0, 300)}`;
    console.error("[piloto] juez con fotos falló:", r.error);
    r = await pedirIA(p.ia, { system, contenido: armar(false), maxTokens: 6000, effort: "medium" });
    tokensIn += r.tokensIn; tokensOut += r.tokensOut; usd += r.usd;
  }
  if ("error" in r) return { juicio: vacio("", { error: r.error, preseleccion: elegidos }), tokensIn, tokensOut, usd };
  const j = jsonDe<Juicio>(r.texto);
  if (!j) return { juicio: vacio("", { error: "La IA contestó en otro formato", preseleccion: elegidos }), tokensIn, tokensOut, usd };
  return {
    juicio: {
      componentes: j.componentes, veredictos: (j.veredictos ?? []).filter((v) => v.v === "si" || v.v === "dudoso" || v.v === "no"),
      elegido: typeof j.elegido === "number" ? j.elegido : null, costoUsd: typeof j.costoUsd === "number" ? j.costoUsd : null,
      motivo: j.motivo ?? "", preseleccion: elegidos, modelo: r.modelo, ...(descartes ? { descartes } : {}), ncm: typeof j.ncm === "string" ? j.ncm : undefined,
      ...(typeof j.ncmAlternativa === "string" && j.ncmAlternativa ? { ncmAlternativa: j.ncmAlternativa } : {}), ...(nota ? { nota } : {}),
    } as Juicio,
    tokensIn, tokensOut, usd,
  };
}

/** Segunda mirada, ya con las publicaciones de China por dentro (variantes,
 *  atributos, precios por cantidad, caja): ¿es de verdad el mismo producto?
 *  Piloto #11: el juez aceptó otras medidas (30 cm de alto contra 40) mirando
 *  sólo el título. Nunca tira: sin respuesta, no descarta a nadie. */
export async function verificar(ml: { titulo: string; precio: number | null; texto?: string | null }, componentes: string | undefined,
  items: { n: number; titulo: string; usd: number | null; ficha?: Ficha }[], p: Parametros) {
  const usdML = ml.precio ? Math.round((ml.precio / p.dolar) * 100) / 100 : null;
  const r = await pedirIA(p.ia, {
    maxTokens: 3000, effort: "medium",
    system: "Sos el comprador de un importador argentino. Te doy un producto que se vende en Mercado Libre (con sus medidas y su precio al " +
      "público en dólares) y la publicación por dentro de cada candidato de China (variantes, atributos, precios por cantidad, caja). Para cada " +
      "candidato decidí si es EL MISMO producto: el producto principal con las mismas medidas (hasta un 10% de diferencia en cada una, o una " +
      "variante de la publicación que las tenga) y el mismo material. Las medidas del producto están en las variantes (\"size\") y los atributos; " +
      "leelas con cuidado. Si le falta un accesorio barato que el original trae (almohadas, inflador manual, bolsa) o trae un extra barato que el " +
      "original no tiene, igual es el mismo producto: en extrasUsd poné el costo estimado en China de lo que falta, por unidad del producto de " +
      "Mercado Libre (0 si no falta nada). Un combo de Mercado Libre se arma con varias unidades. Mirá también la proporción de precio: el mismo " +
      "producto en China cuesta normalmente entre el 10% y el 35% del precio al público en Argentina; si cuesta más de la mitad, es otro producto, " +
      "otra calidad u otra cantidad.\nCAJA: del empaque de la publicación (packaging: unitSizeCm, unitWeightKg, propiedades) deducí la caja de UNA " +
      "unidad del producto: si el empaque es de varias unidades (cartón con N piezas), dividilo; el peso puede venir en gramos. " +
      'Respondé sólo JSON: {"c":[{"n":3,"igual":true,"variante":"qué variante pedir (medida)","extrasUsd":1.5,' +
      '"caja":{"largo":40,"ancho":30,"alto":12,"kg":2.8},"motivo":"corto"}]}. Sin datos de caja, caja = null.',
    contenido: `Mercado Libre: ${ml.titulo}${usdML ? ` — US$ ${usdML} al público` : ""}\n` +
      (componentes ? `Qué incluye: ${componentes}\n` : "") + (ml.texto ? `Datos: ${ml.texto.slice(0, 1200)}\n` : "") +
      items.map((it) => `\nCandidato ${it.n}: ${it.titulo}\nPrecio: ${it.ficha?.tramos?.length
        ? it.ficha.tramos.map((t) => `US$ ${t.usd} desde ${t.desde} u.`).join(", ") : `US$ ${it.usd ?? "?"} (de la búsqueda)`}\n` +
        `Publicación por dentro: ${(it.ficha?.muestra ?? "(no se pudo leer)").replace(/"(images|videoUrl|imageUrl|supplier)":(\[[^\]]*\]|"[^"]*"|\{[^}]*\})/g, "").slice(0, 2500)}`).join("\n"),
  });
  const j = "texto" in r ? jsonDe<{ c?: { n: number; igual: boolean; variante?: string; motivo?: string; extrasUsd?: number;
    caja?: { largo: number; ancho: number; alto: number; kg: number } | null }[] }>(r.texto) : null;
  return { resultado: j?.c ?? null, error: "error" in r ? r.error : null, tokensIn: r.tokensIn, tokensOut: r.tokensOut, usd: r.usd };
}
