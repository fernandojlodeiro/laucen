// Protege toda la app salvo las rutas públicas, y refresca la sesión de
// Supabase en cada request (si no se refresca acá, expira en medio de un
// Server Component y esa página no tiene forma de renovarla). Va en la RAÍZ
// del repo, no en src/.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { esRutaPublica } from "@/lib/rutas-publicas";
import { DOMINIOS_TIENDA } from "@/lib/tienda/dominios";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(req: NextRequest) {
  // Un dominio propio de una tienda (lib/tienda/dominios.ts): todo va a /tienda/<slug>.
  const host = req.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
  const tienda = DOMINIOS_TIENDA[host];
  // Los links internos de la tienda son /tienda/<slug>/…: en su dominio se
  // limpian (laucen.com/tienda/tienda/carrito → laucen.com/carrito).
  if (tienda && (req.nextUrl.pathname === `/tienda/${tienda}` || req.nextUrl.pathname.startsWith(`/tienda/${tienda}/`))) {
    const limpia = req.nextUrl.clone();
    limpia.pathname = req.nextUrl.pathname.slice(`/tienda/${tienda}`.length) || "/";
    return NextResponse.redirect(limpia, 308);
  }
  if (tienda && !req.nextUrl.pathname.startsWith("/tienda/") && !req.nextUrl.pathname.startsWith("/api/")) {
    const destino = req.nextUrl.clone();
    destino.pathname = `/tienda/${tienda}${req.nextUrl.pathname === "/" ? "" : req.nextUrl.pathname}`;
    const encabezados = new Headers(req.headers);
    encabezados.set("x-ruta", destino.pathname);
    return NextResponse.rewrite(destino, { request: { headers: encabezados } });
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
