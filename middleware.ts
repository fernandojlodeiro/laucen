// Protege toda la app salvo las rutas públicas, y refresca la sesión de
// Supabase en cada request (si no se refresca acá, expira en medio de un
// Server Component y esa página no tiene forma de renovarla). Va en la RAÍZ
// del repo, no en src/.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { esRutaPublica } from "@/lib/rutas-publicas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(req: NextRequest) {
  const respuesta = NextResponse.next({ request: req });

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
