// Payway (ex Decidir), API v2: la tarjeta se tokeniza en el navegador con su
// SDK (decidir.js, con la llave pública: los datos de la tarjeta nunca pasan
// por Laucen) y el servidor cobra con el token y la llave privada.
// Credenciales: medio_pago_credencial.datos = {public_key, private_key, site_id?, ambiente: "sandbox"|"produccion"}.

import { ErrorErp } from "@/lib/erp/base";

export const URL_PAYWAY = { sandbox: "https://developers.decidir.com/api/v2", produccion: "https://live.decidir.com/api/v2" } as const;

/** Marcas de tarjeta (payment_method_id de Payway). */
export const MARCAS_PAYWAY: { id: number; nombre: string }[] = [
  { id: 1, nombre: "Visa crédito" }, { id: 31, nombre: "Visa débito" }, { id: 104, nombre: "Mastercard crédito" },
  { id: 105, nombre: "Mastercard débito" }, { id: 65, nombre: "American Express" }, { id: 63, nombre: "Cabal crédito" },
  { id: 108, nombre: "Cabal débito" }, { id: 24, nombre: "Naranja" },
];

export async function cobrar(cred: { private_key: string; ambiente?: string }, d: {
  pedidoId: number; token: string; bin: string; marca: number; total: number; cuotas: number; email?: string | null; clienteId?: number | null;
}): Promise<{ aprobado: boolean; id: string | null; detalle: string; crudo: unknown }> {
  const base = cred.ambiente === "produccion" ? URL_PAYWAY.produccion : URL_PAYWAY.sandbox;
  const r = await fetch(`${base}/payments`, {
    method: "POST", headers: { apikey: cred.private_key, "content-type": "application/json", "cache-control": "no-cache" }, cache: "no-store",
    body: JSON.stringify({
      site_transaction_id: `laucen-${d.pedidoId}-${Date.now()}`, token: d.token, payment_method_id: d.marca, bin: d.bin,
      amount: Math.round(d.total * 100), currency: "ARS", installments: d.cuotas, description: `Pedido ${d.pedidoId}`,
      payment_type: "single", sub_payments: [], customer: { id: String(d.clienteId ?? d.pedidoId), email: d.email ?? undefined },
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!r) throw new ErrorErp("Payway no responde. Probá en un momento o elegí otro medio de pago.");
  const j = await r.json().catch(() => ({})) as { id?: number; status?: string; status_details?: { error?: { reason?: { description?: string } } }; validation_errors?: { code?: string; param?: string }[]; message?: string };
  const aprobado = j.status === "approved";
  const motivo = j.status_details?.error?.reason?.description ?? j.validation_errors?.map((v) => v.param ?? v.code).join(", ") ?? j.message ?? j.status ?? `error ${r.status}`;
  return { aprobado, id: j.id ? String(j.id) : null, detalle: aprobado ? "Aprobado" : `Rechazado: ${motivo}`, crudo: j };
}
