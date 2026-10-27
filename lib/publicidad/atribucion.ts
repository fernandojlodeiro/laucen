// De dónde vino cada uno (embudo de publicidad, Fer 25/10 y 26/10; como lib/atribucion-anuncios.ts de CadaMes). Puro.
//
// · Cada visitante de la tienda lleva en su navegador un sello con sus entradas (GALLETA_ENTRADAS): la primera, la
//   última y cada entrada desde un anuncio de los últimos 30 días. Una «entrada» es llegar a la tienda desde afuera:
//   el link de un anuncio (utm_*, y el «clid» que agrega cada plataforma: fbclid de Meta, gclid de Google, ttclid de
//   TikTok), un buscador, Mercado Libre, una red social, otra página, o escribiendo la dirección.
// · La regla (Fer, 26/10): si en los 30 días anteriores a la compra o a la consulta hubo una entrada desde un anuncio,
//   el crédito es del ÚLTIMO anuncio de esos 30 días, aunque la última visita haya sido por otro lado. Si no, de la
//   última entrada. Se guarda lo acreditado, la primera entrada y el visitante (pedido.atribucion, chat.atribucion).
// · WhatsApp e Instagram: cuando alguien escribe desde un anuncio «Enviar mensaje», Meta le pega el anuncio al primer
//   mensaje (referral). Desde el botón de WhatsApp de la tienda, el mensaje lleva un código invisible que apunta a la
//   visita (codigoInvisible): el chat se queda con lo acreditado a esa visita.
//
// El id del anuncio de Meta no viene solo en el link: hay que pedirlo en el anuncio, en «Parámetros de URL»
// (PARAMETROS_META). Sin él, la venta cuenta para Meta pero no para un anuncio en particular.

export type Plataforma = "meta" | "google" | "tiktok";
/** anuncio: link de un anuncio de Meta, Google o TikTok · campana: link con utm de otra cosa (un mail, un posteo) ·
 *  organico: un buscador · mercadolibre · social: una red social sin anuncio · referido: otra página · directo. */
export type TipoEntrada = "anuncio" | "campana" | "organico" | "mercadolibre" | "social" | "referido" | "directo";
export type Entrada = {
  tipo: TipoEntrada; plataforma: Plataforma | null; anuncio_id: string | null; campana: string | null;
  fuente: string | null; medio: string | null;
  /** El fbclid / gclid / ttclid del link (Meta lo pide para cruzar la venta con el clic). */
  clid: string | null;
  ts: string;
};
/** desde: web (compró en la tienda o escribió desde su botón de WhatsApp) · mensaje (anuncio «Enviar mensaje» de
 *  Meta) · directo (escribió sin pasar por la tienda). */
export type Atribucion = Entrada & { primera: Entrada | null; visitante: string | null; desde: "web" | "mensaje" | "directo" };

/** Lo que conviene poner en «Parámetros de URL» de cada anuncio de Meta: así el pedido sabe de qué anuncio vino. */
export const PARAMETROS_META = "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.id}}";

/** Lo mismo para Google Ads: en la cuenta (o la campaña), «Sufijo de URL final». {creative} es el id del anuncio. */
export const PARAMETROS_GOOGLE = "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}";

export const GALLETA_ENTRADAS = "lc_entradas";
export const GALLETA_VISITANTE = "lc_visitante";
/** La ventana de la regla: un anuncio cuenta durante 30 días (lo habitual en las plataformas). */
export const DIAS_ANUNCIO = 30;
const MAX_ANUNCIOS = 6;

const corto = (x: string | null | undefined, n = 120) => (x ? x.trim().slice(0, n) || null : null);

function plataformaDe(fuente: string | null, p: URLSearchParams): Plataforma | null {
  if (p.get("fbclid")) return "meta";
  if (p.get("gclid") || p.get("gbraid") || p.get("wbraid")) return "google";
  if (p.get("ttclid")) return "tiktok";
  const f = (fuente ?? "").toLowerCase();
  if (/^(meta|facebook|fb|instagram|ig)$/.test(f)) return "meta";
  if (/^(google|adwords|gads)$/.test(f)) return "google";
  if (/^(tiktok|tt)$/.test(f)) return "tiktok";
  return null;
}

/** Los parámetros de un link → la entrada de un anuncio (o de una campaña con utm), o null si no tiene. */
export function entradaDeParametros(p: URLSearchParams, ahora = new Date()): Entrada | null {
  const fuente = corto(p.get("utm_source"));
  const plataforma = plataformaDe(fuente, p);
  if (!plataforma && !fuente) return null;
  const contenido = corto(p.get("utm_content"), 40);
  return {
    tipo: plataforma ? "anuncio" : "campana", plataforma,
    // El id del anuncio: utm_content cuando es un número (lo que pone PARAMETROS_META), o utm_id.
    anuncio_id: contenido && /^\d{5,30}$/.test(contenido) ? contenido : corto(p.get("utm_id"), 40),
    campana: corto(p.get("utm_campaign")), fuente: fuente ?? plataforma, medio: corto(p.get("utm_medium")),
    clid: corto(p.get("fbclid") ?? p.get("gclid") ?? p.get("gbraid") ?? p.get("wbraid") ?? p.get("ttclid"), 300),
    ts: ahora.toISOString(),
  };
}

const sinDatos = (tipo: TipoEntrada, fuente: string | null, ahora: Date): Entrada =>
  ({ tipo, plataforma: null, anuncio_id: null, campana: null, fuente, medio: null, clid: null, ts: ahora.toISOString() });

/** Una llegada a la tienda desde afuera → su entrada: el link de un anuncio, o de dónde venía (la página anterior). */
export function entradaDeVisita(p: URLSearchParams, referer: string | null, host: string, ahora = new Date()): Entrada {
  const anuncio = entradaDeParametros(p, ahora);
  if (anuncio) return anuncio;
  let de: string | null = null;
  try { de = referer ? new URL(referer).hostname.toLowerCase().replace(/^www\./, "") : null; } catch { de = null; }
  if (!de || de === host.replace(/^www\./, "")) return sinDatos("directo", null, ahora);
  if (/(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex)\./.test(de)) return sinDatos("organico", de.split(".").find((x) => /google|bing|yahoo|duckduckgo|ecosia|yandex/.test(x)) ?? de, ahora);
  if (/mercadoli(b|v)re|mlstatic/.test(de)) return sinDatos("mercadolibre", "mercadolibre", ahora);
  if (/(^|\.)(facebook|fb|instagram|t|twitter|x|tiktok|youtube|linkedin|pinterest|wa|whatsapp)\.(com|me|co)$|^l\.facebook|^lm\.facebook|^l\.instagram/.test(de)) return sinDatos("social", de, ahora);
  return sinDatos("referido", de.slice(0, 80), ahora);
}

/** El sello del visitante: la primera entrada, la última y las de anuncios de los últimos 30 días. */
export type Entradas = { primera: Entrada; ultima: Entrada; anuncios: Entrada[] };

const dentroDe30 = (e: Entrada, ahora: Date) => ahora.getTime() - new Date(e.ts).getTime() <= DIAS_ANUNCIO * 86_400_000;

export function sumarEntrada(antes: Entradas | null, e: Entrada, ahora = new Date()): Entradas {
  const anuncios = [...(antes?.anuncios ?? []), ...(e.tipo === "anuncio" ? [e] : [])].filter((x) => dentroDe30(x, ahora)).slice(-MAX_ANUNCIOS);
  return { primera: antes?.primera ?? e, ultima: e, anuncios };
}

/** La regla: el último anuncio de los últimos 30 días; si no hubo, la última entrada. */
export function credito(x: Entradas, ahora = new Date()): Entrada {
  return x.anuncios.filter((a) => dentroDe30(a, ahora)).at(-1) ?? x.ultima;
}

/** Lo que se guarda en el pedido o en el chat. Sin sello (otro navegador, galletas borradas): directo. */
export function atribucionDe(x: Entradas | null, visitante: string | null, desde: Atribucion["desde"], ahora = new Date()): Atribucion {
  return { ...(x ? credito(x, ahora) : sinDatos("directo", null, ahora)), primera: x?.primera ?? null, visitante, desde };
}

/** Lo que Meta pega al primer mensaje de WhatsApp (referral: source_type «ad», source_id = el anuncio) o de Instagram
 *  (referral: source «ADS», ad_id). null si no vino de un anuncio. */
export function atribucionDeReferral(r: unknown, ahora = new Date()): Atribucion | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const tipo = String(o.source_type ?? o.source ?? "").toLowerCase();
  const anuncio = corto(String(o.ad_id ?? (tipo === "ad" || tipo === "ads" ? o.source_id ?? "" : "")), 40);
  if (!anuncio && tipo !== "ad" && tipo !== "ads") return null;
  const ctx = (o.ads_context_data ?? {}) as Record<string, unknown>;
  return {
    tipo: "anuncio", plataforma: "meta", anuncio_id: anuncio, campana: corto(String(o.headline ?? ctx.ad_title ?? "")),
    fuente: "meta", medio: "mensaje", clid: corto(String(o.ctwa_clid ?? ""), 300), ts: ahora.toISOString(),
    primera: null, visitante: null, desde: "mensaje",
  };
}

/** Un chat que no vino de la tienda ni de un anuncio. */
export const directo = (ahora = new Date()): Atribucion => ({ ...sinDatos("directo", null, ahora), primera: null, visitante: null, desde: "directo" });

/** Los robots (buscadores, vistas previas de links, revisores de anuncios) recorren la tienda y siguen el botón de
 *  WhatsApp: no son visitas ni consultas. */
export const esRobot = (ua: string | null | undefined) =>
  !ua || /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebot|preview|headless|lighthouse|adsbot|mediapartners|google-|whatsapp|telegram|curl|wget|python|axios|node-fetch|go-http|java\//i.test(ua);

// ── El sello en la galleta ─────────────────────────────────────────────

const TIPOS: TipoEntrada[] = ["anuncio", "campana", "organico", "mercadolibre", "social", "referido", "directo"];
function entradaValida(o: unknown): Entrada | null {
  if (!o || typeof o !== "object") return null;
  const x = o as Partial<Entrada>;
  if (!x.ts || !TIPOS.includes(x.tipo as TipoEntrada)) return null;
  const p = x.plataforma;
  return {
    tipo: x.tipo as TipoEntrada, plataforma: p === "meta" || p === "google" || p === "tiktok" ? p : null,
    anuncio_id: corto(x.anuncio_id ?? null, 40), campana: corto(x.campana ?? null), fuente: corto(x.fuente ?? null),
    medio: corto(x.medio ?? null), clid: corto(x.clid ?? null, 300), ts: String(x.ts),
  };
}

export const aGalleta = (x: Entradas) => JSON.stringify(x);
export function deGalleta(v: string | null | undefined): Entradas | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v) as Partial<Entradas>;
    const primera = entradaValida(o.primera), ultima = entradaValida(o.ultima);
    if (!primera || !ultima) return null;
    return { primera, ultima, anuncios: (Array.isArray(o.anuncios) ? o.anuncios : []).map(entradaValida).filter((e): e is Entrada => !!e) };
  } catch { return null; }
}

// ── El código invisible del botón de WhatsApp ──────────────────────────
// Fer (26/10): que el comprador no vea nada. El código va al final del texto con caracteres de ancho cero (cuatro
// distintos = dígitos en base 4), entre dos marcas. Si WhatsApp los sacara, el chat queda como «directo».

export const LETRAS_REF = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DIGITOS = ["​", "‌", "‍", "⁠"];
const MARCA = "⁣";

export const codigoRef = (azar: () => number = Math.random) => Array.from({ length: 4 }, () => LETRAS_REF[Math.floor(azar() * LETRAS_REF.length)]).join("");

export function codigoInvisible(codigo: string): string {
  const d = [...codigo].flatMap((l) => { const i = LETRAS_REF.indexOf(l); return [Math.floor(i / 16), Math.floor(i / 4) % 4, i % 4]; });
  return `${MARCA}${d.map((x) => DIGITOS[x]).join("")}${MARCA}`;
}

export const conCodigo = (texto: string, codigo: string) => `${texto.trim()}${codigoInvisible(codigo)}`;

/** El mensaje que llegó → el código (o null) y el texto sin los caracteres invisibles. */
export function sacarCodigo(texto: string | null | undefined): { codigo: string | null; limpio: string } {
  const t = texto ?? "";
  const m = new RegExp(`${MARCA}([${DIGITOS.join("")}]{3,24})${MARCA}`).exec(t);
  let codigo: string | null = null;
  if (m && m[1].length % 3 === 0) {
    const d = [...m[1]].map((c) => DIGITOS.indexOf(c));
    const letras: string[] = [];
    for (let i = 0; i < d.length; i += 3) letras.push(LETRAS_REF[d[i] * 16 + d[i + 1] * 4 + d[i + 2]] ?? "");
    codigo = letras.join("") || null;
  }
  const limpio = t.replace(new RegExp(`[${MARCA}${DIGITOS.join("")}]`, "g"), "").trim();
  return { codigo, limpio };
}
