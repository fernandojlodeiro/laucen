// El detalle de una venta de Mercado Libre (de ml_venta), leído en el momento de ML y sin guardar nada: la orden,
// el envío, los mensajes con el comprador y los reclamos o devoluciones. Sirve igual para las ventas viejas (sin
// pedido en Laucen) que para las nuevas. Sólo lee: los mensajes se piden sin marcarlos como leídos.

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";

export type RenglonVenta = { id: number; item_id: string; variacion_id: number | null; producto_id: number | null; sku: string | null; titulo: string | null;
  cantidad: number; precio_unit: number; comision: number | null; tipo_publicacion: string | null; fotos: string[] | null };
export type CabeceraVenta = { id: number; canal_id: number; canal: string; order_id: string; pack_id: string | null; estado: string; fecha: Date;
  comprador: string | null; comprador_id: string | null; envio_id: string | null; pedido_id: number | null; reclamo: boolean; cliente_id: number | null };

export type Mensaje = { de: "comprador" | "vendedor" | "otro"; texto: string; fecha: string | null };
export type Reclamo = { id: string; tipo: string | null; estado: string | null; motivo: string | null; fecha: string | null; devolucion: boolean };

export async function ventaMl(org: string, id: number): Promise<{ venta: CabeceraVenta; renglones: RenglonVenta[] } | null> {
  const v = await una<CabeceraVenta>(`
    select v.id::int, v.canal_id::int, ca.nombre canal, v.order_id::text, v.pack_id::text, v.estado, v.fecha, v.comprador, v.comprador_id::text,
           v.envio_id::text, v.pedido_id::int, v.reclamo,
           (select ci.cliente_id::int from cliente_identidad ci where ci.canal_id = v.canal_id and ci.id_externo = v.comprador_id::text limit 1) cliente_id
      from ml_venta v join canal ca on ca.id = v.canal_id where v.organizacion_id = $1 and v.id = $2`, [org, id]);
  if (!v) return null;
  // Todos los artículos del mismo carrito (o de la misma orden).
  const renglones = await consulta<RenglonVenta>(`
    select v.id::int, v.item_id, v.variacion_id::int, va.producto_id::int, coalesce(va.sku, v.sku) sku, v.titulo, v.cantidad, v.precio_unit::float8,
           v.comision::float8, v.tipo_publicacion,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = va.producto_id) fotos
      from ml_venta v left join variacion va on va.id = v.variacion_id
     where v.organizacion_id = $1 and v.canal_id = $2 and (v.order_id = $3::bigint or ($4::bigint is not null and v.pack_id = $4::bigint))
     order by v.order_id, v.id`, [org, v.canal_id, v.order_id, v.pack_id]);
  return { venta: v, renglones };
}

type MensajeMl = { from?: { user_id?: number | string }; text?: string; message_date?: { created?: string }; date_created?: string };

/** Lo que dice ML ahora: estado de la orden, envío, mensajes y reclamos. Si algo no lo da, se informa por qué. */
export async function enVivo(org: string, v: CabeceraVenta) {
  const cuenta = await cuentaDelCanal(org, v.canal_id);
  if (!cuenta) return { error: "La cuenta de Mercado Libre de esta venta no está conectada." } as const;
  const [orden, envio, mensajes, reclamos] = await Promise.all([
    ml<{ status?: string; status_detail?: unknown; date_closed?: string; total_amount?: number; payments?: { status?: string; total_paid_amount?: number }[]; mediations?: { id: number }[] }>(cuenta, "GET", `/orders/${v.order_id}`),
    v.envio_id ? ml<{ status?: string; substatus?: string; logistic_type?: string; tracking_number?: string; status_history?: Record<string, string | null> }>(cuenta, "GET", `/shipments/${v.envio_id}`) : Promise.resolve(null),
    ml<{ messages?: MensajeMl[] }>(cuenta, "GET", `/messages/packs/${v.pack_id ?? v.order_id}/sellers/${cuenta.meliUserId}?tag=post_sale&mark_as_read=false&limit=100`),
    ml<{ data?: { id: number | string; type?: string; status?: string; reason_id?: string; date_created?: string; related_entities?: string[] }[] }>(cuenta, "GET", `/post-purchase/v1/claims/search?resource_id=${v.order_id}&resource=order`),
  ]);
  const vendedor = String(cuenta.meliUserId);
  const msgs: Mensaje[] = (mensajes.status === 200 ? mensajes.datos.messages ?? [] : []).map((m): Mensaje => ({
    de: String(m.from?.user_id ?? "") === vendedor ? "vendedor" : m.from?.user_id ? "comprador" : "otro",
    texto: m.text ?? "", fecha: m.message_date?.created ?? m.date_created ?? null,
  })).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const recl: Reclamo[] = (reclamos.status === 200 ? reclamos.datos.data ?? [] : []).map((c) => ({
    id: String(c.id), tipo: c.type ?? null, estado: c.status ?? null, motivo: c.reason_id ?? null, fecha: c.date_created ?? null,
    devolucion: (c.related_entities ?? []).includes("return"),
  }));
  return {
    orden: orden.status === 200 ? orden.datos : null, ordenError: orden.status === 200 ? null : `Mercado Libre contestó ${orden.status}`,
    envio: envio && envio.status === 200 ? envio.datos : null, envioError: envio && envio.status !== 200 ? `Mercado Libre contestó ${envio.status}` : null,
    mensajes: msgs, mensajesError: mensajes.status === 200 ? null : `Mercado Libre contestó ${mensajes.status}`,
    reclamos: recl, reclamosError: reclamos.status === 200 ? null : `Mercado Libre contestó ${reclamos.status}`,
  } as const;
}

/** Las ventas de ML de un comprador (por su usuario de ML en esa cuenta), para pestañas de cliente, preguntas o mensajes. */
export async function ventasDelComprador(org: string, canalId: number, compradorId: string | number): Promise<{ id: number; fecha: Date; titulo: string | null; cantidad: number; total: number; estado: string; pedido_id: number | null }[]> {
  return consulta(`
    select id::int, fecha, titulo, cantidad, (precio_unit * cantidad)::float8 total, estado, pedido_id::int
      from ml_venta where organizacion_id = $1 and canal_id = $2 and comprador_id = $3::bigint order by fecha desc limit 200`, [org, canalId, String(compradorId)]);
}
