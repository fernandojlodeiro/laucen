// "Conectar una cuenta de Mercado Pago" del espacio personal: como el de un
// canal (app/config/canales/mercadopago), con la misma aplicación y la misma
// dirección de vuelta (es la única cargada en Mercado Pago); la cookie dice
// que es del espacio personal ("p" + id) y la vuelta la guarda en el esquema
// personal, nunca en un canal de la empresa.

import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { espacioDe } from "@/lib/personal/espacio";
import { appMp, nuevoPkce, urlDeAutorizacion } from "@/lib/mercadopago/conexion";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origen = req.nextUrl.origin;
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.redirect(new URL("/login", origen));
  const espacio = await espacioDe(sesion.usuario.id, true);
  if (!espacio) return NextResponse.redirect(new URL("/panel", origen));
  const app = await appMp();
  if (!app) return NextResponse.redirect(new URL(`/personal?error=${encodeURIComponent("Falta configurar la aplicación de Mercado Pago de Laucen.")}`, origen));
  const state = crypto.randomUUID();
  const { verifier, challenge } = await nuevoPkce();
  const r = NextResponse.redirect(urlDeAutorizacion(app.clientId, state, challenge));
  r.cookies.set("mp_oauth", `${state}.${verifier}.p${espacio.id}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/config/canales/mercadopago", maxAge: 600 });
  return r;
}
