// Vuelta de Mercado Pago después de aprobar la aplicación de Laucen: verifica
// el state, canjea el código por la llave de esa cuenta y la deja en el canal.

import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { canjearCodigoMp, urlVuelta } from "@/lib/mercadopago/conexion";
import { espacioDe } from "@/lib/personal/espacio";
import { canjearCodigoPersonal } from "@/lib/personal/mercadopago";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origen = req.nextUrl.origin;
  const [stateGuardado, verifier, canalTxt] = (req.cookies.get("mp_oauth")?.value ?? "").split(".");
  // Del espacio personal ("p" + id, app/personal/mercadopago/conectar): va a su esquema, no a un canal.
  if (canalTxt?.startsWith("p")) return vueltaPersonal(req, origen, stateGuardado, Number(canalTxt.slice(1)));
  const canalId = Number(canalTxt) || 0;
  const volver = (q: string) => {
    const r = NextResponse.redirect(new URL(canalId ? `/config/canales?c=${canalId}&${q}` : `/config/canales?${q}`, origen));
    r.cookies.delete({ name: "mp_oauth", path: "/config/canales/mercadopago" });
    return r;
  };
  const sesion = await sesionActual();
  if (!sesion || !tienePermiso(sesion.permisos, "canales_ver")) return NextResponse.redirect(new URL("/panel", origen));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!canalId || !code || !state || state !== stateGuardado || !verifier) {
    return volver(`error=${encodeURIComponent("La conexión con Mercado Pago no se completó. Probá de nuevo.")}`);
  }
  if (!(await una("select 1 from canal where id = $1 and organizacion_id = $2", [canalId, sesion.org.id]))) return volver(`error=${encodeURIComponent("Ese canal no existe.")}`);
  try {
    const nombre = await canjearCodigoMp(sesion.org.id, canalId, code, verifier);
    return volver(`ok=${encodeURIComponent(`Mercado Pago conectado: ${nombre}.`)}`);
  } catch (e) {
    console.error("[mercadopago] canje del código:", e);
    return volver(`error=${encodeURIComponent("Mercado Pago no aceptó la conexión. Probá de nuevo en un momento.")}`);
  }
}

async function vueltaPersonal(req: NextRequest, origen: string, stateGuardado: string, espacioId: number) {
  const volver = (q: string) => {
    const r = NextResponse.redirect(new URL(`/personal?${q}`, origen));
    r.cookies.delete({ name: "mp_oauth", path: "/config/canales/mercadopago" });
    return r;
  };
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.redirect(new URL("/login", origen));
  const espacio = await espacioDe(sesion.usuario.id);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!espacio || espacio.id !== espacioId || !code || !state || state !== stateGuardado) {
    return volver(`error=${encodeURIComponent("La conexión con Mercado Pago no se completó. Probá de nuevo.")}`);
  }
  try {
    const nombre = await canjearCodigoPersonal(espacio.id, sesion.usuario.id, code, urlVuelta());
    return volver(`ok=${encodeURIComponent(`Mercado Pago conectado: ${nombre}.`)}`);
  } catch (e) {
    console.error("[mercadopago personal] canje del código:", e);
    return volver(`error=${encodeURIComponent("Mercado Pago no aceptó la conexión. Probá de nuevo en un momento.")}`);
  }
}
