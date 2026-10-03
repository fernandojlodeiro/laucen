// Protege toda la app salvo las rutas públicas, y refresca la sesión de
// Supabase en cada request (si no se refresca acá, expira en medio de un
// Server Component y esa página no tiene forma de renovarla). Va en la RAÍZ
// del repo, no en src/.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { esRutaPublica } from "@/lib/rutas-publicas";
import { DOMINIO_PANEL, REDIRIGEN_AL_PANEL, esDelPanel } from "@/lib/tienda/dominios";
import { destinoDeHost } from "@/lib/tienda/dominios-tienda";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  // laucen.com.ar y los www: al panel (laucen.com), con la misma ruta y query.
  if (REDIRIGEN_AL_PANEL.includes(host)) {
    const panel = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${DOMINIO_PANEL}`);
    return NextResponse.redirect(panel, 308);
  }
  if (!esDelPanel(host)) {
    const r = await aLaTienda(req, host);
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
async function aLaTienda(req: NextRequest, host: string): Promise<NextResponse | null> {
  const ruta = req.nextUrl.pathname;
  if (ruta.startsWith("/api/")) return null;
  const destino = await destinoDeHost(host).catch((e) => {
    console.error("[middleware] no se pudo leer tienda_dominio:", e instanceof Error ? e.message : e);
    return null;
  });
  // Desconocido: la página "dominio no configurado" (nunca el panel).
  if (!destino || (!destino.principal && !destino.redirigeA)) return reescribir(req, "/dominio-no-configurado");
  // Un dominio secundario redirige al principal (por si Vercel no lo hizo ya).
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
  return reescribir(req, `${base}${ruta === "/" ? "" : ruta}`);
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
