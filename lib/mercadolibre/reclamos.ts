// Reclamos de Mercado Libre (claims de posventa): se leen de ML cuando llega
// la notificación ("claims" / "claims_actions") y en el barrido de 30 min
// (los abiertos y los últimos cerrados), y se guardan en reclamo,
// reclamo_mensaje y reclamo_evento (db/reclamos.sql).
//
// Leer de ML se puede siempre. Lo que CAMBIA algo en ML (mensaje al
// comprador, devolver la plata, aceptar la devolución, pedir mediación) es
// siempre un botón de la ficha = el clic de Fer, y sale por la cola
// (lib/mercadolibre/cola.ts, tipo 'reclamo'). Nada se contesta solo.
//
// Endpoints que se leen (todos GET):
//   /post-purchase/v1/claims/search?status=opened|closed&offset&limit
//   /post-purchase/v1/claims/{id}
//   /post-purchase/v1/claims/{id}/messages
//   /post-purchase/v1/claims/{id}/expected-resolutions
//   /post-purchase/v2/claims/{id}/returns
//   /post-purchase/v1/claims/reasons/{reason_id}

import { createHash } from "node:crypto";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl, type RespuestaMl } from "@/lib/mercadolibre/api";
import { encolar, PRIORIDAD, type PedidoMl } from "@/lib/mercadolibre/cola";

// ── Lo que contesta ML ─────────────────────────────────────

export type AccionMl = { action: string; mandatory?: boolean; due_date?: string | null };
export type JugadorMl = { role: string; type?: string; user_id: number | string; available_actions?: AccionMl[] };
export type ReclamoMl = {
  id: number | string;
  resource: string;
  resource_id: number | string;
  status: string;
  type: string;
  stage: string;
  parent_id?: number | string | null;
  reason_id?: string | null;
  fulfilled?: boolean;
  quantity_type?: string;
  players: JugadorMl[];
  resolution?: { reason?: string | null; date_created?: string; benefited?: string[] | null; closed_by?: string | null; applied_coverage?: boolean } | null;
  site_id?: string;
  date_created: string;
  last_updated: string;
  related_entities?: string[];
};
export type MensajeReclamoMl = {
  sender_role: string; receiver_role?: string; message?: string | null; date_created?: string; message_date?: string;
  attachments?: { filename?: string; original_filename?: string; size?: number; type?: string; date_created?: string }[] | null;
  hash?: string; stage?: string; status?: string; message_moderation?: { status?: string } | null;
};
export type DevolucionMl = {
  id: number | string; claim_id?: number | string; status: string; subtype?: string; status_money?: string; refund_at?: string;
  shipments?: { shipment_id: number | string; status: string; tracking_number?: string | null; type?: string; destination?: { name?: string } | null }[];
  orders?: { order_id: number | string; item_id?: string; variation_id?: number | string | null; return_quantity?: number; total_quantity?: number }[];
  date_created?: string; last_updated?: string;
};
export type ResolucionEsperadaMl = { player_role: string; expected_resolution: string; status: string; date_created?: string; details?: unknown };

/** Cómo se lee de ML (GET): por defecto la API con la llave de la cuenta. Los tests pasan otro. */
export type Leer = (ruta: string) => Promise<RespuestaMl>;

/** Lo que se guarda de la orden de ML de un reclamo sin pedido en Laucen (venta de Virtual Seller): quién compró y qué. */
export type OrdenMlResumen = {
  comprador: { id: number | null; nickname: string | null; nombre: string | null };
  fecha: string | null; estado: string | null; total: number | null; envio_id: string | null;
  /** Si ML no dio la orden: por qué. Entonces el comprador y los productos son lo poco que se sabe por la devolución. */
  error?: string | null;
  items: { item_id: string; titulo: string | null; cantidad: number; precio: number | null; sku: string | null; foto: string | null; permalink: string | null; reclamado: boolean }[];
};

type OrdenMl = {
  date_created?: string; status?: string; total_amount?: number; shipping?: { id?: number | string | null };
  buyer?: { id?: number; nickname?: string; first_name?: string; last_name?: string };
  order_items?: { item?: { id?: string; title?: string; seller_sku?: string | null; seller_custom_field?: string | null }; quantity?: number; unit_price?: number }[];
};

/** Resume una orden de ML. `devueltos` = los item_id de la devolución (si el reclamo es de una parte de la orden). Puro. */
export function resumirOrdenMl(o: OrdenMl | null | undefined, devueltos: string[] = []): OrdenMlResumen | null {
  if (!o || typeof o !== "object" || !Array.isArray(o.order_items)) return null;
  const nombre = [o.buyer?.first_name, o.buyer?.last_name].filter(Boolean).join(" ").trim();
  return {
    comprador: { id: o.buyer?.id ?? null, nickname: o.buyer?.nickname ?? null, nombre: nombre || null },
    fecha: o.date_created ?? null, estado: o.status ?? null, total: o.total_amount ?? null, envio_id: o.shipping?.id != null ? String(o.shipping.id) : null,
    items: o.order_items.filter((x) => x.item?.id).map((x) => ({
      item_id: x.item!.id!, titulo: x.item!.title ?? null, cantidad: x.quantity ?? 1, precio: x.unit_price ?? null,
      sku: x.item!.seller_sku?.trim() || x.item!.seller_custom_field?.trim() || null, foto: null, permalink: null,
      reclamado: devueltos.length === 0 || devueltos.includes(x.item!.id!),
    })),
  };
}

/** Pide a ML la orden del reclamo (comprador y productos) y los datos de cada producto (título, foto, enlace). Si ML no da la
 *  orden, se arma lo que se puede con el artículo de la devolución y se anota por qué (`error`). */
async function traerOrdenMl(leer: Leer, orden: string, devueltos: { item_id: string; cantidad: number }[], compradorId: string | null): Promise<OrdenMlResumen | null> {
  try {
    const r = await leer(`/orders/${orden}`);
    let res = r.status === 200 ? resumirOrdenMl(r.datos as OrdenMl, devueltos.map((x) => x.item_id)) : null;
    let error: string | null = null;
    if (!res) {
      const d = r.datos as { message?: string; error?: string } | string | null;
      const detalle = typeof d === "string" ? d.slice(0, 120) : d?.message ?? d?.error ?? "";
      error = `Mercado Libre no dio la orden (${r.status === 0 ? "sin respuesta" : r.status}${detalle ? `: ${detalle}` : ""}).`;
      if (!devueltos.length) return { comprador: { id: compradorId ? Number(compradorId) : null, nickname: null, nombre: null }, fecha: null, estado: null, total: null, envio_id: null, items: [], error };
      res = {
        comprador: { id: compradorId ? Number(compradorId) : null, nickname: null, nombre: null }, fecha: null, estado: null, total: null, envio_id: null,
        items: devueltos.map((x) => ({ item_id: x.item_id, titulo: null, cantidad: x.cantidad, precio: null, sku: null, foto: null, permalink: null, reclamado: true })),
      };
    }
    res.error = error;
    if (!res.items.length) return res;
    const it = await leer(`/items?ids=${[...new Set(res.items.map((x) => x.item_id))].slice(0, 20).join(",")}&attributes=id,title,secure_thumbnail,permalink,seller_custom_field`);
    if (it.status === 200 && Array.isArray(it.datos)) {
      const por = new Map((it.datos as { code: number; body: { id: string; title?: string; secure_thumbnail?: string; permalink?: string; seller_custom_field?: string | null } }[]).filter((x) => x.code === 200).map((x) => [x.body.id, x.body]));
      for (const x of res.items) {
        const b = por.get(x.item_id);
        x.titulo = x.titulo ?? b?.title ?? null; x.foto = b?.secure_thumbnail ?? null; x.permalink = b?.permalink ?? null; x.sku = x.sku ?? b?.seller_custom_field?.trim() ?? null;
      }
    }
    return res;
  } catch (e) {
    return { comprador: { id: compradorId ? Number(compradorId) : null, nickname: null, nombre: null }, fecha: null, estado: null, total: null, envio_id: null, items: [], error: `No se pudo pedir la orden a Mercado Libre (${(e as Error).message.slice(0, 100)}).` };
  }
}

const leerDe = (cuenta: CuentaMl): Leer => (ruta) => ml(cuenta, "GET", ruta);

// ── En criollo ─────────────────────────────────────────────

/** Las acciones de ML que se pueden hacer desde la ficha, con su botón. */
export type DefAccion = {
  texto: string;
  ayuda: string;
  /** Qué hay que completar antes de mandarla. */
  campo?: "mensaje" | "porcentaje";
  /** Pide confirmar en el lugar ("¿Seguro? Sí / No"): mueve plata o abre mediación. */
  confirmar?: boolean;
};
export const ACCIONES_RECLAMO: Record<string, DefAccion> = {
  send_message_to_complainant: { texto: "Mandar mensaje al comprador", ayuda: "Le llega al comprador dentro del reclamo.", campo: "mensaje" },
  send_message_to_mediator: { texto: "Mandar mensaje a Mercado Libre", ayuda: "Para el mediador de ML (en mediación).", campo: "mensaje" },
  refund: { texto: "Devolver el dinero (total)", ayuda: "ML le devuelve al comprador todo lo que pagó y el reclamo se cierra.", confirmar: true },
  partial_refund: { texto: "Devolver parte del dinero", ayuda: "Le ofrecés devolverle un porcentaje y que se quede con el producto.", campo: "porcentaje", confirmar: true },
  allow_partial_refund: { texto: "Devolver parte del dinero", ayuda: "Le ofrecés devolverle un porcentaje y que se quede con el producto.", campo: "porcentaje", confirmar: true },
  allow_return: { texto: "Aceptar la devolución", ayuda: "El comprador manda el producto de vuelta (con la etiqueta de ML) y después se le devuelve la plata.", confirmar: true },
  open_dispute: { texto: "Pedir que intervenga Mercado Libre", ayuda: "Abre la mediación: decide ML.", confirmar: true },
};
/** Las que ML ofrece pero todavía no se hacen desde Laucen (se muestran deshabilitadas). */
export const ACCIONES_PROXIMAMENTE: Record<string, string> = {
  send_attachments: "Mandar archivos",
  send_attachments_to_mediator: "Mandar archivos al mediador",
  add_shipping_evidence: "Cargar prueba del envío",
  send_potential_shipping: "Informar el envío",
  send_tracking_number: "Informar el número de seguimiento",
  allow_return_label: "Generar la etiqueta de devolución",
  recontact: "Volver a contactar",
};
export const textoAccion = (a: string) => ACCIONES_RECLAMO[a]?.texto ?? ACCIONES_PROXIMAMENTE[a] ?? a.replace(/_/g, " ");

export const ETAPAS_ML: Record<string, string> = {
  claim: "Reclamo (entre vos y el comprador)", dispute: "Mediación de Mercado Libre", recontact: "Recontacto", none: "—", stale: "Sin movimiento",
};
export const ESTADOS_DEVOLUCION: Record<string, string> = {
  pending: "Pendiente", label_generated: "Etiqueta generada", shipped: "En camino", delivered: "Entregada a vos",
  not_delivered: "No entregada", cancelled: "Cancelada", expired: "Vencida", failed: "Falló", closed: "Cerrada",
  ready_to_ship: "Lista para despachar", to_be_agreed: "A convenir",
};
const RESOLUCIONES: Record<string, string> = {
  payment_refunded: "Se devolvió el dinero", refunded: "Se devolvió el dinero", partial_refunded: "Se devolvió parte del dinero",
  item_returned: "Se devolvió el producto", returned: "Se devolvió el producto", product_delivered: "El producto se entregó",
  item_changed: "Se cambió el producto", prefered_to_keep_product: "El comprador se quedó con el producto",
  seller_explained_functions: "Le explicaste cómo funciona", already_shipped: "El producto ya estaba enviado",
  opened_by_mistake: "Lo abrió por error", worked_out_with_seller: "Lo arreglaron entre ustedes", warranty: "Garantía",
  coverage_decision: "Lo decidió ML con su cobertura", timeout: "Se venció el plazo", buyer_cancel: "El comprador lo canceló",
};
const BENEFICIADO: Record<string, string> = { complainant: "a favor del comprador", respondent: "a tu favor" };

/** El motivo por el prefijo del reason_id cuando ML no da el detalle. */
export function motivoPorPrefijo(reasonId: string | null | undefined): string | null {
  if (!reasonId) return null;
  if (reasonId.startsWith("PNR")) return "No le llegó el producto";
  if (reasonId.startsWith("PDD")) return "Producto distinto o con fallas";
  if (reasonId.startsWith("CS")) return "Cancelación de la compra";
  return reasonId;
}

// ── De ML a la tabla ───────────────────────────────────────

export type FilaReclamoMl = {
  id_externo: string; orden_externa: string | null; comprador_externo: string | null;
  tipo: "reclamo" | "devolucion" | "cancelacion" | "mediacion" | "cambio";
  motivo_id: string | null; motivo: string | null;
  estado: "abierto" | "resuelto"; etapa: string; estado_externo: string;
  fecha: string; vence_ts: string | null; espera_respuesta: boolean; acciones_disponibles: AccionMl[];
  resolucion: string | null;
  devolucion_id: string | null; devolucion_estado: string | null; devolucion_envio_estado: string | null; devolucion_tracking: string | null;
  ml_actualizado: string;
};

/** Traduce el reclamo de ML (y su devolución, si hay) a la fila de `reclamo`. Puro. */
export function mapearReclamo(c: ReclamoMl, meliUserId: number | null, extra: { devolucion?: DevolucionMl | null; motivo?: string | null } = {}): FilaReclamoMl {
  const vendedor = c.players?.find((p) => meliUserId != null && String(p.user_id) === String(meliUserId))
    ?? c.players?.find((p) => p.role === "respondent" || p.type === "seller");
  const comprador = c.players?.find((p) => p.role === "complainant" || p.type === "buyer");
  const abierto = c.status !== "closed";
  const acciones = abierto ? (vendedor?.available_actions ?? []) : [];
  // Vence: la más próxima de las obligatorias; si no hay, la más próxima de todas.
  const fechas = (xs: AccionMl[]) => xs.map((a) => a.due_date).filter((d): d is string => !!d).sort((a, b) => Date.parse(a) - Date.parse(b));
  const vence = fechas(acciones.filter((a) => a.mandatory))[0] ?? fechas(acciones)[0] ?? null;
  const d = extra.devolucion ?? null;
  const envio = d?.shipments?.find((s) => s.type === "return") ?? d?.shipments?.[0] ?? null;
  const t = c.type ?? "";
  const tipo: FilaReclamoMl["tipo"] = d || /return/.test(t) ? "devolucion"
    : /cancel/.test(t) ? "cancelacion" : t === "change" ? "cambio" : c.stage === "dispute" ? "mediacion" : "reclamo";
  let resolucion: string | null = null;
  if (!abierto && c.resolution) {
    const r = c.resolution.reason ? (RESOLUCIONES[c.resolution.reason] ?? c.resolution.reason.replace(/_/g, " ")) : "Cerrado";
    const b = c.resolution.benefited?.map((x) => BENEFICIADO[x]).filter(Boolean).join(", ");
    resolucion = b ? `${r} (${b})` : r;
  }
  return {
    id_externo: String(c.id),
    orden_externa: c.resource === "order" || c.resource === "purchase" || !c.resource ? String(c.resource_id) : null,
    comprador_externo: comprador ? String(comprador.user_id) : null,
    tipo,
    motivo_id: c.reason_id ?? null,
    motivo: extra.motivo ?? motivoPorPrefijo(c.reason_id),
    estado: abierto ? "abierto" : "resuelto",
    etapa: c.stage ?? "none",
    estado_externo: c.status,
    fecha: c.date_created,
    vence_ts: vence,
    espera_respuesta: abierto && acciones.some((a) => a.mandatory),
    acciones_disponibles: acciones,
    resolucion,
    devolucion_id: d ? String(d.id) : null,
    devolucion_estado: d?.status ?? null,
    devolucion_envio_estado: envio?.status ?? null,
    devolucion_tracking: envio?.tracking_number ?? null,
    ml_actualizado: c.last_updated,
  };
}

const DE_ROL: Record<string, "comprador" | "vendedor" | "ml"> = { complainant: "comprador", respondent: "vendedor", mediator: "ml" };

/** Un mensaje del reclamo en la forma de reclamo_mensaje. Puro. */
export function mapearMensaje(m: MensajeReclamoMl) {
  const fecha = m.date_created ?? m.message_date ?? new Date(0).toISOString();
  const clave = m.hash ?? createHash("sha1").update(`${fecha}|${m.sender_role}|${m.message ?? ""}`).digest("hex");
  return {
    clave, de: DE_ROL[m.sender_role] ?? "ml", para: m.receiver_role ? (DE_ROL[m.receiver_role] ?? m.receiver_role) : null,
    texto: m.message ?? null, adjuntos: m.attachments ?? [], fecha,
  };
}

/** El pedido de Laucen de una orden de ML: el que la tiene como id externo,
 *  el del carrito (pack) que la incluye, o el que tiene una línea de esa orden. */
export async function pedidoDeOrden(org: string, canalId: number | null, orden: string, packId?: string | null): Promise<number | null> {
  const p = await una<{ id: number }>(`
    select p.id::int from pedido p
     where p.organizacion_id = $1 and ($2::bigint is null or p.canal_id = $2)
       and (p.id_externo = $3 or ($4::text is not null and (p.id_externo = $4 or p.envio ->> 'pack_id' = $4))
            or p.datos_externos #> '{ml,ordenes}' ? $3
            or exists (select 1 from pedido_linea l where l.pedido_id = p.id and l.datos_externos #>> '{ml,order_id}' = $3))
     order by (p.id_externo = $3) desc, p.id limit 1`, [org, canalId, orden, packId ?? null]);
  return p?.id ?? null;
}

async function evento(org: string, reclamo: number, tipo: string, detalle: string | null, usuario: string | null = null) {
  await consulta("insert into reclamo_evento (organizacion_id, reclamo_id, tipo, detalle, usuario_id) values ($1, $2, $3, $4, $5)",
    [org, reclamo, tipo, detalle, usuario]);
}

const ETIQUETA_ESTADO: Record<string, string> = { abierto: "Abierto", en_proceso: "En proceso", resuelto: "Cerrado" };

/** Trae un reclamo de ML entero (con sus mensajes, la devolución y lo que
 *  pide el comprador) y lo guarda. Devuelve el id del reclamo en Laucen. */
export async function importarReclamo(cuenta: CuentaMl, claimId: string, leer: Leer = leerDe(cuenta)): Promise<number> {
  const org = cuenta.organizacionId;
  const r = await leer(`/post-purchase/v1/claims/${claimId}`);
  if (r.status !== 200) throw new Error(`reclamo ${claimId}: ${motivoMl(r)}`);
  const c = r.datos as ReclamoMl;
  const antes = await una<{ id: string; estado: string; etapa: string | null; motivo_id: string | null; motivo: string | null; devolucion_estado: string | null; pedido_id: string | null; orden_ml: OrdenMlResumen | null }>(
    "select id, estado, etapa, motivo_id, motivo, devolucion_estado, pedido_id, datos_externos -> 'orden_ml' orden_ml from reclamo where organizacion_id = $1 and origen = 'mercadolibre' and id_externo = $2",
    [org, String(c.id)]);

  const [mens, dev, esperadas] = await Promise.all([
    leer(`/post-purchase/v1/claims/${claimId}/messages`),
    (c.related_entities ?? []).includes("return") || /return/.test(c.type ?? "") ? leer(`/post-purchase/v2/claims/${claimId}/returns`) : Promise.resolve(null),
    leer(`/post-purchase/v1/claims/${claimId}/expected-resolutions`),
  ]);
  const devolucion = dev?.status === 200 && dev.datos && typeof dev.datos === "object" && "id" in (dev.datos as object) ? dev.datos as DevolucionMl : null;
  // El motivo: el detalle de ML una sola vez (si ya lo tenemos para ese reason_id, no se vuelve a pedir).
  let motivo: string | null = antes?.motivo_id === (c.reason_id ?? null) ? antes?.motivo ?? null : null;
  if (!motivo && c.reason_id) {
    const m = await leer(`/post-purchase/v1/claims/reasons/${c.reason_id}`);
    const x = m.status === 200 ? m.datos as { detail?: string; name?: string } : null;
    motivo = x?.detail || x?.name || null;
  }
  const f = mapearReclamo(c, cuenta.meliUserId, { devolucion, motivo });

  const pedidoId = antes?.pedido_id ? Number(antes.pedido_id) : f.orden_externa ? await pedidoDeOrden(org, cuenta.canalId, f.orden_externa) : null;
  const cliente = f.comprador_externo && cuenta.canalId
    ? await una<{ id: number }>("select cliente_id::int id from cliente_identidad where canal_id = $1 and id_externo = $2", [cuenta.canalId, f.comprador_externo])
    : null;
  // El monto: lo que se pagó de esa orden (en un carrito, sólo sus líneas).
  const monto = pedidoId ? await una<{ m: string | null }>(`
    select coalesce(sum(l.cantidad * l.precio_unit_ars) filter (where l.datos_externos #>> '{ml,order_id}' = $2),
                    case when not bool_or(l.datos_externos #>> '{ml,order_id}' = $2) then sum(l.cantidad * l.precio_unit_ars) end) m
      from pedido_linea l where l.pedido_id = $1`, [pedidoId, f.orden_externa ?? ""]) : null;

  // Sin pedido en Laucen (venta anterior, de Virtual Seller): quién compró y qué, directo de la orden de ML.
  const ordenMl = !pedidoId && f.orden_externa
    ? (await traerOrdenMl(leer, f.orden_externa,
        (devolucion?.orders ?? []).filter((x) => x.item_id).map((x) => ({ item_id: x.item_id!, cantidad: Number(x.return_quantity ?? x.total_quantity ?? 1) || 1 })), f.comprador_externo))
      ?? antes?.orden_ml ?? null
    : null;
  const datos = {
    ml: c, devolucion, resoluciones_esperadas: esperadas.status === 200 ? esperadas.datos : null, ...(ordenMl ? { orden_ml: ordenMl } : {}),
  };
  const fila = await una<{ id: string }>(`
    insert into reclamo (organizacion_id, canal_id, origen, id_externo, pedido_id, cliente_id, orden_externa, comprador_externo, tipo, motivo_id, motivo,
                         estado, etapa, estado_externo, fecha, vence_ts, espera_respuesta, acciones_disponibles, resolucion, monto,
                         devolucion_id, devolucion_estado, devolucion_envio_estado, devolucion_tracking, ml_actualizado, datos_externos)
    values ($1, $2, 'mercadolibre', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20, $21, $22, $23, $24, $25::jsonb)
    on conflict (organizacion_id, origen, id_externo) where id_externo is not null do update set
      canal_id = excluded.canal_id, pedido_id = coalesce(reclamo.pedido_id, excluded.pedido_id), cliente_id = coalesce(excluded.cliente_id, reclamo.cliente_id),
      orden_externa = excluded.orden_externa, comprador_externo = excluded.comprador_externo, tipo = excluded.tipo, motivo_id = excluded.motivo_id,
      motivo = excluded.motivo, estado = excluded.estado, etapa = excluded.etapa, estado_externo = excluded.estado_externo, vence_ts = excluded.vence_ts,
      espera_respuesta = excluded.espera_respuesta, acciones_disponibles = excluded.acciones_disponibles, resolucion = excluded.resolucion,
      monto = coalesce(excluded.monto, reclamo.monto), devolucion_id = excluded.devolucion_id, devolucion_estado = excluded.devolucion_estado,
      devolucion_envio_estado = excluded.devolucion_envio_estado, devolucion_tracking = excluded.devolucion_tracking,
      ml_actualizado = excluded.ml_actualizado, datos_externos = excluded.datos_externos, actualizado_ts = now()
    returning id`,
    [org, cuenta.canalId, f.id_externo, pedidoId, cliente?.id ?? null, f.orden_externa, f.comprador_externo, f.tipo, f.motivo_id, f.motivo,
      f.estado, f.etapa, f.estado_externo, f.fecha, f.vence_ts, f.espera_respuesta, JSON.stringify(f.acciones_disponibles), f.resolucion,
      monto?.m != null ? Number(monto.m) : null, f.devolucion_id, f.devolucion_estado, f.devolucion_envio_estado, f.devolucion_tracking,
      f.ml_actualizado, JSON.stringify(datos)]);
  const id = Number(fila!.id);

  // La historia: cuándo entró y qué cambió.
  if (!antes) await evento(org, id, "alta", `Entró de Mercado Libre: ${f.motivo ?? "reclamo"}`);
  else {
    if (antes.estado !== f.estado) await evento(org, id, "estado", `${ETIQUETA_ESTADO[antes.estado] ?? antes.estado} → ${ETIQUETA_ESTADO[f.estado]}${f.resolucion ? ` · ${f.resolucion}` : ""}`);
    if ((antes.etapa ?? "") !== f.etapa) await evento(org, id, "etapa", `${ETAPAS_ML[antes.etapa ?? ""] ?? antes.etapa ?? "—"} → ${ETAPAS_ML[f.etapa] ?? f.etapa}`);
    if ((antes.devolucion_estado ?? "") !== (f.devolucion_estado ?? "") && f.devolucion_estado) {
      await evento(org, id, "devolucion", `Devolución: ${ESTADOS_DEVOLUCION[f.devolucion_estado] ?? f.devolucion_estado}`);
    }
  }

  if (mens.status === 200) {
    const lista = Array.isArray(mens.datos) ? mens.datos as MensajeReclamoMl[] : ((mens.datos as { messages?: MensajeReclamoMl[] })?.messages ?? []);
    for (const m of lista) {
      const x = mapearMensaje(m);
      await consulta(`
        insert into reclamo_mensaje (organizacion_id, reclamo_id, clave, de, para, texto, adjuntos, fecha, datos_externos, usuario_id)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb,
                -- Quién lo mandó desde el panel: la acción de la cola con ese mismo texto.
                case when $4 = 'vendedor' then (
                  select q.usuario_id from ml_cola q where q.organizacion_id = $1 and q.tipo = 'reclamo' and q.item_id = 'reclamo:' || $10
                     and q.estado = 'ok' and q.usuario_id is not null and trim(q.payload #>> '{pedidos,0,cuerpo,message}') = trim($6)
                   order by q.id desc limit 1) end)
        on conflict (reclamo_id, clave) where clave is not null do update set texto = excluded.texto, adjuntos = excluded.adjuntos,
          usuario_id = coalesce(reclamo_mensaje.usuario_id, excluded.usuario_id)`,
        [org, id, x.clave, x.de, x.para, x.texto, JSON.stringify(x.adjuntos), x.fecha, JSON.stringify({ ml: m }), String(c.id)]);
    }
  }
  return id;
}

/** El id del reclamo en un recurso de notificación ("/post-purchase/v1/claims/123/…"). */
export function claimDeRecurso(recurso: string): string | null {
  return recurso.match(/claims\/(\d+)/)?.[1] ?? (/^\d+$/.test(recurso.trim()) ? recurso.trim() : null);
}

/** Desde una notificación "claims" o "claims_actions". */
export async function importarReclamoDeNotificacion(cuenta: CuentaMl, recurso: string) {
  const id = claimDeRecurso(recurso);
  if (!id) throw new Error(`reclamo: el recurso ${recurso} no dice qué reclamo es`);
  await importarReclamo(cuenta, id);
}

/** El barrido de seguridad: los reclamos abiertos (todas las páginas) y los
 *  últimos cerrados. Sólo se vuelve a traer entero el que cambió en ML. Los
 *  que en Laucen siguen abiertos y ML ya no lista como abiertos, también. */
/** Lo que contestó ML, corto, para decir por qué falló. */
function motivoMl(r: RespuestaMl): string {
  const d = r.datos as { message?: string; error?: string } | string | null;
  const txt = typeof d === "string" ? d : d?.message || d?.error || "";
  const que = r.status === 401 ? "la cuenta está desconectada" : r.status === 403 ? "ML no da permiso de reclamos a esta cuenta"
    : r.status === 0 ? "ML no respondió" : `ML contestó ${r.status}`;
  return `${que}${txt ? ` (${String(txt).slice(0, 120)})` : ""}`;
}

export async function barrerReclamos(cuenta: CuentaMl, hastaMs: number, leer: Leer = leerDe(cuenta)): Promise<{ revisados: number; importados: number; errores: string[] }> {
  const org = cuenta.organizacionId;
  const vistos: ReclamoMl[] = [];
  const abiertosMl = new Set<string>();
  for (let offset = 0; offset < 1000; offset += 50) {
    const r = await leer(`/post-purchase/v1/claims/search?status=opened&offset=${offset}&limit=50`);
    if (r.status !== 200) throw new Error(`al buscar los reclamos, ${motivoMl(r)}`);
    const d = r.datos as { data?: ReclamoMl[]; paging?: { total?: number } };
    for (const c of d.data ?? []) { vistos.push(c); abiertosMl.add(String(c.id)); }
    if (!d.data?.length || offset + 50 >= (d.paging?.total ?? 0)) break;
  }
  const cerrados = await leer(`/post-purchase/v1/claims/search?status=closed&offset=0&limit=50`);
  if (cerrados.status === 200) vistos.push(...((cerrados.datos as { data?: ReclamoMl[] }).data ?? []));

  const locales = new Map((await consulta<{ id_externo: string; ml_actualizado: string | null; estado: string }>(
    "select id_externo, ml_actualizado, estado from reclamo where organizacion_id = $1 and origen = 'mercadolibre' and canal_id is not distinct from $2::bigint",
    [org, cuenta.canalId])).map((x) => [x.id_externo, x]));
  const aTraer = new Set<string>();
  // Un cerrado que Laucen no tiene se trae sólo si es reciente: la búsqueda de
  // ML lista también reclamos viejos que ya no deja abrir de a uno (404).
  const desde = Date.now() - 90 * 86_400_000;
  for (const c of vistos) {
    const l = locales.get(String(c.id));
    if (!l && !abiertosMl.has(String(c.id)) && Date.parse(c.last_updated ?? c.date_created) < desde) continue;
    if (!l || l.ml_actualizado !== c.last_updated) aTraer.add(String(c.id));
  }
  for (const [idExt, l] of locales) if (l.estado !== "resuelto" && !abiertosMl.has(idExt)) aTraer.add(idExt);
  // Un reclamo que falla no frena a los demás: se anota y se sigue.
  let importados = 0;
  const errores: string[] = [];
  for (const idExt of aTraer) {
    if (Date.now() > hastaMs) break;
    try {
      await importarReclamo(cuenta, idExt, leer);
      importados++;
    } catch (e) {
      // Uno que Laucen no tiene y ML no deja leer (no existe más o es de otra cuenta) no es un problema: se saltea.
      if (!locales.has(idExt) && /contestó 404|no da permiso/.test((e as Error).message)) continue;
      console.error("[reclamos] importar", cuenta.id, idExt, e);
      errores.push(`${idExt}: ${(e as Error).message}`.slice(0, 200));
    }
  }
  return { revisados: vistos.length, importados, errores };
}

/** "Actualizar" de la ficha: vuelve a leer el reclamo de ML (sólo lectura). */
export async function actualizarReclamo(org: string, reclamoId: number, leer?: Leer): Promise<void> {
  const r = await una<{ canal_id: string | null; id_externo: string | null }>(
    "select canal_id, id_externo from reclamo where id = $1 and organizacion_id = $2 and origen = 'mercadolibre'", [reclamoId, org]);
  if (!r?.id_externo || !r.canal_id) throw new ErrorErp("Ese reclamo no es de Mercado Libre.");
  const cuenta = await cuentaDelCanal(org, Number(r.canal_id));
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("La cuenta de Mercado Libre del canal no está conectada.");
  await importarReclamo(cuenta, r.id_externo, leer);
}

// ── Acciones (siempre un clic de Fer, por la cola) ─────────

export type DatosAccion = { mensaje?: string | null; porcentaje?: number | null };

/** Los pedidos HTTP de una acción sobre un reclamo, y cómo se cuenta. Puro. */
export function armarAccion(accion: string, claimId: string, d: DatosAccion = {}): { pedidos: PedidoMl[]; descripcion: string } {
  const base = `/post-purchase/v1/claims/${claimId}`;
  switch (accion) {
    case "send_message_to_complainant":
    case "send_message_to_mediator": {
      const t = (d.mensaje ?? "").trim();
      if (!t) throw new ErrorErp("Escribí el mensaje.");
      if (t.length > 2000) throw new ErrorErp("El mensaje es muy largo (hasta 2.000 caracteres).");
      const para = accion === "send_message_to_mediator" ? "mediator" : "complainant";
      return {
        pedidos: [{ metodo: "POST", ruta: `${base}/actions/send-message`, cuerpo: { receiver_role: para, message: t } }],
        descripcion: `Mensaje ${para === "mediator" ? "a Mercado Libre" : "al comprador"}: «${t.length > 60 ? `${t.slice(0, 57)}…` : t}»`,
      };
    }
    case "refund":
      return { pedidos: [{ metodo: "POST", ruta: `${base}/expected-resolutions/refund`, cuerpo: {} }], descripcion: "Devolver el dinero (total)" };
    case "partial_refund":
    case "allow_partial_refund": {
      const p = Number(d.porcentaje);
      if (!Number.isFinite(p) || p <= 0 || p >= 100) throw new ErrorErp("Poné qué porcentaje devolver (entre 1 y 99).");
      return {
        pedidos: [{ metodo: "POST", ruta: `${base}/expected-resolutions/partial-refund`, cuerpo: { percentage: Math.round(p) } }],
        descripcion: `Devolver el ${Math.round(p)} % del dinero`,
      };
    }
    case "allow_return":
      return { pedidos: [{ metodo: "POST", ruta: `${base}/expected-resolutions/allow-return`, cuerpo: {} }], descripcion: "Aceptar la devolución" };
    case "open_dispute":
      return { pedidos: [{ metodo: "POST", ruta: `${base}/actions/open-dispute`, cuerpo: {} }], descripcion: "Pedir mediación de Mercado Libre" };
    default:
      throw new ErrorErp(`«${textoAccion(accion)}» todavía no se puede hacer desde Laucen: hacelo desde Mercado Libre.`);
  }
}

/** El clic de Fer en un botón de la ficha: valida que ML ofrezca esa acción
 *  ahora y la mete en la cola (sale enseguida). Dos clics iguales seguidos no
 *  se duplican. Devuelve la descripción. */
export async function encolarAccionReclamo(org: string, reclamoId: number, accion: string, d: DatosAccion, usuario: string | null): Promise<string> {
  const r = await una<{ canal_id: string | null; id_externo: string | null; estado: string; acciones_disponibles: AccionMl[] }>(
    "select canal_id, id_externo, estado, acciones_disponibles from reclamo where id = $1 and organizacion_id = $2 and origen = 'mercadolibre'", [reclamoId, org]);
  if (!r?.id_externo || !r.canal_id) throw new ErrorErp("Ese reclamo no es de Mercado Libre.");
  if (r.estado === "resuelto") throw new ErrorErp("El reclamo ya está cerrado.");
  if (!(r.acciones_disponibles ?? []).some((a) => a.action === accion)) {
    throw new ErrorErp(`Mercado Libre no ofrece «${textoAccion(accion)}» en este reclamo ahora. Tocá «Actualizar» para ver lo que se puede hacer.`);
  }
  const { pedidos, descripcion } = armarAccion(accion, r.id_externo, d);
  const huella = createHash("sha1").update(JSON.stringify(pedidos)).digest("hex").slice(0, 12);
  const res = await encolar(org, [{
    canalId: Number(r.canal_id), itemId: `reclamo:${r.id_externo}`, variationId: `${accion}:${huella}`, tipo: "reclamo",
    payload: { pedidos, descripcion }, efecto: { reclamo: { id: reclamoId, descripcion } }, prioridad: PRIORIDAD.boton,
  }], { origen: "boton", usuarioId: usuario });
  if (res.encoladas === 0 && res.reemplazadas === 0) throw new ErrorErp("Eso ya está en la cola: sale en un momento.");
  // Lo que no es un mensaje se hace una sola vez: el botón se saca hasta que
  // vuelva a leerse el reclamo de ML (el barrido, la notificación o "Actualizar").
  if (!accion.startsWith("send_message")) {
    await consulta(`update reclamo set acciones_disponibles = coalesce((select jsonb_agg(a) from jsonb_array_elements(acciones_disponibles) a
                                                                       where a ->> 'action' <> $3), '[]'::jsonb)
                     where id = $1 and organizacion_id = $2`, [reclamoId, org, accion]);
  }
  await evento(org, reclamoId, "accion", `Mandado a la cola: ${descripcion}`, usuario);
  return descripcion;
}
