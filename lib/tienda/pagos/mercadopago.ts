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

/** Lo que cobra Mercado Pago al comprador por pagar en cuotas (installment_rate, en %), por cantidad de
 *  cuotas: el menor entre Visa y Mastercard (su consulta de cuotas, la misma del checkout). Es una
 *  referencia: la tasa final depende de la tarjeta y el banco del comprador. Vacío si no contesta. */
export async function tasasCuotas(accessToken: string): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  for (const medio of ["visa", "master"]) {
    const r = await fetch(`${API}/v1/payment_methods/installments?amount=100000&payment_method_id=${medio}`,
      { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!r?.ok) continue;
    const j = await r.json().catch(() => []) as { payer_costs?: { installments: number; installment_rate: number }[] }[];
    for (const x of Array.isArray(j) ? j : []) for (const c of x.payer_costs ?? []) {
      if (!Number.isFinite(c.installment_rate) || c.installments < 2) continue;
      m.set(c.installments, Math.min(m.get(c.installments) ?? Infinity, c.installment_rate));
    }
  }
  return m;
}

/** Red y tipo (crédito o débito) de una tarjeta: la consulta de BIN de Mercado Pago (los primeros 6 números, que no
 *  son un dato sensible) con una llave de MP de la organización: la del medio de pago Mercado Pago de la tienda o, si no,
 *  la de la cuenta conectada al canal. null en lo que no se pudo saber. */
export async function tipoDeTarjeta(org: string, canalId: number, bin: string):
  Promise<{ red: import("@/lib/tienda/tarjetas").Red | null; tipo: import("@/lib/tienda/tarjetas").TipoTarjeta | null } | null> {
  const seis = bin.replace(/\D/g, "").slice(0, 6);
  if (seis.length < 6) return null;
  const { una } = await import("@/lib/erp/base");
  const cred = await una<{ token: string | null }>(`
    select c.datos ->> 'access_token' token from medio_pago m join medio_pago_credencial c on c.medio_pago_id = m.id
     where m.organizacion_id = $1 and (m.canal_id is null or m.canal_id = $2) and m.tipo = 'mercadopago' and c.datos ->> 'access_token' is not null
     order by m.canal_id nulls last limit 1`, [org, canalId]);
  let token = cred?.token ?? null;
  if (!token) {
    const cx = await una<{ id: number }>("select conexion_id::int id from canal_mp where canal_id = $1 and organizacion_id = $2 limit 1", [canalId, org]);
    if (cx) token = await (await import("@/lib/mercadopago/conexion")).tokenDeConexion(cx.id);
  }
  if (!token) return null;
  const r = await fetch(`${API}/v1/payment_methods/search?site_id=MLA&marketplace=NONE&bins=${seis}`, {
    headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(6_000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = await r.json().catch(() => ({})) as { results?: { id?: string; payment_type_id?: string }[] };
  const { tipoDeMetodoMp, redDeMetodoMp } = await import("@/lib/tienda/tarjetas");
  const res = (j.results ?? []).filter((m) => m.payment_type_id === "credit_card" || m.payment_type_id === "debit_card" || m.payment_type_id === "prepaid_card");
  const tipos = new Set(res.map(tipoDeMetodoMp).filter(Boolean));
  const redes = new Set(res.map((m) => redDeMetodoMp(m.id)).filter(Boolean));
  return { red: redes.size === 1 ? [...redes][0]! : null, tipo: tipos.size === 1 ? [...tipos][0]! : null };
}
