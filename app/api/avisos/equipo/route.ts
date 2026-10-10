// Los avisos de Windows de esta computadora (Configuración › Mis avisos):
// GET la llave pública y en cuántos equipos están activados; POST
// { accion: "alta", suscripcion, equipo } | { accion: "baja", endpoint } | { accion: "prueba" }.

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { llavesPush, suscribir, desuscribir, equiposDe, avisoDePrueba, type SuscripcionNavegador } from "@/lib/avisos-push";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await sesionActual();
  if (!s) return Response.json({ error: "sin sesión" }, { status: 401 });
  const [k, equipos] = await Promise.all([llavesPush(), equiposDe(s.usuario.id, s.org.id)]);
  return Response.json({ publica: k.publica, equipos });
}

export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s) return Response.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { accion?: string; suscripcion?: SuscripcionNavegador; equipo?: string; endpoint?: string };
  try {
    if (b.accion === "alta") {
      const sus = b.suscripcion;
      if (!sus?.endpoint || !sus.keys?.p256dh || !sus.keys?.auth) return Response.json({ ok: false, error: "El navegador no mandó los datos del aviso." }, { status: 400 });
      await suscribir(s.usuario.id, s.org.id, sus, String(b.equipo ?? ""), (p) => tienePermiso(s.permisos, p));
    } else if (b.accion === "baja" && b.endpoint) {
      await desuscribir(s.usuario.id, b.endpoint);
    } else if (b.accion === "prueba") {
      const n = await avisoDePrueba(s.usuario.id, s.org.id);
      if (!n) return Response.json({ ok: false, error: "No hay ninguna computadora con los avisos activados." });
    } else {
      return Response.json({ ok: false, error: "No entendí el pedido." }, { status: 400 });
    }
  } catch {
    return Response.json({ ok: false, error: "No se pudo: probá de nuevo en un rato." }, { status: 503 });
  }
  return Response.json({ ok: true, equipos: await equiposDe(s.usuario.id, s.org.id).catch(() => null) });
}
