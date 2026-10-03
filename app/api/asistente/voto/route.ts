// 👍 / 👎 de una respuesta del asistente: POST { id, voto: 1 | -1 | null }.
// Sólo sobre respuestas de una conversación propia.

import type { NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { consulta } from "@/lib/erp/base";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const s = await sesionActual();
  if (!s || !tienePermiso(s.permisos, "asistente_usar")) return Response.json({ error: "Sin permiso." }, { status: 403 });
  const { id, voto } = await req.json().catch(() => ({})) as { id?: number; voto?: number | null };
  const v = voto === 1 || voto === -1 ? voto : null;
  await consulta(`
    update asistente_mensaje m set voto = $3
      from asistente_conversacion c
     where m.id = $1 and m.rol = 'asistente' and c.id = m.conversacion_id and c.organizacion_id = $2 and c.usuario_id = $4`,
  [Number(id) || 0, s.org.id, v, s.usuario.id]);
  return Response.json({ ok: true });
}
