// Confirmar o cancelar lo que preparó el asistente (lib/asistente/acciones.ts):
// POST { id, decision: "confirmar" | "cancelar" }. Sólo quien lo pidió, con
// los permisos de ahora. El resultado queda como mensaje del asistente en la
// conversación (así se ve en el historial).

import type { NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { consulta, una, motivoErp } from "@/lib/erp/base";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { resolverPropuesta } from "@/lib/asistente/acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  await asegurarEsquemaErp();
  const s = await sesionActual();
  if (!s || !tienePermiso(s.permisos, "asistente_usar")) return Response.json({ error: "Sin permiso." }, { status: 403 });
  const { id, decision } = await req.json().catch(() => ({})) as { id?: number; decision?: string };
  try {
    const r = await resolverPropuesta(Number(id) || 0, decision === "confirmar" ? "confirmar" : "cancelar", { org: s.org.id, usuarioId: s.usuario.id, permisos: s.permisos });
    const a = await una<{ conversacion_id: number }>("select conversacion_id::int from asistente_accion where id = $1 and organizacion_id = $2", [Number(id), s.org.id]);
    if (a) {
      await consulta("insert into asistente_mensaje (organizacion_id, conversacion_id, rol, texto) values ($1, $2, 'asistente', $3)",
        [s.org.id, a.conversacion_id, `${r.estado === "hecha" ? "✅" : r.estado === "error" ? "⚠️" : "✖️"} ${r.texto}`]);
      await consulta("update asistente_conversacion set actualizada_ts = now() where id = $1", [a.conversacion_id]);
    }
    return Response.json(r);
  } catch (e) {
    return Response.json({ estado: "error", texto: motivoErp(e) });
  }
}
