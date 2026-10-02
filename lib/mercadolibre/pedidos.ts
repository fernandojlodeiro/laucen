// Pedidos de Mercado Libre → pedidos de Laucen (orden de la sesión 2).
// Entra por la notificación orders_v2 (o el barrido de seguridad): se lee la
// orden, sus datos de facturación y su envío, y se carga con crearPedido
// (crea o enlaza el cliente, no duplica). El estado se lleva con
// cambiarEstado según lo que diga ML: pagada → pagado (reserva stock),
// despachada → despachado (la reserva pasa a venta), entregada → entregado,
// cancelada → cancelado (libera). Preparación la marca el depósito (sesión 4).

import { consulta, una, enTransaccion } from "@/lib/erp/base";
import { crearPedido, cambiarEstado, type ClienteEntrada, type EstadoPedido, type DireccionEntrada } from "@/lib/pedidos";
import { ml, type CuentaMl } from "@/lib/mercadolibre/api";
import { guardarEnvio, leerEnvio, type EnvioMl } from "@/lib/mercadolibre/envios";

type ItemOrden = {
  item: { id: string; title: string; variation_id: number | null; seller_sku: string | null; seller_custom_field: string | null; variation_attributes?: { name: string; value_name: string }[] };
  quantity: number; unit_price: number; sale_fee?: number | null; listing_type_id?: string;
};
export type OrdenMl = {
  id: number; status: string; date_created: string; date_closed?: string | null; pack_id: number | null; total_amount: number;
  currency_id: string; order_items: ItemOrden[]; buyer: { id: number; nickname?: string };
  shipping?: { id: number | null } | null; tags?: string[];
  payments?: { payment_type?: string; payment_method_id?: string; status?: string; installments?: number }[];
};
type Facturacion = { billing_info?: { doc_type?: string; doc_number?: string; additional_info?: { type: string; value: string }[] } };

/** La variación de Laucen de un artículo de ML: por la publicación ya
 *  vinculada y, si no, por SKU (seller_sku / seller_custom_field = SKU de la
 *  variación). Si la encuentra por SKU, deja la publicación vinculada. */
export async function variacionDeItem(cuenta: CuentaMl, itemId: string, variationId: number | null, sku: string | null, titulo?: string): Promise<number | null> {
  const org = cuenta.organizacionId;
  const varExt = variationId ? String(variationId) : "";
  const pub = await una<{ variacion_id: string }>(`
    select variacion_id from publicacion where canal_id = $1 and id_externo = $2 and coalesce(variacion_externa, '') = $3`,
    [cuenta.canalId, itemId, varExt]);
  if (pub) return Number(pub.variacion_id);
  if (!sku?.trim()) return null;
  const v = await una<{ id: string }>("select id from variacion where organizacion_id = $1 and lower(sku) = lower($2)", [org, sku.trim()]);
  if (!v) return null;
  await consulta(`
    insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, variacion_externa, titulo, estado)
    values ($1, $2, $3, $4, nullif($5, ''), $6, 'activa')
    on conflict (canal_id, id_externo, coalesce(variacion_externa, '')) where id_externo is not null do nothing`,
    [org, v.id, cuenta.canalId, itemId, varExt, titulo ?? null]);
  return Number(v.id);
}

const info = (f: Facturacion, tipo: string) => f.billing_info?.additional_info?.find((x) => x.type === tipo)?.value?.trim() || null;

/** El cliente tal como lo da ML: comprador + facturación + quien recibe. */
function clienteDeOrden(o: OrdenMl, f: Facturacion, envio: EnvioMl | null): ClienteEntrada {
  const empresa = info(f, "BUSINESS_NAME");
  const nombre = info(f, "FIRST_NAME");
  const apellido = info(f, "LAST_NAME");
  const docTipo = info(f, "DOC_TYPE") ?? f.billing_info?.doc_type ?? null;
  const docNum = info(f, "DOC_NUMBER") ?? f.billing_info?.doc_number ?? null;
  const esCuit = /^(CUIT|CUIL)$/i.test(docTipo ?? "") || (docNum?.replace(/\D/g, "").length === 11);
  const fiscal: DireccionEntrada = {
    calle: info(f, "STREET_NAME") ?? undefined, numero: info(f, "STREET_NUMBER") ?? undefined,
    localidad: info(f, "CITY_NAME") ?? undefined, provincia: info(f, "STATE_NAME") ?? undefined,
    provincia_codigo: info(f, "STATE_CODE") ?? undefined, codigo_postal: info(f, "ZIP_CODE") ?? undefined,
    pais: info(f, "COUNTRY_ID") ?? undefined,
  };
  return {
    id_externo: String(o.buyer.id),
    apodo_ml: o.buyer.nickname ?? null,
    nombre: empresa ?? ([apellido, nombre].filter(Boolean).join(", ") || envio?.receptor || o.buyer.nickname || null),
    razon_social: empresa,
    nombre_pila: nombre,
    apellido,
    documento_tipo: docTipo,
    documento_numero: docNum,
    cuit: esCuit ? docNum : null,
    condicion_iva: info(f, "TAXPAYER_TYPE_ID"),
    direccion: fiscal,
    direccion_envio: envio?.direccionCliente ?? null,
    datos_externos: { ml: { comprador: o.buyer, facturacion: f.billing_info ?? null } },
  };
}

const TIPOS_PAGO: Record<string, string> = {
  account_money: "Dinero en cuenta de Mercado Pago", credit_card: "Tarjeta de crédito", debit_card: "Tarjeta de débito",
  ticket: "Efectivo (Rapipago / Pago Fácil)", bank_transfer: "Transferencia", digital_currency: "Cuotas sin tarjeta", consumer_credits: "Cuotas sin tarjeta",
};
function medioDePago(p: NonNullable<OrdenMl["payments"]>[number]) {
  const tipo = TIPOS_PAGO[p.payment_type ?? ""] ?? p.payment_type ?? "";
  const metodo = p.payment_method_id && p.payment_method_id !== p.payment_type && !TIPOS_PAGO[p.payment_method_id] ? p.payment_method_id : "";
  return [tipo, metodo, p.installments && p.installments > 1 ? `${p.installments} cuotas` : ""].filter(Boolean).join(" · ");
}

/** A qué estado de Laucen corresponde lo que dice ML (orden + envío). */
function estadoSegunMl(o: OrdenMl, envio: EnvioMl | null): EstadoPedido | null {
  if (o.status === "cancelled" || o.status === "invalid") return "cancelado";
  const e = envio?.estado;
  if (e === "delivered") return "entregado";
  if (e === "shipped") return "despachado";
  if (o.status === "paid" || o.status === "partially_paid" || o.status === "partially_refunded") return "pagado";
  return null; // payment_required / payment_in_process: sigue 'nuevo'
}

const ORDEN_ESTADOS: EstadoPedido[] = ["nuevo", "pagado", "en_preparacion", "preparado", "despachado", "entregado"];

/** Trae una orden de ML y la deja en Laucen (crea o actualiza). Devuelve el id del pedido. */
export async function importarOrden(cuenta: CuentaMl, orderId: number | string): Promise<number | null> {
  if (!cuenta.canalId) return null;
  const org = cuenta.organizacionId;
  const r = await ml<OrdenMl>(cuenta, "GET", `/orders/${orderId}`);
  if (r.status !== 200) throw new Error(`orden ${orderId}: ML contestó ${r.status}`);
  const o = r.datos;
  const fact = await ml<Facturacion>(cuenta, "GET", `/orders/${o.id}/billing_info`);
  const facturacion = fact.status === 200 ? fact.datos : {};
  const envio = o.shipping?.id ? await leerEnvio(cuenta, o.shipping.id) : null;

  // El depósito: Full sale del depósito Full del canal; el resto, del que el
  // canal tenga primero (lo decide cambiarEstado si queda vacío).
  let depositoId: number | null = null;
  if (envio?.logistica === "fulfillment") {
    const d = await una<{ id: string }>(`
      select d.id from canal_deposito cd join deposito d on d.id = cd.deposito_id
       where cd.canal_id = $1 and d.tipo = 'full_ml' and d.estado = 'activo' order by cd.prioridad limit 1`, [cuenta.canalId]);
    depositoId = d ? Number(d.id) : null;
  }

  const lineas = [];
  for (const it of o.order_items) {
    const sku = it.item.seller_sku || it.item.seller_custom_field || null;
    const variacionId = await variacionDeItem(cuenta, it.item.id, it.item.variation_id, sku, it.item.title);
    const atributos = (it.item.variation_attributes ?? []).map((a) => a.value_name).filter(Boolean).join(" / ");
    lineas.push({
      variacion_id: variacionId, sku: variacionId ? null : (sku ?? it.item.id), cantidad: it.quantity,
      precio_unitario: it.unit_price, titulo: atributos ? `${it.item.title} — ${atributos}` : it.item.title,
    });
  }
  const pago = o.payments?.[0];
  const comision = o.order_items.reduce((s, it) => s + (it.sale_fee ?? 0), 0);
  const datos = { ml: { orden: o, facturacion: facturacion.billing_info ?? null } };

  const creado = await crearPedido(org, {
    canalId: cuenta.canalId,
    id_externo: String(o.id),
    fecha: o.date_created,
    moneda: o.currency_id === "USD" ? "USD" : "ARS",
    cliente: clienteDeOrden(o, facturacion, envio),
    lineas,
    medio_pago: pago ? medioDePago(pago) : null,
    estado_pago: o.status === "paid" ? "pagado" : "pendiente",
    deposito_id: depositoId,
    envio: envio ? { envio_id: envio.idExterno, logistica: envio.logistica, pack_id: o.pack_id } : { pack_id: o.pack_id, sin_envio: true },
    permitir_sin_vincular: true,
    datos_externos: datos,
    comision_ars: comision || null,
  }, "sistema");

  const pedidoId = creado.pedidoId;
  if (!creado.creado) {
    // Ya existía: se refresca lo que ML puede haber cambiado.
    await consulta(`update pedido set datos_externos = datos_externos || $3::jsonb, comision_ars = coalesce($4, comision_ars),
                           estado_pago = case when $5 = 'paid' and estado_pago = 'pendiente' then 'pagado' else estado_pago end
                     where id = $1 and organizacion_id = $2`, [pedidoId, org, JSON.stringify(datos), comision || null, o.status]);
  }
  if (envio) await guardarEnvio(org, cuenta.canalId, pedidoId, envio);
  await llevarEstado(org, pedidoId, estadoSegunMl(o, envio));
  return pedidoId;
}

/** Avanza el pedido hasta el estado que corresponde, sin volver atrás
 *  (si Laucen ya está más adelante, por ejemplo "preparado", lo deja). */
async function llevarEstado(org: string, pedidoId: number, objetivo: EstadoPedido | null) {
  if (!objetivo) return;
  const p = await una<{ estado: EstadoPedido }>("select estado from pedido where id = $1 and organizacion_id = $2", [pedidoId, org]);
  if (!p || p.estado === objetivo || p.estado === "cancelado" || p.estado === "devuelto") return;
  if (objetivo !== "cancelado" && ORDEN_ESTADOS.indexOf(objetivo) <= ORDEN_ESTADOS.indexOf(p.estado)) return;
  await enTransaccion((c) => cambiarEstado(org, pedidoId, objetivo, "sistema", "Mercado Libre", c));
}

/** Barrido de seguridad: las órdenes que cambiaron desde la última vez (por
 *  si se perdió una notificación). Devuelve cuántas trajo. */
export async function barrerOrdenes(cuenta: CuentaMl, hastaMs: number): Promise<number> {
  const fila = await una<{ desde: Date | null }>("select pedidos_desde desde from meli_cuenta where id = $1", [cuenta.id]);
  // La primera vez, los últimos 3 días; después, desde la última pasada (con 1 hora de margen).
  const desde = new Date((fila?.desde?.getTime() ?? Date.now() - 3 * 86400_000) - 3600_000);
  const inicio = new Date();
  let n = 0;
  for (let offset = 0; offset < 1000 && Date.now() < hastaMs; offset += 50) {
    const r = await ml<{ results: { id: number }[]; paging: { total: number } }>(cuenta, "GET",
      `/orders/search?seller=${cuenta.meliUserId}&order.date_last_updated.from=${encodeURIComponent(desde.toISOString())}&sort=date_asc&limit=50&offset=${offset}`);
    if (r.status !== 200) throw new Error(`orders/search: ML contestó ${r.status}`);
    for (const o of r.datos.results) {
      if (Date.now() > hastaMs) return n;
      await importarOrden(cuenta, o.id);
      n++;
    }
    if (offset + 50 >= r.datos.paging.total) {
      await consulta("update meli_cuenta set pedidos_desde = $2 where id = $1", [cuenta.id, inicio]);
      break;
    }
  }
  return n;
}
