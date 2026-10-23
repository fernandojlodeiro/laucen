// Vuelta de Google después de aprobar a Laucen: verifica el state, canjea el código por la llave y la guarda.

import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { motivoErp } from "@/lib/erp/base";
import { canjearCodigo } from "@/lib/google/drive";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origen = req.nextUrl.origin;
  const volver = (q: string) => {
    const r = NextResponse.redirect(new URL(`/config/google-drive?${q}`, origen));
    r.cookies.delete({ name: "google_oauth", path: "/config/google-drive" });
    return r;
  };
  const sesion = await sesionActual();
  if (!sesion || !tienePermiso(sesion.permisos, "empresa_config")) return NextResponse.redirect(new URL("/panel", origen));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (req.nextUrl.searchParams.get("error")) return volver(`error=${encodeURIComponent("No se aprobó el acceso en Google: no se conectó nada.")}`);
  if (!code || !state || state !== req.cookies.get("google_oauth")?.value) return volver(`error=${encodeURIComponent("La conexión con Google no se completó. Probá de nuevo.")}`);
  try {
    const email = await canjearCodigo(sesion.org.id, code);
    return volver(`ok=${encodeURIComponent(`Google Drive conectado: ${email}. Ahora creá la carpeta del contador.`)}`);
  } catch (e) {
    console.error("[google] canje del código:", e);
    return volver(`error=${encodeURIComponent(motivoErp(e))}`);
  }
}
