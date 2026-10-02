// Conectar una cuenta de Mercado Libre a un canal: arranca la autorización
// (mismo camino que /admin/meli/conectar, con el canal en la cookie). La
// vuelta llega a /admin/meli/callback (la dirección registrada en la
// aplicación de ML), que ve el canal y deja la cuenta colgada de él.

import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { credenciales, nuevoPkce, urlDeAutorizacion } from "@/lib/meli";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origen = req.nextUrl.origin;
  const volver = (q: string) => NextResponse.redirect(new URL(`/config/canales?${q}`, origen));
  const sesion = await sesionActual();
  if (!sesion || !tienePermiso(sesion.permisos, "canales_ver")) return NextResponse.redirect(new URL("/panel", origen));
  const canalId = Number(req.nextUrl.searchParams.get("canal"));
  const canal = Number.isInteger(canalId) && canalId > 0
    ? await una("select 1 from canal where id = $1 and organizacion_id = $2 and tipo = 'mercadolibre'", [canalId, sesion.org.id]) : null;
  if (!canal) return volver(`error=${encodeURIComponent("Ese canal no es de Mercado Libre.")}`);
  const c = credenciales();
  if (!c) return volver(`c=${canalId}&error=${encodeURIComponent("Falta configurar la aplicación de Mercado Libre en el servidor.")}`);

  const state = crypto.randomUUID();
  const { verifier, challenge } = await nuevoPkce();
  const r = NextResponse.redirect(urlDeAutorizacion(c.appId, origen, state, challenge));
  r.cookies.set("meli_oauth", `${state}.${verifier}.${canalId}`, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/admin/meli", maxAge: 600,
  });
  return r;
}
