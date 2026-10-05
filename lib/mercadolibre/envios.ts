// Envíos de Mercado Libre (Mercado Envíos): leer el envío de una orden,
// guardarlo en `envio` y bajar la etiqueta para imprimir.

import { consulta } from "@/lib/erp/base";
import type { DireccionEntrada } from "@/lib/pedidos";
import { API, tokenDeCuenta } from "@/lib/meli";
import { ml, type CuentaMl } from "@/lib/mercadolibre/api";

export type EnvioMl = {
  idExterno: string;
  orderId: number | null;
  logistica: string | null;
  metodo: string | null;
  estado: string | null;
  subestado: string | null;
  tracking: string | null;
  transportista: string | null;
  receptor: string | null;
  direccion: Record<string, unknown>;
  direccionCliente: DireccionEntrada | null;
  costo: number | null;
  despacharAntes: string | null;
  entregaEstimada: string | null;
  crudo: unknown;
};

type Direccion = {
  id?: number; address_line?: string; street_name?: string; street_number?: string; comment?: string | null; zip_code?: string;
  city?: { name?: string }; state?: { id?: string; name?: string }; country?: { id?: string }; latitude?: number; longitude?: number;
  receiver_name?: string; receiver_phone?: string;
};
type EnvioCrudo = {
  id: number; order_id?: number; status?: string; substatus?: string | null; logistic_type?: string; mode?: string;
  tracking_number?: string | null; tracking_method?: string | null; receiver_address?: Direccion;
  shipping_option?: { name?: string; cost?: number; list_cost?: number; estimated_delivery_time?: { date?: string }; estimated_handling_limit?: { date?: string } };
  base_cost?: number;
};

const limpio = (x?: string | null) => (x && !/^X+$/.test(x.trim()) ? x.trim() : undefined); // ML tapa datos con "XXXXXXX"

/** "Despachar antes de" (lo que dice la etiqueta): en Colecta y punto de
 *  despacho no viene en el envío, sale del plazo de despacho del envío
 *  (/sla; si no, /lead_time). Sólo mientras falta despacharlo. */
async function plazoDespacho(cuenta: CuentaMl, e: EnvioCrudo): Promise<string | null> {
  if (!["pending", "handling", "ready_to_ship"].includes(e.status ?? "") || e.logistic_type === "fulfillment") return null;
  try {
    const sla = await ml<{ expected_date?: string | null }>(cuenta, "GET", `/shipments/${e.id}/sla`);
    if (sla.status === 200 && sla.datos?.expected_date) return sla.datos.expected_date;
    const lt = await ml<{ estimated_handling_limit?: { date?: string | null } }>(cuenta, "GET", `/shipments/${e.id}/lead_time`);
    if (lt.status === 200 && lt.datos?.estimated_handling_limit?.date) return lt.datos.estimated_handling_limit.date;
  } catch { /* sin plazo: queda "—" */ }
  return null;
}

/** Lee el envío (formato clásico de /shipments/{id}). null si ML no lo da. */
export async function leerEnvio(cuenta: CuentaMl, id: number | string): Promise<EnvioMl | null> {
  const r = await ml<EnvioCrudo>(cuenta, "GET", `/shipments/${id}`);
  if (r.status !== 200) return null;
  const e = r.datos;
  const d = e.receiver_address ?? {};
  const despacharAntes = e.shipping_option?.estimated_handling_limit?.date ?? await plazoDespacho(cuenta, e);
  const provincia = d.state?.id?.match(/^AR-(\w)$/)?.[1];
  return {
    idExterno: String(e.id),
    orderId: e.order_id ?? null,
    logistica: e.logistic_type ?? null,
    metodo: e.shipping_option?.name ?? e.mode ?? null,
    estado: e.status ?? null,
    subestado: e.substatus ?? null,
    tracking: e.tracking_number ?? null,
    transportista: e.tracking_method ?? null,
    receptor: limpio(d.receiver_name) ?? null,
    direccion: {
      linea: d.address_line ?? null, calle: d.street_name ?? null, numero: d.street_number ?? null, localidad: d.city?.name ?? null,
      provincia: d.state?.name ?? null, codigo_postal: d.zip_code ?? null, referencia: d.comment ?? null,
    },
    direccionCliente: d.street_name || d.city?.name ? {
      calle: limpio(d.street_name), numero: limpio(d.street_number), localidad: d.city?.name, provincia: d.state?.name,
      provincia_codigo: provincia, codigo_postal: limpio(d.zip_code), pais: d.country?.id ?? "AR", receptor: limpio(d.receiver_name),
      receptor_telefono: limpio(d.receiver_phone), referencia: d.comment ?? undefined, latitud: d.latitude || undefined,
      longitud: d.longitude || undefined, id_externo: d.id ? String(d.id) : undefined,
    } : null,
    costo: e.shipping_option?.cost ?? null,
    despacharAntes,
    entregaEstimada: e.shipping_option?.estimated_delivery_time?.date ?? null,
    crudo: e,
  };
}

export async function guardarEnvio(org: string, canalId: number, pedidoId: number | null, e: EnvioMl) {
  await consulta(`
    insert into envio (organizacion_id, canal_id, pedido_id, id_externo, logistica, metodo, estado, subestado, tracking, transportista,
                       receptor, direccion, costo_ars, despachar_antes, entrega_estimada, datos_externos)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16::jsonb)
    on conflict (canal_id, id_externo) where id_externo is not null do update set
      pedido_id = coalesce(excluded.pedido_id, envio.pedido_id), logistica = excluded.logistica, metodo = excluded.metodo,
      estado = excluded.estado, subestado = excluded.subestado, tracking = excluded.tracking, transportista = excluded.transportista,
      receptor = coalesce(excluded.receptor, envio.receptor), direccion = excluded.direccion, costo_ars = excluded.costo_ars,
      despachar_antes = coalesce(excluded.despachar_antes, envio.despachar_antes), entrega_estimada = excluded.entrega_estimada,
      datos_externos = excluded.datos_externos, actualizado_ts = now()`,
    [org, canalId, pedidoId, e.idExterno, e.logistica, e.metodo, e.estado, e.subestado, e.tracking, e.transportista,
      e.receptor, JSON.stringify(e.direccion), e.costo, e.despacharAntes, e.entregaEstimada, JSON.stringify({ ml: e.crudo })]);
}

/** Baja las etiquetas de uno o más envíos de la misma cuenta. `pdf` para
 *  impresora común; `zpl2` para térmica (ML lo manda en un .zip). */
export async function bajarEtiquetas(cuenta: CuentaMl, envios: string[], formato: "pdf" | "zpl2" = "pdf"): Promise<{ ok: true; tipo: string; datos: ArrayBuffer } | { ok: false; motivo: string }> {
  const token = await tokenDeCuenta(cuenta.id);
  if (!token) return { ok: false, motivo: "La cuenta de Mercado Libre está desconectada." };
  const r = await fetch(`${API}/shipment_labels?shipment_ids=${envios.join(",")}&response_type=${formato}`, {
    headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    const ya = /not_printable|status/i.test(t);
    return { ok: false, motivo: ya ? "Mercado Libre no da la etiqueta de ese envío (ya despachado, cancelado o todavía no listo para enviar)." : `Mercado Libre no dio la etiqueta (${r.status}).` };
  }
  return { ok: true, tipo: r.headers.get("content-type") ?? (formato === "pdf" ? "application/pdf" : "application/zip"), datos: await r.arrayBuffer() };
}

/** Los envíos por despachar que todavía no tienen "despachar antes de"
 *  (los que entraron antes de leer el plazo): se completan de a pocos en
 *  cada barrido. Sólo lee de ML. */
export async function completarPlazosDespacho(cuenta: CuentaMl, tope = 30): Promise<number> {
  const filas = await consulta<{ id: string; id_externo: string; estado: string | null; logistica: string | null }>(`
    select id, id_externo, estado, logistica from envio
     where canal_id = $1 and id_externo is not null and despachar_antes is null
       and estado in ('pending', 'handling', 'ready_to_ship') and coalesce(logistica, '') <> 'fulfillment'
     order by id desc limit $2`, [cuenta.canalId, tope]);
  let n = 0;
  for (const f of filas) {
    const d = await plazoDespacho(cuenta, { id: Number(f.id_externo), status: f.estado ?? undefined, logistic_type: f.logistica ?? undefined });
    if (d) { await consulta("update envio set despachar_antes = $2 where id = $1", [f.id, d]); n++; }
  }
  return n;
}
