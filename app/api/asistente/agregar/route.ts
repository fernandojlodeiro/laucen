// «Agregar al informe» (lib/asistente/destinos.ts): POST { id, destino } guarda una respuesta del asistente (de una
// conversación propia) como una sección más del informe de esa pantalla, con la pregunta que la originó como título.

import type { NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { agregarExtra } from "@/lib/marketpro/informe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const s = await sesionActual();
  if (!s || !tienePermiso(s.permisos, "asistente_usar")) return Response.json({ error: "Sin permiso." }, { status: 403 });
  const { id, destino } = await req.json().catch(() => ({})) as { id?: number; destino?: string };
  const m = await una<{ texto: string; pregunta: string | null }>(`
    select m.texto, (select p.texto from asistente_mensaje p where p.conversacion_id = m.conversacion_id and p.id < m.id and p.rol = 'usuario' order by p.id desc limit 1) pregunta
      from asistente_mensaje m join asistente_conversacion c on c.id = m.conversacion_id
     where m.id = $1 and m.rol = 'asistente' and c.organizacion_id = $2 and c.usuario_id = $3`, [Number(id) || 0, s.org.id, s.usuario.id]);
  if (!m) return Response.json({ error: "No encuentro esa respuesta." }, { status: 404 });
  const mpro = /^mpro:(\d+)$/.exec(destino ?? "");
  if (mpro) {
    if (!s.superadmin && !tienePermiso(s.permisos, "market_pro_ver")) return Response.json({ error: "Sin permiso." }, { status: 403 });
    await agregarExtra(s.org.id, Number(mpro[1]), m.pregunta, m.texto, s.usuario.id);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Esta pantalla no tiene informe." }, { status: 400 });
}
