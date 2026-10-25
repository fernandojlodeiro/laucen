// La tienda ante los buscadores (24/10, bitácora #856: Google tituló la empresa «Bienvenido a
// Laucen…» porque el robots.txt y cualquier dirección inexistente de daitom.com.ar daban la 404
// del panel). Cada dominio de tienda tiene su robots.txt, su sitemap.xml y su 404 con su marca;
// cada página, su título («Producto | Daitom») y su canonical: a sí misma en el dominio principal,
// y al dominio principal en uno de otra marca con «canonical hacia el principal» prendido.

import { abreLaTienda, destinoDeHost, dominioPrincipal } from "@/lib/tienda/dominios-tienda";
import type { Tienda } from "@/lib/tienda/tienda";

/** El dominio que va en los links públicos de esta página (canonical, sitemap): el del host si abre
 *  esta tienda (o el principal, si ese dominio de otra marca apunta su canonical ahí); si se entró
 *  por el panel, el principal. null = la tienda no tiene dominio propio andando. */
export async function dominioCanonico(t: Tienda, host: string | null | undefined): Promise<string | null> {
  const h = host?.split(":")[0].toLowerCase() ?? "";
  const d = h ? await destinoDeHost(h).catch(() => null) : null;
  if (d && d.canalId === t.canalId && abreLaTienda(d)) return d.canonicalA ?? h;
  return dominioPrincipal(t.canalId, true);
}

/** La ruta pública de una página a partir de la interna (x-ruta: /tienda/<slug>/producto/1 → /producto/1). */
export function rutaPublica(t: Tienda, rutaInterna: string): string {
  const pref = `/tienda/${t.slug}`;
  const r = rutaInterna === pref || rutaInterna.startsWith(`${pref}/`) ? rutaInterna.slice(pref.length) : rutaInterna;
  return r || "/";
}

/** La dirección canónica de la página (sin parámetros); null si la tienda no tiene dominio propio. */
export async function canonicalDe(t: Tienda, host: string | null | undefined, rutaInterna: string): Promise<string | null> {
  const dominio = await dominioCanonico(t, host);
  return dominio ? `https://${dominio}${rutaPublica(t, rutaInterna)}` : null;
}
