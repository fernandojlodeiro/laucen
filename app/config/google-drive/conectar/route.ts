// «Conectar Google Drive»: arranca la autorización con Google (state en una cookie) y manda a la pantalla de Google
// donde se aprueba que Laucen cree y suba archivos en el Drive. La vuelta llega a ../callback.

import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { appGoogle, urlDeAutorizacion } from "@/lib/google/drive";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origen = req.nextUrl.origin;
  const sesion = await sesionActual();
  if (!sesion || !tienePermiso(sesion.permisos, "empresa_config")) return NextResponse.redirect(new URL("/panel", origen));
  const app = await appGoogle();
  if (!app) return NextResponse.redirect(new URL(`/config/google-drive?error=${encodeURIComponent("Falta cargar la aplicación de Google de Laucen (la carga el administrador del sistema).")}`, origen));
  const state = crypto.randomUUID();
  const r = NextResponse.redirect(urlDeAutorizacion(app.clientId, state));
  r.cookies.set("google_oauth", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/config/google-drive", maxAge: 600 });
  return r;
}
