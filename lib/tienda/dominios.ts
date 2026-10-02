// Dominios propios de las tiendas: el middleware reescribe <dominio>/… a
// /tienda/<slug>/… (sin que el comprador vea /tienda en la dirección).
// Fer (2/10): laucen.com y laucen.com.ar son la tienda pública; el panel se
// usa desde laucen.vercel.app. Ojo: en un dominio de tienda TODO va a la
// tienda (también /login); sólo /api/ sigue llegando a la app.
// www.laucen.com todavía no tiene certificado en Vercel (2/10): cuando lo
// tenga, ya está en la lista.
export const DOMINIOS_TIENDA: Record<string, string> = {
  "laucen.com": "tienda",
  "www.laucen.com": "tienda",
  "laucen.com.ar": "tienda",
  "www.laucen.com.ar": "tienda",
};

/** La dirección del panel: la de NEXT_PUBLIC_SITE_URL, salvo que sea un
 *  dominio de tienda (ahí /login abre la tienda): entonces laucen.vercel.app.
 *  La usan los links de los mails (confirmar cuenta, cambiar la clave). */
export function urlPanel(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    if (DOMINIOS_TIENDA[new URL(base).hostname.toLowerCase()]) return "https://laucen.vercel.app";
  } catch { /* queda la de la variable */ }
  return base.replace(/\/$/, "");
}

/** El dominio propio de una tienda, si tiene. */
export function dominioDe(slug: string): string | null {
  return Object.entries(DOMINIOS_TIENDA).find(([d, s]) => s === slug && !d.startsWith("www."))?.[0] ?? null;
}
