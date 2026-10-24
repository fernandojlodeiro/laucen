// Publicidad en la tienda (Fer, 24/10): Google Ads (Búsqueda y Shopping), Meta (Facebook e
// Instagram) y TikTok. Primero en daitom.com.ar, armado por dominio.
//
// Medición, por dominio (tienda_dominio.publicidad, Configuración › Tienda web › Publicidad): la
// etiqueta de cada plataforma que esté prendida (gtag.js, el píxel de Meta, el de TikTok) en
// todas las páginas de ese dominio, y los mismos cuatro eventos de comercio para las tres:
//   vio el producto  → view_item      · ViewContent      · ViewContent
//   agregó al carrito→ add_to_cart    · AddToCart        · AddToCart
//   empezó a pagar   → begin_checkout · InitiateCheckout · InitiateCheckout
//   compró           → purchase (+ conversión de Google Ads) · Purchase · CompletePayment
// Cada ítem va con el id del producto en los catálogos (idCatalogo: el SKU), así la plataforma
// cruza la venta con el anuncio del producto. La compra cuenta una sola vez por pedido (el id del
// pedido va como transaction_id / eventID / event_id).
//
// Catálogos (Google Merchant Center, Meta, TikTok): lib/tienda/feed.ts.

import { destinoDeHost } from "@/lib/tienda/dominios-tienda";

export type Publicidad = {
  google: { activo: boolean; tag_id: string | null; conversion_label: string | null; ga4_id: string | null };
  meta: { activo: boolean; pixel_id: string | null };
  tiktok: { activo: boolean; pixel_id: string | null };
  /** Transferencia y efectivo: la venta cuenta al crear el pedido (si no, cuando se marca pagado). */
  contar_al_crear: boolean;
  /** Mandar el mail y el teléfono del comprador con la compra (conversiones mejoradas / coincidencia avanzada). */
  datos_comprador: boolean;
};

export const TAG_ID = /^AW-\d{6,15}$/;
export const GA4_ID = /^G-[A-Z0-9]{4,15}$/;
export const LABEL = /^[\w-]{4,40}$/;
export const PIXEL_META = /^\d{10,20}$/;
export const PIXEL_TIKTOK = /^[A-Z0-9]{15,30}$/;

const id = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v.trim()) ? v.trim() : null);

/** Lo guardado, limpio: un ID que no tiene el formato de la plataforma queda vacío (y nunca llega a la página). */
export function publicidadDe(x: unknown): Publicidad {
  const p = (x ?? {}) as Record<string, Record<string, unknown> | unknown>;
  const g = (p.google ?? {}) as Record<string, unknown>, m = (p.meta ?? {}) as Record<string, unknown>, t = (p.tiktok ?? {}) as Record<string, unknown>;
  return {
    google: { activo: g.activo === true, tag_id: id(g.tag_id, TAG_ID), conversion_label: id(g.conversion_label, LABEL), ga4_id: id(g.ga4_id, GA4_ID) },
    meta: { activo: m.activo === true, pixel_id: id(m.pixel_id, PIXEL_META) },
    tiktok: { activo: t.activo === true, pixel_id: id(t.pixel_id, PIXEL_TIKTOK) },
    contar_al_crear: p.contar_al_crear !== false, datos_comprador: p.datos_comprador === true,
  };
}

/** Lo que corre en un dominio: cada plataforma prendida y con su ID. */
export type Etiquetas = {
  google: { ids: string[]; enviarConversion: string | null } | null;
  meta: string | null;
  tiktok: string | null;
  contar_al_crear: boolean; datos_comprador: boolean;
};

export function etiquetasDe(p: Publicidad): Etiquetas | null {
  const ids = p.google.activo ? [p.google.tag_id, p.google.ga4_id].filter((x): x is string => !!x) : [];
  const e: Etiquetas = {
    google: ids.length ? { ids, enviarConversion: p.google.tag_id && p.google.conversion_label ? `${p.google.tag_id}/${p.google.conversion_label}` : null } : null,
    meta: p.meta.activo ? p.meta.pixel_id : null,
    tiktok: p.tiktok.activo ? p.tiktok.pixel_id : null,
    contar_al_crear: p.contar_al_crear, datos_comprador: p.datos_comprador,
  };
  return e.google || e.meta || e.tiktok ? e : null;
}

/** Las etiquetas que corren en ese host: null si no mide nada. */
export async function etiquetasDelHost(host: string | null | undefined): Promise<Etiquetas | null> {
  if (!host) return null;
  const d = await destinoDeHost(host.split(":")[0].toLowerCase()).catch(() => null);
  return d ? etiquetasDe(publicidadDe(d.publicidad)) : null;
}

/** El id de una variación en los catálogos, los eventos y la ficha (siempre el mismo): su SKU; sin SKU, "V" + el id. */
export const idCatalogo = (sku: string | null | undefined, variacionId: number) => sku?.trim() || `V${variacionId}`;

/** Un evento de comercio, sin plataforma: el componente de cliente lo traduce a cada una. */
export type TipoEvento = "ver" | "carrito" | "checkout" | "compra";
export type Evento = {
  tipo: TipoEvento; moneda: string; valor: number;
  items: { id: string; nombre: string; precio: number; cantidad: number }[];
  /** Compra: el id del pedido (transaction_id / eventID / event_id) y el envío. */
  pedido?: string; envio?: number;
};

/** Nombre de la cookie con los eventos que dispara la próxima página (lo que pasó en una acción del servidor). */
export const COOKIE_EVENTOS = "pub_eventos";

/** Un código de barras que Google acepta como GTIN: 8, 12, 13 o 14 dígitos con el dígito verificador bien. */
export function gtinValido(codigo: string | null | undefined): string | null {
  const c = (codigo ?? "").replace(/\s/g, "");
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(c) || /^0+$/.test(c)) return null;
  const d = c.split("").map(Number), ultimo = d.pop()!;
  const suma = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === ultimo ? c : null;
}

/** producto.condicion → la de los catálogos (new / refurbished / used). */
export const condicionCatalogo = (c: string | null | undefined) =>
  /usad/i.test(c ?? "") ? "used" : /reacond|refurb/i.test(c ?? "") ? "refurbished" : "new";

/** Mail y teléfono del comprador para las conversiones mejoradas (teléfono en formato +54…). */
export function datosComprador(email: string | null, telefono: string | null): { email?: string; telefono?: string } | undefined {
  const d = (telefono ?? "").replace(/\D/g, "");
  const tel = d.startsWith("54") && d.length >= 12 ? `+${d}` : d.length === 10 ? `+54${d}` : null;
  const u = { ...(email ? { email: email.trim().toLowerCase() } : {}), ...(tel ? { telefono: tel } : {}) };
  return Object.keys(u).length ? u : undefined;
}
