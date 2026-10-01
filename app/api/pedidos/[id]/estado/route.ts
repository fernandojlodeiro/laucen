// POST /api/pedidos/:id/estado — cambia el estado con cambiarEstado()
// (valida la transición, historial, evento, reserva/venta/liberación de
// stock). Cuerpo: { "estado": "pagado", "nota"?: "…" }.
// Respuesta: { pedido_id, anterior, estado }. 422 si la transición no vale.

import { canalDelPedido, noAutorizado, respuestaError } from "@/lib/api/canal";
import { cambiarEstado, esEstadoPedido } from "@/lib/pedidos";
import { una } from "@/lib/erp/base";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const canal = await canalDelPedido(req);
    if (!canal) return noAutorizado();
    const id = Number((await params).id);
    const suyo = Number.isInteger(id) && id > 0
      ? await una("select 1 from pedido where id = $1 and canal_id = $2", [id, canal.id]) : null;
    if (!suyo) return Response.json({ error: "No existe ese pedido en este canal." }, { status: 404 });
    const cuerpo = await req.json().catch(() => null) as { estado?: unknown; nota?: unknown } | null;
    if (!esEstadoPedido(cuerpo?.estado)) {
      return Response.json({ error: "Estado desconocido. Valen: nuevo, pagado, en_preparacion, preparado, despachado, entregado, cancelado, devuelto." }, { status: 400 });
    }
    const anterior = await cambiarEstado(canal.organizacionId, id, cuerpo.estado, "sistema", cuerpo.nota != null ? String(cuerpo.nota) : null);
    return Response.json({ pedido_id: id, anterior, estado: cuerpo.estado });
  } catch (e) {
    return respuestaError(e);
  }
}
