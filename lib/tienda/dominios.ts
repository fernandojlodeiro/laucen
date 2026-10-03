// Dominios del SISTEMA (sin base: lo usa también el middleware). Fer (3/10,
// bitácora #275/#281): el panel vive en laucen.com; laucen.com.ar y los www
// redirigen ahí. laucen.vercel.app sigue andando, pero ningún link sale con
// ella. Los dominios de las TIENDAS no van acá: los carga cada organización
// desde Configuración › Tienda web (tabla tienda_dominio, lib/tienda/dominios-tienda.ts).

export const DOMINIO_PANEL = "laucen.com";

/** Dominios del sistema que redirigen (308) al panel, conservando ruta y query. */
export const REDIRIGEN_AL_PANEL = ["www.laucen.com", "laucen.com.ar", "www.laucen.com.ar"];

/** ¿Este host abre el panel? laucen.com, las direcciones de Vercel (producción
 *  y vistas previas) y la máquina local. */
export function esDelPanel(host: string): boolean {
  return host === DOMINIO_PANEL || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
}

/** ¿Es un dominio del sistema (no se puede cargar como dominio de una tienda)? */
export function esDelSistema(host: string): boolean {
  return esDelPanel(host) || REDIRIGEN_AL_PANEL.includes(host) || host.endsWith(".laucen.com") || host.endsWith(".laucen.com.ar");
}

/** La dirección del panel para los links que salen del sistema (mails de
 *  login, confirmación y cambio de clave, notificaciones de pagos): siempre
 *  https://laucen.com, aunque NEXT_PUBLIC_SITE_URL diga otra cosa; en la
 *  máquina local, la de la variable (o localhost). */
export function urlPanel(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  try {
    const host = new URL(base).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return base.replace(/\/$/, "");
  } catch { /* va la de siempre */ }
  return `https://${DOMINIO_PANEL}`;
}

/** Lo que escribe la persona ("https://www.Daitom.com.ar/") → "www.daitom.com.ar", o null si no es un dominio. */
export function normalizarDominio(texto: string): string | null {
  const d = texto.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) ? d : null;
}

// Terminaciones de dos partes (com.ar, com.br…): ahí el dominio "raíz" tiene tres.
const DOBLES = /\.(com|net|org|gob|gov|edu|int|tur|coop|mil)\.[a-z]{2}$|\.co\.[a-z]{2}$/;

/** ¿Es el dominio raíz (daitom.com.ar) o un subdominio (www.daitom.com.ar)?
 *  El raíz se apunta con un registro A; un subdominio, con un CNAME. */
export function esRaiz(dominio: string): boolean {
  return dominio.split(".").length === (DOBLES.test(dominio) ? 3 : 2);
}

/** La parte de adelante de un subdominio: "www.daitom.com.ar" → "www". */
export function subdominio(dominio: string): string {
  const partes = dominio.split(".");
  return partes.slice(0, partes.length - (DOBLES.test(dominio) ? 3 : 2)).join(".");
}
