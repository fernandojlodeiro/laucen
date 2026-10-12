// Ventas de Mercado Libre para estadística (pedido de Fer, 12/10; tabla ml_venta en db/ml_ventas.sql).
// Dos entradas, las dos SÓLO escriben ml_venta (nunca crean pedidos, ni tocan stock, publicaciones o clientes):
//   · registrarVentas: cada orden nueva que se carga como pedido (lib/mercadolibre/pedidos.ts) deja también
//     su renglón acá, enganchado al pedido.
//   · cargarHistoria: la carga única de los 12 meses que deja leer ML (/orders/search no devuelve nada más
//     viejo), de lo más viejo a lo más nuevo, por ventanas de días y con marca de hasta dónde llegó
//     (ml_venta_carga), así se puede cortar y seguir. La corre el job 'meli-ventas' mientras falte.
// El producto de Laucen se BUSCA (publicación vinculada o SKU), sin vincular nada nuevo.

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentasDe, type CuentaMl } from "@/lib/mercadolibre/api";
import type { OrdenMl } from "@/lib/mercadolibre/pedidos";

type Orden = OrdenMl & { mediations?: unknown[]; date_last_updated?: string };

/** La variación de Laucen de un artículo de ML, sin efectos: la publicación ya vinculada o el SKU. */
async function buscarVariacion(cuenta: CuentaMl, itemId: string, variationId: number | null, sku: string | null, cache: Map<string, number | null>): Promise<number | null> {
  const clave = `${itemId}|${variationId ?? ""}|${sku ?? ""}`;
  if (cache.has(clave)) return cache.get(clave)!;
  const pub = await una<{ variacion_id: string }>(
    "select variacion_id from publicacion where canal_id = $1 and id_externo = $2 and coalesce(variacion_externa, '') = $3 limit 1",
    [cuenta.canalId, itemId, variationId ? String(variationId) : ""]);
  let id: number | null = pub ? Number(pub.variacion_id) : null;
  if (id == null) {
    // Sin la variación exacta: la publicación (si tiene una sola variación vinculada) o el SKU.
    const unica = await una<{ variacion_id: string; n: number }>(
      "select min(variacion_id) variacion_id, count(distinct variacion_id)::int n from publicacion where canal_id = $1 and id_externo = $2", [cuenta.canalId, itemId]);
    if (unica && unica.n === 1) id = Number(unica.variacion_id);
  }
  if (id == null && sku?.trim()) {
    // Las cuentas de DEIROLAB publican con el SKU de Laucen precedido de «DE-».
    const v = await una<{ id: string }>("select id from variacion where organizacion_id = $1 and lower(sku) in (lower($2), lower(regexp_replace($2, '^DE-', '', 'i'))) order by lower(sku) = lower($2) desc limit 1",
      [cuenta.organizacionId, sku.trim()]);
    id = v ? Number(v.id) : null;
  }
  cache.set(clave, id);
  return id;
}

/** Deja (o actualiza) en ml_venta los renglones de unas órdenes ya leídas. */
export async function registrarVentas(cuenta: CuentaMl, ordenes: Orden[], pedidoId: number | null = null, cache = new Map<string, number | null>()): Promise<number> {
  if (!cuenta.canalId) return 0;
  let n = 0;
  for (const o of ordenes) {
    for (const it of o.order_items ?? []) {
      const sku = it.item.seller_sku || it.item.seller_custom_field || null;
      const variacionId = await buscarVariacion(cuenta, it.item.id, it.item.variation_id ?? null, sku, cache);
      const atributos = (it.item.variation_attributes ?? []).map((a) => a.value_name).filter(Boolean).join(" / ");
      await consulta(`
        insert into ml_venta (organizacion_id, canal_id, order_id, pack_id, item_id, variation_id, variacion_id, sku, titulo, cantidad, precio_unit, moneda,
                              comision, tipo_publicacion, estado, fecha, fecha_cierre, comprador_id, comprador, envio_id, tags, reclamo, pedido_id, leido_ts)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, now())
        on conflict (canal_id, order_id, item_id, variation_id) do update set
          pack_id = excluded.pack_id, variacion_id = coalesce(excluded.variacion_id, ml_venta.variacion_id), sku = excluded.sku, titulo = excluded.titulo,
          cantidad = excluded.cantidad, precio_unit = excluded.precio_unit, moneda = excluded.moneda, comision = excluded.comision,
          tipo_publicacion = excluded.tipo_publicacion, estado = excluded.estado, fecha_cierre = excluded.fecha_cierre, comprador = excluded.comprador,
          envio_id = excluded.envio_id, tags = excluded.tags, reclamo = excluded.reclamo,
          pedido_id = coalesce(excluded.pedido_id, ml_venta.pedido_id), leido_ts = now()`,
        [cuenta.organizacionId, cuenta.canalId, o.id, o.pack_id ?? null, it.item.id, it.item.variation_id ? String(it.item.variation_id) : "", variacionId, sku,
          atributos ? `${it.item.title} — ${atributos}` : it.item.title, it.quantity, it.unit_price, o.currency_id ?? "ARS",
          it.sale_fee != null ? Math.round(it.sale_fee * it.quantity * 100) / 100 : null, it.listing_type_id ?? null, o.status, o.date_created,
          o.date_closed ?? null, o.buyer?.id ?? null, o.buyer?.nickname ?? null, o.shipping?.id ?? null, o.tags ?? null,
          Array.isArray(o.mediations) && o.mediations.length > 0, pedidoId]);
      n++;
    }
  }
  return n;
}

/** Engancha con su pedido las ventas que tienen uno (las del corte en adelante). */
export async function engancharPedidos(org: string): Promise<number> {
  const r = await consulta<{ id: string }>(`
    update ml_venta v set pedido_id = x.pedido_id
      from (select distinct on (l.datos_externos #>> '{ml,order_id}', p.canal_id) p.id pedido_id, p.canal_id, (l.datos_externos #>> '{ml,order_id}')::bigint order_id
              from pedido p join pedido_linea l on l.pedido_id = p.id
             where p.organizacion_id = $1 and l.datos_externos #>> '{ml,order_id}' is not null) x
     where v.organizacion_id = $1 and v.pedido_id is null and v.canal_id = x.canal_id and v.order_id = x.order_id
    returning v.id`, [org]);
  return r.length;
}

const DIA = 86400_000;
/** Ventana de lectura: ML corta /orders/search en unos miles de resultados por búsqueda; 7 días alcanzan de sobra. */
const VENTANA_DIAS = 7;

export type InformeCarga = { cuenta: string; leidas: number; desde: string; terminada: boolean; error?: string };

/** Pide la carga de los 12 meses en todas las cuentas activas (no repite lo ya pedido). */
export async function pedirCarga(org: string): Promise<number> {
  const desde = new Date(Date.now() - 365 * DIA + DIA); // ML no da más de un año
  const r = await consulta(`
    insert into ml_venta_carga (organizacion_id, canal_id, desde, hasta)
    select $1, c.canal_id, $2, now() from meli_cuenta c where c.organizacion_id = $1 and c.estado = 'activa' and c.canal_id is not null
    on conflict (organizacion_id, canal_id) do nothing returning canal_id`, [org, desde]);
  return r.length;
}

/** Sigue la carga de los 12 meses hasta `hastaMs`. Devuelve qué hizo en cada cuenta. */
export async function cargarHistoria(org: string, hastaMs: number): Promise<InformeCarga[]> {
  const cuentas = (await cuentasDe(org)).filter((c) => c.estado === "activa" && c.canalId);
  const cargas = await consulta<{ canal_id: string; desde: Date; hasta: Date; leidas: number; terminada_ts: Date | null }>(
    "select canal_id, desde, hasta, leidas, terminada_ts from ml_venta_carga where organizacion_id = $1", [org]);
  const informe: InformeCarga[] = [];
  const cache = new Map<string, number | null>();
  for (const k of cargas) {
    if (k.terminada_ts) continue;
    const cuenta = cuentas.find((c) => c.canalId === Number(k.canal_id));
    if (!cuenta) continue;
    let desde = new Date(k.desde);
    const hasta = new Date(k.hasta);
    let leidas = 0;
    let error: string | undefined;
    while (desde < hasta && Date.now() < hastaMs) {
      const fin = new Date(Math.min(desde.getTime() + VENTANA_DIAS * DIA, hasta.getTime()));
      let completa = true;
      for (let offset = 0; ; offset += 50) {
        if (Date.now() > hastaMs) { completa = false; break; }
        const r = await ml<{ results: Orden[]; paging: { total: number } }>(cuenta, "GET",
          `/orders/search?seller=${cuenta.meliUserId}&order.date_created.from=${encodeURIComponent(desde.toISOString())}&order.date_created.to=${encodeURIComponent(fin.toISOString())}&sort=date_asc&limit=50&offset=${offset}`);
        if (r.status !== 200) { error = `Mercado Libre contestó ${r.status} al leer ventas`; completa = false; break; }
        leidas += await registrarVentas(cuenta, r.datos.results ?? [], null, cache);
        if (offset + 50 >= (r.datos.paging?.total ?? 0)) break;
      }
      if (!completa) break;
      desde = fin;
      await consulta("update ml_venta_carga set desde = $3, leidas = leidas + $4, actualizado_ts = now(), error = null where organizacion_id = $1 and canal_id = $2",
        [org, k.canal_id, desde, leidas]);
      leidas = 0;
    }
    const terminada = desde >= hasta;
    await consulta(`update ml_venta_carga set leidas = leidas + $3, error = $4, actualizado_ts = now(), terminada_ts = case when $5 then now() else null end
                     where organizacion_id = $1 and canal_id = $2`, [org, k.canal_id, leidas, error ?? null, terminada]);
    informe.push({ cuenta: cuenta.nickname ?? String(cuenta.meliUserId), leidas, desde: desde.toISOString(), terminada, error });
    if (error || Date.now() > hastaMs) break;
  }
  if (informe.some((i) => i.terminada)) await engancharPedidos(org);
  return informe;
}
