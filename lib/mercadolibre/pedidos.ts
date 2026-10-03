// Pedidos de Mercado Libre → pedidos de Laucen (orden de la sesión 2).
// Entra por la notificación orders_v2 (o el barrido de seguridad): se lee la
// orden, sus datos de facturación y su envío, y se carga con crearPedido
// (crea o enlaza el cliente, no duplica). El estado se lleva con
// cambiarEstado según lo que diga ML: pagada → pagado (reserva stock),
// despachada → despachado (la reserva pasa a venta), entregada → entregado,
// cancelada → cancelado (libera). Preparación la marca el depósito (sesión 4).
// Un carrito de ML (varias órdenes con el mismo pack_id, un solo envío) es UN
// pedido con todas sus líneas (cargarOrdenes); los pedidos partidos que
// quedaron de antes los une lib/mercadolibre/carritos.ts (botón en /admin/meli).

import { consulta, una, enTransaccion } from "@/lib/erp/base";
import { crearPedido, cambiarEstado, agregarLineas, quitarLineas, type ClienteEntrada, type EstadoPedido, type DireccionEntrada, type LineaEntrada } from "@/lib/pedidos";
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
export type Facturacion = { billing_info?: { doc_type?: string; doc_number?: string; additional_info?: { type: string; value: string }[] } };

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

const ORDEN_ESTADOS: EstadoPedido[] = ["nuevo", "pagado", "en_preparacion", "preparado", "despachado", "entregado"];

const cancelada = (o: OrdenMl) => o.status === "cancelled" || o.status === "invalid";
const pagada = (o: OrdenMl) => o.status === "paid" || o.status === "partially_paid" || o.status === "partially_refunded";
const comisionDe = (ordenes: OrdenMl[]) => ordenes.reduce((s, o) => s + (o.order_items ?? []).reduce((t, it) => t + (it.sale_fee ?? 0), 0), 0);

/** El estado del carrito entero (un pack de ML son varias órdenes, una por
 *  artículo, con un solo envío): cancelado sólo si se cancelaron todas;
 *  despachado / entregado según el envío; pagado cuando están pagas todas
 *  las que siguen en pie. */
export function estadoDelCarrito(ordenes: OrdenMl[], envio: EnvioMl | null): EstadoPedido | null {
  const vivas = ordenes.filter((o) => !cancelada(o));
  if (!vivas.length) return ordenes.length ? "cancelado" : null;
  if (envio?.estado === "delivered") return "entregado";
  if (envio?.estado === "shipped") return "despachado";
  if (vivas.every(pagada)) return "pagado";
  return null; // payment_required / payment_in_process: sigue 'nuevo'
}

/** Trae una orden de ML y la deja en Laucen (crea o actualiza). Si la orden
 *  es parte de un carrito (pack_id), trae el carrito entero (/packs) y todo
 *  queda en UN pedido. Devuelve el id del pedido. */
export async function importarOrden(cuenta: CuentaMl, orderId: number | string): Promise<number | null> {
  if (!cuenta.canalId) return null;
  const r = await ml<OrdenMl>(cuenta, "GET", `/orders/${orderId}`);
  if (r.status !== 200) throw new Error(`orden ${orderId}: ML contestó ${r.status}`);
  const o = r.datos;
  const ordenes = [o];
  if (o.pack_id) {
    // Las otras órdenes del carrito. Si ML no da el pack, sigue con ésta: las
    // demás se suman al mismo pedido cuando llegue su notificación.
    const pack = await ml<{ orders?: { id: number }[] }>(cuenta, "GET", `/packs/${o.pack_id}`);
    if (pack.status === 200) {
      for (const { id } of pack.datos.orders ?? []) {
        if (String(id) === String(o.id)) continue;
        const otra = await ml<OrdenMl>(cuenta, "GET", `/orders/${id}`);
        if (otra.status === 200) ordenes.push(otra.datos);
      }
    }
  }
  const fact = await ml<Facturacion>(cuenta, "GET", `/orders/${o.id}/billing_info`);
  const facturacion = fact.status === 200 ? fact.datos : {};
  const envioId = ordenes.find((x) => x.shipping?.id)?.shipping?.id;
  const envio = envioId ? await leerEnvio(cuenta, envioId) : null;
  return cargarOrdenes(cuenta, ordenes, facturacion, envio);
}

type PedidoDelCarrito = { id: number; id_externo: string | null; estado: EstadoPedido; ordenes: Record<string, OrdenMl> };

/** Deja en Laucen las órdenes ya leídas de ML (todas del mismo carrito, o una
 *  sola sin carrito). Sin llamar a ML: lo usan importarOrden y los tests.
 *  - Sin carrito: un pedido por orden, como siempre (id_externo = la orden).
 *  - Carrito: UN pedido (id_externo = el pack_id) con las líneas de todas las
 *    órdenes; cada línea guarda su orden de ML. Si una orden del carrito llega
 *    después, sus líneas se SUMAN a ese pedido (con su reserva de stock si ya
 *    estaba pagado). Si se cancela una orden y las otras siguen, sus líneas
 *    salen del pedido (y se libera su reserva); si se cancelan todas, el
 *    pedido queda cancelado.
 *  Repetirlo no duplica nada. Devuelve el id del pedido. */
export async function cargarOrdenes(cuenta: CuentaMl, ordenesLeidas: OrdenMl[], facturacion: Facturacion, envio: EnvioMl | null): Promise<number | null> {
  if (!cuenta.canalId || !ordenesLeidas.length) return null;
  const canalId = cuenta.canalId;
  const org = cuenta.organizacionId;
  const ordenes = [...ordenesLeidas].sort((a, b) => a.id - b.id);
  const packId = ordenes.find((o) => o.pack_id)?.pack_id ?? null;
  const clave = packId ? String(packId) : String(ordenes[0].id);
  const primera = ordenes[0];

  // El depósito: Full sale del depósito Full del canal; el resto, del que el
  // canal tenga primero (lo decide cambiarEstado si queda vacío).
  let depositoId: number | null = null;
  if (envio?.logistica === "fulfillment") {
    const d = await una<{ id: string }>(`
      select d.id from canal_deposito cd join deposito d on d.id = cd.deposito_id
       where cd.canal_id = $1 and d.tipo = 'full_ml' and d.estado = 'activo' order by cd.prioridad limit 1`, [canalId]);
    depositoId = d ? Number(d.id) : null;
  }

  // Las líneas de cada orden (la variación se busca antes de la transacción).
  const lineasDe = new Map<number, LineaEntrada[]>();
  for (const o of ordenes) {
    const lineas: LineaEntrada[] = [];
    for (const it of o.order_items) {
      const sku = it.item.seller_sku || it.item.seller_custom_field || null;
      const variacionId = await variacionDeItem(cuenta, it.item.id, it.item.variation_id, sku, it.item.title);
      const atributos = (it.item.variation_attributes ?? []).map((a) => a.value_name).filter(Boolean).join(" / ");
      lineas.push({
        variacion_id: variacionId, sku: variacionId ? null : (sku ?? it.item.id), cantidad: it.quantity,
        precio_unitario: it.unit_price, titulo: atributos ? `${it.item.title} — ${atributos}` : it.item.title,
        datos_externos: { ml: { order_id: String(o.id), item_id: it.item.id, variation_id: it.item.variation_id ?? null, sale_fee: it.sale_fee ?? null, listing_type_id: it.listing_type_id ?? null } },
      });
    }
    lineasDe.set(o.id, lineas);
  }
  const porId = (ords: OrdenMl[]) => Object.fromEntries(ords.map((o) => [String(o.id), o]));

  const { pedidoId, todas } = await enTransaccion(async (c) => {
    // Dos notificaciones del mismo carrito no se pisan: una espera a la otra.
    await c.query("select pg_advisory_xact_lock(hashtext($1))", [`ml-pack:${canalId}:${clave}`]);
    const existentes = (await c.query<{ id: string; id_externo: string | null; estado: EstadoPedido; ordenes: Record<string, OrdenMl> | null; orden: OrdenMl | null }>(`
      select id, id_externo, estado, datos_externos #> '{ml,ordenes}' ordenes, datos_externos #> '{ml,orden}' orden from pedido
       where organizacion_id = $1 and canal_id = $2 and (id_externo = any($3::text[]) or ($4::text is not null and envio ->> 'pack_id' = $4))
       order by id`, [org, canalId, [clave, ...ordenes.map((o) => String(o.id))], packId ? String(packId) : null])).rows
      .map((p): PedidoDelCarrito => ({
        id: Number(p.id), id_externo: p.id_externo, estado: p.estado,
        ordenes: { ...(p.orden ? { [String(p.orden.id)]: p.orden } : {}), ...(p.ordenes ?? {}) },
      }));
    const vivas = ordenes.filter((o) => !cancelada(o));

    if (!existentes.length) {
      // Pedido nuevo con todas las órdenes que siguen en pie (si se cancelaron
      // todas, con todas: nace y se cancela).
      const entran = vivas.length ? vivas : ordenes;
      const todasAhora = ordenes;
      const creado = await crearPedido(org, {
        canalId,
        id_externo: clave,
        fecha: primera.date_created,
        moneda: primera.currency_id === "USD" ? "USD" : "ARS",
        cliente: clienteDeOrden(primera, facturacion, envio),
        lineas: entran.flatMap((o) => lineasDe.get(o.id) ?? []),
        medio_pago: medioDelCarrito(entran),
        estado_pago: vivas.length && vivas.every((o) => o.status === "paid") ? "pagado" : "pendiente",
        deposito_id: depositoId,
        envio: envio ? { envio_id: envio.idExterno, logistica: envio.logistica, pack_id: packId } : { pack_id: packId, sin_envio: true },
        permitir_sin_vincular: true,
        datos_externos: { ml: { orden: primera, ordenes: porId(todasAhora), pack_id: packId, facturacion: facturacion.billing_info ?? null } },
        comision_ars: comisionDe(vivas) || null,
      }, "sistema", c);
      return { pedidoId: creado.pedidoId, todas: todasAhora };
    }

    // Ya hay pedido para este carrito: el principal es el del pack; si no, el
    // primero que siga en pie. (Si quedaron pedidos partidos de antes, los une
    // el botón "Unir carritos de Mercado Libre".)
    const principal = existentes.find((p) => p.id_externo === clave)
      ?? existentes.find((p) => p.estado !== "cancelado" && p.estado !== "devuelto") ?? existentes[0];
    // Qué orden está en qué pedido: por la orden guardada en cada línea; las
    // líneas viejas (sin orden) son de la orden del id_externo de su pedido.
    const enLineas = (await c.query<{ pedido_id: string; orden: string | null; id: string }>(`
      select l.pedido_id, coalesce(l.datos_externos #>> '{ml,order_id}', case when p.id_externo <> $2 then p.id_externo end) orden, l.id
        from pedido_linea l join pedido p on p.id = l.pedido_id where l.pedido_id = any($1::bigint[])`,
      [existentes.map((p) => p.id), clave])).rows;
    const presentes = new Set(enLineas.map((l) => l.orden).filter(Boolean) as string[]);

    // Lo que ya sabíamos de cada orden + lo que acaba de llegar.
    const conocidas: Record<string, OrdenMl> = { ...principal.ordenes, ...porId(ordenes) };
    const todas = Object.values(conocidas);
    const vivasTodas = todas.filter((o) => !cancelada(o));

    const abierto = principal.estado !== "cancelado" && principal.estado !== "devuelto";
    if (abierto) {
      // Órdenes nuevas del carrito → sus líneas se suman al pedido.
      const nuevas = vivas.filter((o) => !presentes.has(String(o.id)));
      if (nuevas.length) {
        const facturado = (await c.query("select 1 from comprobante where pedido_id = $1 and estado = 'autorizado' and tipo_cbte in (1, 6, 11)", [principal.id])).rowCount;
        await agregarLineas(org, principal.id, nuevas.flatMap((o) => lineasDe.get(o.id) ?? []), "sistema", c, {
          permitir_sin_vincular: true,
          nota: `Mercado Libre: se sumó al carrito la orden ${nuevas.map((o) => o.id).join(", ")}${facturado ? " (el pedido ya estaba facturado: revisar la factura)" : ""}`,
        });
      }
      // Órdenes canceladas mientras otras siguen → sus líneas salen del pedido.
      if (vivasTodas.length && !["despachado", "entregado"].includes(principal.estado)) {
        const canceladas = new Set(ordenes.filter(cancelada).map((o) => String(o.id)));
        const sacar = enLineas.filter((l) => Number(l.pedido_id) === principal.id && l.orden && canceladas.has(l.orden)).map((l) => Number(l.id));
        if (sacar.length) {
          await quitarLineas(org, principal.id, sacar, "sistema", c,
            `Mercado Libre: se canceló la orden ${[...canceladas].filter((x) => enLineas.some((l) => l.orden === x)).join(", ")} del carrito`);
        }
      }
    }
    // Lo que ML puede haber cambiado: el dato crudo de todas las órdenes, la
    // comisión, el pago (pagado cuando están pagas todas las que siguen) y el envío.
    await c.query(`
      update pedido set datos_externos = datos_externos || jsonb_build_object('ml', coalesce(datos_externos -> 'ml', '{}') || $3::jsonb),
             comision_ars = coalesce($4, comision_ars),
             estado_pago = case when $5 and estado_pago = 'pendiente' then 'pagado' else estado_pago end,
             medio_pago = coalesce(medio_pago, $6),
             envio = case when $7::jsonb is not null and not (envio ? 'envio_id') then envio || $7::jsonb else envio end
       where id = $1 and organizacion_id = $2`,
      [principal.id, org, JSON.stringify({ ordenes: conocidas, pack_id: packId, ...(facturacion.billing_info ? { facturacion: facturacion.billing_info } : {}) }),
        comisionDe(vivasTodas) || null, vivasTodas.length > 0 && vivasTodas.every((o) => o.status === "paid"), medioDelCarrito(vivasTodas),
        envio ? JSON.stringify({ envio_id: envio.idExterno, logistica: envio.logistica, pack_id: packId }) : null]);
    return { pedidoId: principal.id, todas };
  });

  if (envio) await guardarEnvio(org, canalId, pedidoId, envio);
  await llevarEstado(org, pedidoId, estadoDelCarrito(todas, envio));
  return pedidoId;
}

/** El medio de pago del carrito (el de la primera orden que tenga pago). */
function medioDelCarrito(ordenes: OrdenMl[]): string | null {
  const pago = ordenes.flatMap((o) => o.payments ?? [])[0];
  return pago ? medioDePago(pago) : null;
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
