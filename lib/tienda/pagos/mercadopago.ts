// Mercado Pago (Checkout Pro): se crea una "preferencia" con el total del
// pedido y el comprador paga en la página de MP; MP avisa a
// /api/tienda/mercadopago?medio=<id> y se consulta el pago para confirmarlo.
// Credencial: el access token de producción de la cuenta de MP del vendedor
// (medio_pago_credencial.datos.access_token).

import { ErrorErp } from "@/lib/erp/base";

const API = "https://api.mercadopago.com";

export async function crearPreferencia(accessToken: string, d: {
  pedidoId: number; titulo: string; total: number; email?: string | null; nombre?: string | null; maxCuotas?: number | null;
  exito: string; fallo: string; pendiente: string; aviso: string;
}): Promise<{ id: string; url: string }> {
  const r = await fetch(`${API}/checkout/preferences`, {
    method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, cache: "no-store",
    body: JSON.stringify({
      items: [{ id: String(d.pedidoId), title: d.titulo.slice(0, 250), quantity: 1, unit_price: Math.round(d.total * 100) / 100, currency_id: "ARS" }],
      external_reference: String(d.pedidoId),
      payer: { email: d.email ?? undefined, name: d.nombre ?? undefined },
      back_urls: { success: d.exito, failure: d.fallo, pending: d.pendiente },
      auto_return: "approved",
      notification_url: d.aviso,
      ...(d.maxCuotas ? { payment_methods: { installments: d.maxCuotas } } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!r) throw new ErrorErp("Mercado Pago no responde. Probá en un momento o elegí otro medio de pago.");
  const j = await r.json().catch(() => ({})) as { id?: string; init_point?: string; message?: string };
  if (!r.ok || !j.init_point) throw new ErrorErp(`Mercado Pago no aceptó el pago${j.message ? ` (${j.message})` : ""}. Elegí otro medio de pago.`);
  return { id: j.id!, url: j.init_point };
}

export type PagoMp = { id: string; estado: "aprobado" | "pendiente" | "rechazado" | "cancelado" | "reembolsado"; pedidoId: number | null; importe: number; cuotas: number; crudo: unknown };

export async function consultarPago(accessToken: string, id: string): Promise<PagoMp | null> {
  const r = await fetch(`${API}/v1/payments/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r?.ok) return null;
  const p = await r.json() as { id: number; status: string; external_reference?: string; transaction_amount: number; installments?: number };
  const estado = p.status === "approved" ? "aprobado" : ["rejected"].includes(p.status) ? "rechazado" : ["cancelled"].includes(p.status) ? "cancelado"
    : ["refunded", "charged_back"].includes(p.status) ? "reembolsado" : "pendiente";
  return { id: String(p.id), estado, pedidoId: p.external_reference ? Number(p.external_reference) : null, importe: p.transaction_amount, cuotas: p.installments ?? 1, crudo: p };
}
