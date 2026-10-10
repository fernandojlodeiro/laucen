// Los avisos de la barra de estado (lib/avisos.ts): GET los contadores (con
// lo que el usuario todavía no vio) y lo que la IA no contestó; POST
// { visto: clave } al entrar a la pantalla de un contador, o
// { avisado: { tipo: marca } } al cerrar la ventana.

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { estadoAvisos, marcarVisto, marcarAvisado } from "@/lib/avisos";
import type { ClaveContador } from "@/lib/avisos-tipos";

export const dynamic = "force-dynamic";

const CLAVES: ClaveContador[] = ["pedidos", "preguntas", "mensajes", "whatsapp"];

export async function GET(req: Request) {
  const s = await sesionActual();
  if (!s) return Response.json({ error: "sin sesión" }, { status: 401 });
  const puede = (p: Parameters<typeof tienePermiso>[1]) => tienePermiso(s.permisos, p);
  try {
    return Response.json(await estadoAvisos(s.usuario.id, s.org.id, puede, new URL(req.url).searchParams.get("vista") === "1"));
  } catch {
    return Response.json({ error: "sin base" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s) return Response.json({ ok: false }, { status: 401 });
  const cuerpo = (await req.json().catch(() => ({}))) as { visto?: unknown; avisado?: unknown };
  try {
    if (CLAVES.includes(cuerpo.visto as ClaveContador)) await marcarVisto(s.usuario.id, s.org.id, cuerpo.visto as ClaveContador);
    if (cuerpo.avisado && typeof cuerpo.avisado === "object") await marcarAvisado(s.usuario.id, s.org.id, cuerpo.avisado as Record<string, number>);
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
  return Response.json({ ok: true });
}
