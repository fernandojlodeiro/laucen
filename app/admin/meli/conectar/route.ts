// Arranca la autorización con Mercado Libre: guarda state + PKCE en una
// cookie y manda a la pantalla de ML donde se aprueba la aplicación.

import { NextResponse, type NextRequest } from "next/server";
import { sosVos } from "@/lib/admin";
import { credenciales, nuevoPkce, urlDeAutorizacion } from "@/lib/meli";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origen = req.nextUrl.origin;
  if (!(await sosVos())) return NextResponse.redirect(new URL("/panel", origen));
  const c = credenciales();
  if (!c) return NextResponse.redirect(new URL("/admin/meli?error=credenciales", origen));

  const state = crypto.randomUUID();
  const { verifier, challenge } = await nuevoPkce();
  const r = NextResponse.redirect(urlDeAutorizacion(c.appId, origen, state, challenge));
  r.cookies.set("meli_oauth", `${state}.${verifier}`, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/admin/meli", maxAge: 600,
  });
  return r;
}
