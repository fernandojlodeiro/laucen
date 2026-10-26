// De qué anuncio vino cada uno (embudo de publicidad, Fer 25/10; como lib/atribucion-anuncios.ts de CadaMes). Puro.
//
// · Tienda web: el link de un anuncio llega con parámetros (utm_*, y el «clid» que agrega cada plataforma: fbclid de
//   Meta, gclid de Google, ttclid de TikTok). Al entrar a la tienda se guardan en una galleta (gana el último anuncio, por
//   30 días) y al comprar quedan en el pedido (pedido.atribucion).
// · WhatsApp e Instagram: cuando alguien escribe desde un anuncio «Enviar mensaje», Meta le pega el anuncio al primer
//   mensaje (referral). Si no se lee ahí, no se recupera nunca. Queda en el chat (chat.atribucion).
//
// El id del anuncio de Meta no viene solo en el link: hay que pedirlo en el anuncio, en «Parámetros de URL»
// (PARAMETROS_META). Sin él, la venta cuenta para Meta pero no para un anuncio en particular.

export type Plataforma = "meta" | "google" | "tiktok";
export type Atribucion = {
  plataforma: Plataforma | null; anuncio_id: string | null; campana: string | null;
  fuente: string | null; medio: string | null; ts: string;
};

/** Lo que conviene poner en «Parámetros de URL» de cada anuncio de Meta: así el pedido sabe de qué anuncio vino. */
export const PARAMETROS_META = "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.id}}";

/** Lo mismo para Google Ads: en la cuenta (o la campaña), «Sufijo de URL final». {creative} es el id del anuncio. */
export const PARAMETROS_GOOGLE = "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}";

export const GALLETA_ORIGEN = "lc_origen";
/** Gana el último anuncio por 30 días (lo habitual en las plataformas). */
export const DIAS_ORIGEN = 30;

const corto = (x: string | null | undefined, n = 120) => (x ? x.trim().slice(0, n) || null : null);

/** La plataforma por la fuente que dice el link. */
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

/** Los parámetros de un link → la atribución, o null si no viene de un anuncio (o de una campaña con utm). */
export function atribucionDeParametros(p: URLSearchParams, ahora = new Date()): Atribucion | null {
  const fuente = corto(p.get("utm_source"));
  const plataforma = plataformaDe(fuente, p);
  if (!plataforma && !fuente) return null;
  const contenido = corto(p.get("utm_content"), 40);
  return {
    plataforma,
    // El id del anuncio: utm_content cuando es un número (lo que pone PARAMETROS_META), o utm_id.
    anuncio_id: contenido && /^\d{5,30}$/.test(contenido) ? contenido : corto(p.get("utm_id"), 40),
    campana: corto(p.get("utm_campaign")), fuente: fuente ?? plataforma, medio: corto(p.get("utm_medium")),
    ts: ahora.toISOString(),
  };
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
    plataforma: "meta", anuncio_id: anuncio, campana: corto(String(o.headline ?? ctx.ad_title ?? "")),
    fuente: "meta", medio: "mensaje", ts: ahora.toISOString(),
  };
}

/** El código corto que va en el texto del botón de WhatsApp de la tienda: «… (ref A7K2)». Sin letras que se confunden. */
export const LETRAS_REF = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const codigoRef = (azar: () => number = Math.random) => Array.from({ length: 4 }, () => LETRAS_REF[Math.floor(azar() * LETRAS_REF.length)]).join("");
export const conRef = (texto: string, codigo: string) => `${texto.trim()} (ref ${codigo})`;
/** El código de un mensaje que llegó desde el botón, o null. */
export function refDelMensaje(texto: string | null | undefined): string | null {
  const m = /\(ref ([A-Z0-9]{4,6})\)/i.exec(texto ?? "");
  return m ? m[1].toUpperCase() : null;
}

/** El origen de un chat que no vino de un anuncio: escribió desde el botón de la tienda («web») o directo. */
export const sinAnuncio = (fuente: "web" | "directo", ahora = new Date()): Atribucion =>
  ({ plataforma: null, anuncio_id: null, campana: null, fuente, medio: fuente === "web" ? "boton_whatsapp" : null, ts: ahora.toISOString() });

/** La galleta: el JSON de la atribución (chico, sin datos personales). */
export const aGalleta = (a: Atribucion) => JSON.stringify(a);
export function deGalleta(v: string | null | undefined): Atribucion | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v) as Partial<Atribucion>;
    if (!o || typeof o !== "object" || !o.ts) return null;
    const p = o.plataforma;
    return {
      plataforma: p === "meta" || p === "google" || p === "tiktok" ? p : null, anuncio_id: corto(o.anuncio_id ?? null, 40),
      campana: corto(o.campana ?? null), fuente: corto(o.fuente ?? null), medio: corto(o.medio ?? null), ts: String(o.ts),
    };
  } catch { return null; }
}
