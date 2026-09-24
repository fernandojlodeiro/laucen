// Clientes de Supabase Auth. La base se sigue leyendo con Drizzle, esto es
// sólo para saber quién está logueado. Portado de src/lib/supabase.ts de
// CadaMes, sin los valores por defecto de conveniencia (esos existen en
// CadaMes porque Fer trabaja en un único proyecto Supabase; acá conviene
// exigir las env vars, sin default oculto).

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Cliente para Server Components / Server Actions (lee y escribe cookies de sesión). */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options));
        } catch {
          // Ignorado en Server Components (el middleware refresca la sesión).
        }
      },
    },
  });
}

/** Usuario actual de Supabase Auth, o null. */
export async function usuarioActual() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
