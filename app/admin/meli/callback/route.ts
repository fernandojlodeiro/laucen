// Vuelta de Mercado Libre después de aprobar la aplicación: verifica el
// state, canjea el código por la llave y la guarda para la organización.

import { NextResponse, type NextRequest } from "next/server";
import { sosVos } from "@/lib/admin";
import { sesionActual } from "@/lib/tenancy";
import { canjearCodigo } from "@/lib/meli";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origen = req.nextUrl.origin;
  const volver = (q: string) => {
    const r = NextResponse.redirect(new URL(`/admin/meli?${q}`, origen));
    r.cookies.delete({ name: "meli_oauth", path: "/admin/meli" });
    return r;
  };
  if (!(await sosVos())) return NextResponse.redirect(new URL("/panel", origen));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const [stateGuardado, verifier] = (req.cookies.get("meli_oauth")?.value ?? "").split(".");
  if (!code || !state || state !== stateGuardado || !verifier) return volver("error=vuelta");

  const sesion = await sesionActual();
  if (!sesion) return volver("error=sesion");
  try {
    await canjearCodigo(sesion.org.id, code, verifier, origen);
  } catch (e) {
    console.error("[meli] canje del código:", e);
    return volver(`error=canje&detalle=${encodeURIComponent(String(e).slice(0, 200))}`);
  }
  return volver("ok=1");
}
