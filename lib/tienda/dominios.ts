// Dominios propios de las tiendas: el middleware reescribe <dominio>/… a
// /tienda/<slug>/… (sin que el comprador vea /tienda en la dirección).
// Fer eligió laucen.com para la tienda (2/10); laucen.com.ar queda para el
// sistema. Ojo: en un dominio de tienda TODO va a la tienda (también /login),
// así que el panel se usa desde laucen.vercel.app o laucen.com.ar.
// www.laucen.com todavía no tiene certificado en Vercel (2/10): cuando lo
// tenga, ya está en la lista.
export const DOMINIOS_TIENDA: Record<string, string> = {
  "laucen.com": "tienda",
  "www.laucen.com": "tienda",
};

/** El dominio propio de una tienda, si tiene. */
export function dominioDe(slug: string): string | null {
  return Object.entries(DOMINIOS_TIENDA).find(([d, s]) => s === slug && !d.startsWith("www."))?.[0] ?? null;
}
