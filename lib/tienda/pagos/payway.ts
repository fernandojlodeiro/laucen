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

/** Devolución total de un pago (Fer, 6/10): POST /payments/{id}/refunds con el cuerpo vacío. Es
 *  la misma operación para anular (en el día, antes del cierre de lote: Payway la toma como
 *  anulación) y para devolver (de otro día: devolución al resumen de la tarjeta). Usa la llave
 *  privada del medio de pago Payway del canal del pedido. */
export async function devolver(org: string, pedidoId: number, pagoId: string): Promise<{ id: string | null; estado: string | null }> {
  const { una } = await import("@/lib/erp/base");
  const c = await una<{ datos: { private_key?: string; ambiente?: string } }>(`
    select cr.datos from pedido p join medio_pago m on m.organizacion_id = p.organizacion_id and m.tipo = 'payway' and (m.canal_id is null or m.canal_id = p.canal_id)
      join medio_pago_credencial cr on cr.medio_pago_id = m.id
     where p.id = $1 and p.organizacion_id = $2 order by m.canal_id nulls last limit 1`, [pedidoId, org]);
  if (!c?.datos.private_key) throw new ErrorErp("No está cargada la llave privada de Payway.");
  const base = c.datos.ambiente === "produccion" ? URL_PAYWAY.produccion : URL_PAYWAY.sandbox;
  const r = await fetch(`${base}/payments/${encodeURIComponent(pagoId)}/refunds`, {
    method: "POST", headers: { apikey: c.datos.private_key, "content-type": "application/json", "cache-control": "no-cache" }, cache: "no-store",
    body: "{}", signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!r) throw new ErrorErp("Payway no responde. Probá en un momento.");
  const j = await r.json().catch(() => ({})) as { id?: number; status?: string; message?: string; error_type?: string; validation_errors?: { code?: string; param?: string }[] };
  if (!r.ok || ["rejected", "error"].includes(String(j.status ?? ""))) {
    const motivo = j.message ?? j.validation_errors?.map((v) => v.param ?? v.code).join(", ") ?? j.error_type ?? j.status ?? `error ${r.status}`;
    throw new ErrorErp(`Payway no lo devolvió: ${motivo}`);
  }
  return { id: j.id != null ? String(j.id) : null, estado: j.status ?? null };
}
