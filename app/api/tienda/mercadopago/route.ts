// Aviso de Mercado Pago (notification_url de la preferencia): llega el id
// del pago; se consulta a MP con la credencial de ese medio de pago y, si
// está aprobado, se confirma el pedido. MP reintenta si no recibe 200.

import { una } from "@/lib/erp/base";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { consultarPago } from "@/lib/tienda/pagos/mercadopago";
import { confirmarPago, pagoFallido } from "@/lib/tienda/pagos/confirmar";

export const dynamic = "force-dynamic";

async function atender(req: Request) {
  await asegurarEsquemaErp();
  const u = new URL(req.url);
  const medioId = Number(u.searchParams.get("medio"));
  let cuerpo: { type?: string; topic?: string; data?: { id?: string | number }; resource?: string } = {};
  try { cuerpo = await req.json(); } catch { /* MP a veces avisa por la dirección */ }
  const tipo = cuerpo.type ?? cuerpo.topic ?? u.searchParams.get("type") ?? u.searchParams.get("topic");
  const pagoId = String(cuerpo.data?.id ?? u.searchParams.get("data.id") ?? u.searchParams.get("id") ?? "");
  if (tipo !== "payment" || !pagoId || !medioId) return new Response(null, { status: 200 });
  const m = await una<{ organizacion_id: string; token: string | null }>(`
    select m.organizacion_id, c.datos ->> 'access_token' token from medio_pago m join medio_pago_credencial c on c.medio_pago_id = m.id
     where m.id = $1 and m.tipo = 'mercadopago'`, [medioId]);
  if (!m?.token) return new Response(null, { status: 200 });
  const p = await consultarPago(m.token, pagoId);
  if (!p?.pedidoId) return new Response(null, { status: 200 });
  const pedido = await una("select 1 from pedido where id = $1 and organizacion_id = $2", [p.pedidoId, m.organizacion_id]);
  if (!pedido) return new Response(null, { status: 200 });
  if (p.estado === "aprobado") {
    await confirmarPago(m.organizacion_id, p.pedidoId, { medio: "mercadopago", idExterno: p.id, importe: p.importe, cuotas: p.cuotas, detalle: "Aprobado por Mercado Pago", crudo: p.crudo }, "tienda");
  } else if (p.estado === "rechazado" || p.estado === "cancelado") {
    await pagoFallido(m.organizacion_id, p.pedidoId, "mercadopago", p.id, p.estado, `Mercado Pago: ${p.estado}`, p.crudo);
  }
  return new Response(null, { status: 200 });
}

export async function POST(req: Request) {
  try { return await atender(req); } catch (e) { console.error("[tienda] aviso de MP", e); return new Response(null, { status: 500 }); }
}
export const GET = POST;
