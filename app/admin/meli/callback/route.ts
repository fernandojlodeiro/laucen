// Vuelta de Mercado Libre después de aprobar la aplicación: verifica el
// state, canjea el código por la llave y la guarda. Si la cookie trae un
// canal (se conectó desde Configuración → Canales), la cuenta queda colgada
// de ese canal y vuelve ahí; si no, es la conexión de /admin/meli (Fer).

import { NextResponse, type NextRequest } from "next/server";
import { sosVos } from "@/lib/admin";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { canjearCodigo } from "@/lib/meli";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origen = req.nextUrl.origin;
  const [stateGuardado, verifier, canalTxt] = (req.cookies.get("meli_oauth")?.value ?? "").split(".");
  const canalId = canalTxt ? Number(canalTxt) : null;
  const volver = (q: string) => {
    const destino = canalId ? `/config/canales?c=${canalId}&${q}` : `/admin/meli?${q}`;
    const r = NextResponse.redirect(new URL(destino, origen));
    r.cookies.delete({ name: "meli_oauth", path: "/admin/meli" });
    return r;
  };
  const sesion = await sesionActual();
  if (!sesion) return volver("error=sesion");
  if (canalId) {
    if (!tienePermiso(sesion.permisos, "canales_ver")) return NextResponse.redirect(new URL("/panel", origen));
    if (!(await una("select 1 from canal where id = $1 and organizacion_id = $2 and tipo = 'mercadolibre'", [canalId, sesion.org.id]))) {
      return volver(`error=${encodeURIComponent("Ese canal no es de Mercado Libre.")}`);
    }
  } else if (!(await sosVos())) return NextResponse.redirect(new URL("/panel", origen));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== stateGuardado || !verifier) {
    return volver(canalId ? `error=${encodeURIComponent("La conexión con Mercado Libre no se completó. Probá de nuevo.")}` : "error=vuelta");
  }
  try {
    await canjearCodigo(sesion.org.id, code, verifier, origen, canalId);
  } catch (e) {
    console.error("[meli] canje del código:", e);
    return volver(canalId ? `error=${encodeURIComponent("Mercado Libre no aceptó la conexión. Probá de nuevo en un momento.")}`
      : `error=canje&detalle=${encodeURIComponent(String(e).slice(0, 200))}`);
  }
  return volver(canalId ? `ok=${encodeURIComponent("Cuenta de Mercado Libre conectada.")}` : "ok=1");
}
