// Las tareas de fondo de la persona (lib/tareas-fondo.ts): GET las que corren
// y las terminadas sin avisar; POST { ids } las marca avisadas.

import { sesionActual } from "@/lib/tenancy";
import { tareasDe, marcarAvisadas } from "@/lib/tareas-fondo";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await sesionActual();
  if (!s) return Response.json({ tareas: [] }, { status: 401 });
  return Response.json({ tareas: await tareasDe(s.org.id, s.usuario.id).catch(() => []) });
}

export async function POST(req: Request) {
  const s = await sesionActual();
  if (!s) return Response.json({ ok: false }, { status: 401 });
  const ids = ((await req.json().catch(() => ({}))) as { ids?: unknown }).ids;
  await marcarAvisadas(s.org.id, s.usuario.id, Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : []);
  return Response.json({ ok: true });
}
