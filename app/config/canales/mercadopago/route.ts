// "Conectar Mercado Pago" de un canal: arranca la autorización con Mercado
// Pago (state + PKCE en una cookie, con el canal) y manda a la pantalla de
// Mercado Pago donde se aprueba la aplicación de Laucen. La vuelta llega a
// ./callback.

import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { appMp, nuevoPkce, urlDeAutorizacion } from "@/lib/mercadopago/conexion";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origen = req.nextUrl.origin;
  const sesion = await sesionActual();
  if (!sesion || !tienePermiso(sesion.permisos, "canales_ver")) return NextResponse.redirect(new URL("/panel", origen));
  const canalId = Number(req.nextUrl.searchParams.get("canal"));
  const volver = (q: string) => NextResponse.redirect(new URL(`/config/canales?c=${canalId}&${q}`, origen));
  if (!Number.isInteger(canalId) || canalId <= 0 || !(await una("select 1 from canal where id = $1 and organizacion_id = $2", [canalId, sesion.org.id]))) {
    return NextResponse.redirect(new URL(`/config/canales?error=${encodeURIComponent("Ese canal no existe.")}`, origen));
  }
  const app = await appMp();
  if (!app) return volver(`error=${encodeURIComponent("Falta configurar la aplicación de Mercado Pago de Laucen (la carga el administrador del sistema).")}`);
  const state = crypto.randomUUID();
  const { verifier, challenge } = await nuevoPkce();
  const r = NextResponse.redirect(urlDeAutorizacion(app.clientId, state, challenge));
  r.cookies.set("mp_oauth", `${state}.${verifier}.${canalId}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/config/canales/mercadopago", maxAge: 600 });
  return r;
}
