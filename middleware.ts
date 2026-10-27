// Protege toda la app salvo las rutas públicas, y refresca la sesión de
// Supabase en cada request (si no se refresca acá, expira en medio de un
// Server Component y esa página no tiene forma de renovarla). Va en la RAÍZ
// del repo, no en src/.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { anotarRobot } from "@/lib/tienda/robots";
import { esRutaPublica } from "@/lib/rutas-publicas";
import { DOMINIO_PANEL, REDIRIGEN_AL_PANEL, esDelPanel } from "@/lib/tienda/dominios";
import { abreLaTienda, destinoDeHost } from "@/lib/tienda/dominios-tienda";
import { aGalleta, deGalleta, entradaDeVisita, esRobot, GALLETA_ENTRADAS, GALLETA_VISITANTE, sumarEntrada } from "@/lib/publicidad/atribucion";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const host = req.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  // laucen.com.ar y los www: al panel (laucen.com), con la misma ruta y query.
  if (REDIRIGEN_AL_PANEL.includes(host)) {
    const panel = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${DOMINIO_PANEL}`);
    return NextResponse.redirect(panel, 308);
  }
  if (!esDelPanel(host)) {
    const r = await aLaTienda(req, host, event);
    if (r) return r;
  }

  // La ruta viaja en un encabezado para que el layout raíz sepa si dibuja el
  // marco del sistema (menú y barra de estado) o una pantalla pública suelta.
  const encabezados = new Headers(req.headers);
  encabezados.set("x-ruta", req.nextUrl.pathname);
  const respuesta = NextResponse.next({ request: { headers: encabezados } });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) =>
        cookies.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options)),
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !esRutaPublica(req.nextUrl.pathname)) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return respuesta;
}

/** Un dominio que no es del sistema: el de una tienda (tienda_dominio, lo
 *  carga cada organización en Configuración › Tienda web) o uno desconocido.
 *  /api/ sigue llegando a la app en cualquier dominio. */
async function aLaTienda(req: NextRequest, host: string, event: NextFetchEvent): Promise<NextResponse | null> {
  const ruta = req.nextUrl.pathname;
  if (ruta.startsWith("/api/")) return null;
  const destino = await destinoDeHost(host).catch((e) => {
    console.error("[middleware] no se pudo leer tienda_dominio:", e instanceof Error ? e.message : e);
    return null;
  });
  // Desconocido: la página "dominio no configurado" (nunca el panel).
  if (!destino || (!abreLaTienda(destino) && !destino.redirigeA)) return reescribir(req, "/dominio-no-configurado");
  // Un dominio secundario redirige al principal o a su marca (por si Vercel no lo hizo ya).
  if (destino.redirigeA) return NextResponse.redirect(new URL(ruta + req.nextUrl.search, `https://${destino.redirigeA}`), 308);
  const base = `/tienda/${destino.slug}`;
  // Los links internos de la tienda son /tienda/<slug>/…: en su dominio se
  // limpian (daitom.com.ar/tienda/tienda/carrito → daitom.com.ar/carrito).
  if (ruta === base || ruta.startsWith(`${base}/`)) {
    const limpia = req.nextUrl.clone();
    limpia.pathname = ruta.slice(base.length) || "/";
    return NextResponse.redirect(limpia, 308);
  }
  if (ruta.startsWith("/tienda/")) return null;
  const r = reescribir(req, `${base}${ruta === "/" ? "" : ruta}`);
  anotarEntrada(req, r, host, destino.canalId, event);
  return r;
}

/** El sello del visitante (lib/publicidad/atribucion.ts): cada vez que llega a la tienda desde afuera (una página
 *  entera pedida desde otro sitio, o con el link de un anuncio) se suma esa entrada; y su id, la primera vez. */
function anotarEntrada(req: NextRequest, r: NextResponse, host: string, canalId: number, event: NextFetchEvent) {
  const galleta = { path: "/", sameSite: "lax" as const, httpOnly: true, secure: true, maxAge: 365 * 86_400 };
  // Un robot no es una visita: se anota cuál pasó (lib/tienda/robots.ts), sin demorar la página.
  const ua = req.headers.get("user-agent");
  if (esRobot(ua)) {
    const archivo = (req.nextUrl.pathname.split("/").pop() ?? "").includes(".");
    if (!archivo && !req.headers.get("rsc") && !req.headers.get("next-router-prefetch")) event.waitUntil(anotarRobot(canalId, ua, req.nextUrl.pathname));
    return;
  }
  // Sólo la página entera (no los pedidos internos de Next al navegar ni los de adelanto).
  const dest = req.headers.get("sec-fetch-dest");
  const esPagina = dest ? dest === "document" : !req.headers.get("rsc") && !req.headers.get("next-router-prefetch") && (req.headers.get("accept") ?? "").includes("text/html");
  if (!esPagina) return;
  // El botón de WhatsApp, los avisos del navegador y los archivos (feed, sitemap) no son una llegada a la tienda.
  const ultimo = req.nextUrl.pathname.split("/").pop() ?? "";
  if (["whatsapp", "v", "sugerencias"].includes(ultimo) || ultimo.includes(".")) return;
  if (!req.cookies.get(GALLETA_VISITANTE)?.value) r.cookies.set(GALLETA_VISITANTE, crypto.randomUUID(), galleta);
  const referer = req.headers.get("referer");
  let deAfuera = true;
  try { deAfuera = !referer || new URL(referer).hostname.toLowerCase() !== host; } catch { deAfuera = true; }
  const conAnuncio = ["utm_source", "fbclid", "gclid", "gbraid", "wbraid", "ttclid"].some((k) => req.nextUrl.searchParams.has(k));
  if (!deAfuera && !conAnuncio) return;
  const antes = deGalleta(req.cookies.get(GALLETA_ENTRADAS)?.value);
  r.cookies.set(GALLETA_ENTRADAS, aGalleta(sumarEntrada(antes, entradaDeVisita(req.nextUrl.searchParams, referer, host))), galleta);
}

function reescribir(req: NextRequest, ruta: string) {
  const destino = req.nextUrl.clone();
  destino.pathname = ruta;
  const encabezados = new Headers(req.headers);
  encabezados.set("x-ruta", ruta);
  return NextResponse.rewrite(destino, { request: { headers: encabezados } });
}

export const config = {
  // Corre en Node (no en Edge) para poder leer la base (Next 15.5).
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
