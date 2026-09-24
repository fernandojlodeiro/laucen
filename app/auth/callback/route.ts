// Canjea el código que llega por mail (reset de contraseña). Portado de
// src/app/auth/callback/route.ts de CadaMes. Si más adelante se suma Google
// OAuth, este mismo endpoint sirve sin cambios (ya está armado para eso).
//
// Importante: las cookies de sesión se escriben sobre la MISMA `NextResponse`
// que redirige — si se escriben sobre otra, la sesión no queda guardada.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Evita que `?next=` mande a otro dominio (open redirect). */
function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const siguiente = destinoSeguro(url.searchParams.get("next"));
  const motivoError = siguiente.startsWith("/reset") ? "reset" : "login";

  if (url.searchParams.get("error_description") || url.searchParams.get("error") || !code) {
    return NextResponse.redirect(new URL(`/login?error=${motivoError}`, url.origin));
  }

  const respuesta = NextResponse.redirect(new URL(siguiente, url.origin));
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) =>
        respuesta.cookies.set(name, value, options)),
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/login?error=${motivoError}`, url.origin));
  return respuesta;
}
