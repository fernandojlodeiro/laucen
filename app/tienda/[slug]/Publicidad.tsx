"use client";

// Eventos de publicidad en la tienda (lib/tienda/publicidad.ts). Las etiquetas (gtag.js, el píxel
// de Meta, el de TikTok) las carga el layout; acá cada evento se traduce a las plataformas que
// estén en la página: los de la página (ver, checkout, compra) y los que dejó una acción del
// servidor en la cookie (carrito).

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Evento } from "@/lib/tienda/publicidad";

type Fn = (...args: unknown[]) => void;
declare global { interface Window { dataLayer?: unknown[]; fbq?: Fn; ttq?: { track: Fn; page: Fn; identify: Fn } } }

const GOOGLE = { ver: "view_item", carrito: "add_to_cart", checkout: "begin_checkout", compra: "purchase" } as const;
const META = { ver: "ViewContent", carrito: "AddToCart", checkout: "InitiateCheckout", compra: "Purchase" } as const;
const TIKTOK = { ver: "ViewContent", carrito: "AddToCart", checkout: "InitiateCheckout", compra: "CompletePayment" } as const;

// Lo mismo que el gtag() de la etiqueta: anda aunque gtag.js todavía no haya cargado (queda en la cola).
function gtag(..._args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ??= []).push(arguments);
}

type Opciones = { conversionGoogle?: string | null; comprador?: { email?: string; telefono?: string } };

function disparar(e: Evento, o: Opciones = {}) {
  const ids = e.items.map((i) => i.id);
  if (window.dataLayer) {
    if (o.comprador) gtag("set", "user_data", { ...(o.comprador.email ? { email: o.comprador.email } : {}), ...(o.comprador.telefono ? { phone_number: o.comprador.telefono } : {}) });
    gtag("event", GOOGLE[e.tipo], {
      currency: e.moneda, value: e.valor, ...(e.pedido ? { transaction_id: e.pedido } : {}), ...(e.envio != null ? { shipping: e.envio } : {}),
      items: e.items.map((i) => ({ item_id: i.id, item_name: i.nombre, price: i.precio, quantity: i.cantidad })),
    });
    if (e.tipo === "compra" && o.conversionGoogle) gtag("event", "conversion", { send_to: o.conversionGoogle, value: e.valor, currency: e.moneda, transaction_id: e.pedido });
  }
  window.fbq?.("track", META[e.tipo], {
    content_type: "product", content_ids: ids, value: e.valor, currency: e.moneda, num_items: e.items.reduce((s, i) => s + i.cantidad, 0),
    contents: e.items.map((i) => ({ id: i.id, quantity: i.cantidad, item_price: i.precio })),
  }, e.pedido ? { eventID: `compra-${e.pedido}` } : undefined);
  if (window.ttq) {
    if (o.comprador) window.ttq.identify({ ...(o.comprador.email ? { email: o.comprador.email } : {}), ...(o.comprador.telefono ? { phone_number: o.comprador.telefono } : {}) });
    window.ttq.track(TIKTOK[e.tipo], {
      content_type: "product", value: e.valor, currency: e.moneda,
      contents: e.items.map((i) => ({ content_id: i.id, content_name: i.nombre, quantity: i.cantidad, price: i.precio })),
    }, e.pedido ? { event_id: `compra-${e.pedido}` } : undefined);
  }
}

/** Un evento de esta página. Con `unaVez`, no se repite en este navegador (la compra, si recarga la página). */
export function EventoPublicidad({ evento, unaVez, conversionGoogle, comprador }: { evento: Evento; unaVez?: string } & Opciones) {
  const clave = JSON.stringify({ evento, conversionGoogle, comprador });
  useEffect(() => {
    if (unaVez) {
      try { if (localStorage.getItem(`pub_${unaVez}`)) return; localStorage.setItem(`pub_${unaVez}`, "1"); } catch { /* sin almacenamiento: el id del pedido evita el doble conteo */ }
    }
    const x = JSON.parse(clave) as { evento: Evento } & Opciones;
    disparar(x.evento, x);
  }, [clave, unaVez]);
  return null;
}

/** El clic en el botón de WhatsApp (todo link con data-whatsapp, Fer 26/10): «whatsapp_click» en Google Analytics (con el
 *  producto, si es una ficha) y «Contact» en Meta y TikTok. Lo que cuenta en el Embudo no depende de esto: lo anota
 *  Laucen al pasar por /whatsapp, aunque el navegador corte estas etiquetas. Va en todas las tiendas, midan o no. */
export function ClicsDeWhatsapp() {
  useEffect(() => {
    const alClic = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[data-whatsapp]") as HTMLAnchorElement | null;
      if (!a) return;
      // La página donde lo tocó, por si el navegador no la manda (algunos no mandan de dónde venía).
      // El id del evento: el mismo para el píxel de Meta y para lo que Laucen le manda desde el servidor (lo cuenta una vez).
      const evento = `wa-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      try { const u = new URL(a.href); u.searchParams.set("p", location.pathname); u.searchParams.set("e", evento); a.href = u.toString(); } catch { /* queda como estaba */ }
      const producto = /\/producto\/(\d+)/.exec(location.pathname)?.[1];
      if (window.dataLayer) gtag("event", "whatsapp_click", { page_location: location.href, ...(producto ? { item_id: producto } : {}) });
      window.fbq?.("track", "Contact", {}, { eventID: evento });
      window.ttq?.track("Contact", {});
    };
    document.addEventListener("click", alClic, true);
    return () => document.removeEventListener("click", alClic, true);
  }, []);
  return null;
}

/** En cada cambio de página: la vista de página de Meta y TikTok (la primera la manda su código
 *  base) y los eventos que dejó una acción del servidor (cookie pub_eventos), que se borran. */
export function EventosDeNavegacion() {
  const ruta = usePathname();
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) primera.current = false;
    else { window.fbq?.("track", "PageView"); window.ttq?.page(); }
    const crudo = document.cookie.split("; ").find((c) => c.startsWith("pub_eventos="))?.slice("pub_eventos=".length);
    if (!crudo) return;
    document.cookie = "pub_eventos=; path=/; max-age=0";
    try { for (const e of JSON.parse(decodeURIComponent(crudo)) as Evento[]) disparar(e); } catch { /* cookie rota: se descarta */ }
  }, [ruta]);
  return null;
}
