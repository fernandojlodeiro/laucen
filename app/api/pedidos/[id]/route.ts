// GET /api/pedidos/:id — un pedido completo (cabecera, líneas, historial),
// sólo si es del canal del token.

import { canalDelPedido, noAutorizado, respuestaError } from "@/lib/api/canal";
import { pedidoCompleto } from "@/lib/pedidos";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const canal = await canalDelPedido(req);
    if (!canal) return noAutorizado();
    const id = Number((await params).id);
    const p = Number.isInteger(id) && id > 0 ? await pedidoCompleto(canal.organizacionId, id) : null;
    if (!p || (p as Record<string, unknown>).canal_id !== canal.id) return Response.json({ error: "No existe ese pedido en este canal." }, { status: 404 });
    return Response.json(p);
  } catch (e) {
    return respuestaError(e);
  }
}
