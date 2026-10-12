// Ofertas relámpago (Fer, 12/10). Mercado Libre invita publicaciones a una «oferta relámpago» (LIGHTNING): un rango de
// precio con descuento y un stock que se reserva; una vez activada no se puede borrar. Laucen ya las lee con las
// campañas de cada publicación (ml_promo_item, tipo LIGHTNING). Acá: cuánto se recibe vendiendo en la oferta (al precio
// más alto que deja el rango) contra lo que se recibe hoy, el piso que pone Fer por producto, y el lote para entrar.
// «Recibís» = lo que paga el comprador − la comisión de ML a ese precio (incluye el cargo fijo; /sites/MLA/listing_prices)
// − lo que cobra ML por el envío gratis (/users/{id}/shipping_options/free; sólo desde el precio de envío gratis).

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { barreraPlanes } from "@/lib/precios-ml/grupos";
import { planDePublicacion, type PlanOClasica } from "@/lib/precios-ml/motor";

/** Lo que queda de una venta: precio − comisión − envío. null si falta un dato. Pura. */
export function recibis(precio: number | null, comision: number | null, envio: number | null): number | null {
  if (precio == null || comision == null || envio == null) return null;
  return Math.round(precio - comision - envio);
}

/** Cuánto más barato que hoy entra a la oferta (Fer, 12/10): el «máximo» que informa ML es sobre el precio publicado
 *  (el tachado), no sobre lo que paga hoy el comprador, y una oferta más cara que hoy no tiene sentido. */
export const BAJA_RELAMPAGO_PCT = 5;

/** El precio con que entra: el más alto del rango, pero nunca más de BAJA_RELAMPAGO_PCT % debajo de lo que paga hoy
 *  el comprador, en pesos enteros (hacia abajo). null si queda debajo del mínimo del rango. Pura. */
export function precioRelampago(max: number | null, hoy: number | null, min: number | null = null): number | null {
  if (max == null || hoy == null) return null;
  const p = Math.floor(Math.min(max, hoy * (1 - BAJA_RELAMPAGO_PCT / 100)));
  return min != null && p < min ? null : p;
}

export type FilaRelampago = {
  canal_id: number; cuenta: string; item_id: string; promocion_id: string; estado: string; producto_id: number; sku: string; titulo: string;
  tipo: string | null; categoria: string | null; stock: number | null; stock_min: number | null; stock_max: number | null;
  desde: string | null; hasta: string | null;
  hoy: number | null; hoy_comision: number | null; hoy_envio: number | null;
  rel: number | null; max: number | null; rel_comision: number | null; rel_envio: number | null; min: number | null; sugerido: number | null; tags: unknown;
  piso: number | null;
};

export type Relampago = FilaRelampago & { plan: PlanOClasica | null; recibisHoy: number | null; recibisRel: number | null; diferencia: number | null; alcanza: boolean | null; conStock: boolean | null };

/** Las propuestas de oferta relámpago de las publicaciones activas (de una cuenta o de todas), con lo que se recibe. */
export async function relampagos(org: string, canal: number | null = null): Promise<Relampago[]> {
  const filas = await consulta<FilaRelampago>(`
    select p.canal_id::int canal_id, c.nombre cuenta, p.item_id, p.promocion_id, p.estado, v.producto_id::int producto_id, v.sku,
           coalesce(m.datos_externos -> 'ml' ->> 'title', '') titulo, m.datos_externos -> 'ml' ->> 'listing_type_id' tipo,
           m.datos_externos -> 'ml' ->> 'category_id' categoria, m.datos_externos -> 'ml' -> 'tags' tags, (m.datos_externos -> 'ml' ->> 'available_quantity')::int stock,
           (p.datos -> 'stock' ->> 'min')::int stock_min, (p.datos -> 'stock' ->> 'max')::int stock_max,
           coalesce(p.datos ->> 'start_date', k.desde::text) desde, coalesce(p.datos ->> 'finish_date', p.hasta::text, k.hasta::text) hasta,
           coalesce(pc.monto, (m.datos_externos -> 'ml' ->> 'price')::numeric)::float8 hoy,
           ch.comision::float8 hoy_comision, ch.envio::float8 hoy_envio,
           floor(least(coalesce(p.max_precio, (p.datos ->> 'max_discounted_price')::numeric), coalesce(pc.monto, (m.datos_externos -> 'ml' ->> 'price')::numeric) * (1 - $3::numeric / 100)))::float8 rel, coalesce(p.max_precio, (p.datos ->> 'max_discounted_price')::numeric)::float8 max,
           cr.comision::float8 rel_comision, cr.envio::float8 rel_envio,
           coalesce(p.min_precio, (p.datos ->> 'min_discounted_price')::numeric)::float8 min, (p.datos ->> 'suggested_discounted_price')::float8 sugerido,
           ps.piso::float8 piso
      from ml_promo_item p
      join canal c on c.id = p.canal_id
      join meli_item m on m.canal_id = p.canal_id and m.item_id = p.item_id and m.estado = 'active'
      join publicacion pu on pu.id = m.publicacion_id join variacion v on v.id = pu.variacion_id
      left join ml_promo_campana k on k.canal_id = p.canal_id and k.promocion_id = p.promocion_id
      left join ml_precio_comprador pc on pc.canal_id = p.canal_id and pc.item_id = p.item_id
      left join ml_relampago_costo ch on ch.canal_id = p.canal_id and ch.item_id = p.item_id and ch.precio = round(coalesce(pc.monto, (m.datos_externos -> 'ml' ->> 'price')::numeric), 2)
      left join ml_relampago_costo cr on cr.canal_id = p.canal_id and cr.item_id = p.item_id and cr.precio = floor(least(coalesce(p.max_precio, (p.datos ->> 'max_discounted_price')::numeric), coalesce(pc.monto, (m.datos_externos -> 'ml' ->> 'price')::numeric) * (1 - $3::numeric / 100)))
      left join ml_relampago_piso ps on ps.organizacion_id = p.organizacion_id and ps.producto_id = v.producto_id
     where p.organizacion_id = $1 and p.tipo = 'LIGHTNING' and p.estado in ('candidate', 'pending', 'started')
       and ($2::bigint is null or p.canal_id = $2)
     order by v.sku, c.nombre`, [org, canal, BAJA_RELAMPAGO_PCT]);
  return filas.map((f) => {
    const recibisHoy = recibis(f.hoy, f.hoy_comision, f.hoy_envio);
    const recibisRel = recibis(f.rel, f.rel_comision, f.rel_envio);
    // Un precio de entrada debajo del mínimo del rango no se puede usar.
    if (f.rel != null && f.min != null && f.rel < f.min) f.rel = null;
    return {
      ...f, plan: planDePublicacion(f.tipo, f.tags), recibisHoy, recibisRel,
      diferencia: recibisHoy != null && recibisRel != null ? recibisRel - recibisHoy : null,
      alcanza: f.piso == null || recibisRel == null ? null : recibisRel >= f.piso,
      conStock: f.stock == null || f.stock_min == null ? null : f.stock >= f.stock_min,
    };
  });
}

/** Cuántas propuestas hay (para la pestaña). */
export async function cuentaRelampagos(org: string, canal: number | null = null): Promise<number> {
  return (await una<{ n: number }>(`
    select count(*)::int n from ml_promo_item p join meli_item m on m.canal_id = p.canal_id and m.item_id = p.item_id and m.estado = 'active'
     where p.organizacion_id = $1 and p.tipo = 'LIGHTNING' and p.estado in ('candidate', 'pending', 'started') and ($2::bigint is null or p.canal_id = $2)`, [org, canal]))?.n ?? 0;
}

/** Lo que cobra ML a ese precio en esa publicación: comisión y envío gratis. */
async function costos(cuenta: CuentaMl, item: string, precio: number, tipo: string, categoria: string, barrera: number): Promise<{ comision: number | null; envio: number | null }> {
  const c = await ml<{ sale_fee_amount?: number } | { sale_fee_amount?: number }[]>(cuenta, "GET",
    `/sites/MLA/listing_prices?price=${precio}&listing_type_id=${encodeURIComponent(tipo)}&category_id=${encodeURIComponent(categoria)}`);
  const d = Array.isArray(c.datos) ? c.datos[0] : c.datos;
  const comision = c.status === 200 && d?.sale_fee_amount != null ? Number(d.sale_fee_amount) : null;
  // Debajo del precio de envío gratis lo paga el comprador.
  if (precio < barrera) return { comision, envio: 0 };
  const e = await ml<{ coverage?: { all_country?: { list_cost?: number } } }>(cuenta, "GET", `/users/${cuenta.meliUserId}/shipping_options/free?item_id=${item}`);
  const envio = e.status === 200 && e.datos?.coverage?.all_country?.list_cost != null ? Number(e.datos.coverage.all_country.list_cost) : null;
  return { comision, envio };
}

/** Lee de ML los costos que faltan (o tienen más de un día) de las propuestas: al precio de hoy y al de la oferta. */
export async function actualizarCostosRelampago(hasta: number): Promise<number> {
  const faltan = await consulta<{ organizacion_id: string; canal_id: number; item_id: string; precio: number; tipo: string; categoria: string }>(`
    select distinct p.organizacion_id, p.canal_id::int canal_id, p.item_id, x.precio::float8 precio,
           m.datos_externos -> 'ml' ->> 'listing_type_id' tipo, m.datos_externos -> 'ml' ->> 'category_id' categoria
      from ml_promo_item p
      join meli_item m on m.canal_id = p.canal_id and m.item_id = p.item_id and m.estado = 'active'
      left join ml_precio_comprador pc on pc.canal_id = p.canal_id and pc.item_id = p.item_id
      cross join lateral (values (round(coalesce(pc.monto, (m.datos_externos -> 'ml' ->> 'price')::numeric), 2)),
                                 (floor(least(coalesce(p.max_precio, (p.datos ->> 'max_discounted_price')::numeric), coalesce(pc.monto, (m.datos_externos -> 'ml' ->> 'price')::numeric) * (1 - $1::numeric / 100))))) x(precio)
      left join ml_relampago_costo k on k.canal_id = p.canal_id and k.item_id = p.item_id and k.precio = x.precio
     where p.tipo = 'LIGHTNING' and p.estado in ('candidate', 'pending', 'started') and x.precio is not null
       and (k.item_id is null or k.leido_ts < now() - interval '1 day' or k.comision is null or k.envio is null)
     limit 400`, [BAJA_RELAMPAGO_PCT]);
  if (!faltan.length) return 0;
  const barrera = await barreraPlanes();
  const cuentas = new Map<number, CuentaMl | null>();
  let n = 0;
  for (const f of faltan) {
    if (Date.now() > hasta) break;
    if (!cuentas.has(f.canal_id)) cuentas.set(f.canal_id, await cuentaDelCanal(f.organizacion_id, f.canal_id));
    const cuenta = cuentas.get(f.canal_id);
    if (!cuenta || cuenta.estado !== "activa" || !f.tipo || !f.categoria) continue;
    const k = await costos(cuenta, f.item_id, f.precio, f.tipo, f.categoria, barrera);
    await consulta(`insert into ml_relampago_costo (canal_id, item_id, precio, comision, envio) values ($1, $2, $3, $4, $5)
                    on conflict (canal_id, item_id, precio) do update set comision = excluded.comision, envio = excluded.envio, leido_ts = now()`,
      [f.canal_id, f.item_id, f.precio, k.comision, k.envio]);
    n++;
  }
  return n;
}

export async function guardarPiso(org: string, producto: number, piso: number | null): Promise<void> {
  if (piso == null) {
    await consulta("delete from ml_relampago_piso where organizacion_id = $1 and producto_id = $2", [org, producto]);
    return;
  }
  await consulta(`insert into ml_relampago_piso (organizacion_id, producto_id, piso) values ($1, $2, $3)
                  on conflict (organizacion_id, producto_id) do update set piso = excluded.piso, actualizado_ts = now()`, [org, producto, piso]);
}

/** «Preparar las que alcanzan el piso»: un lote por cuenta, para el clic de Fer, con las propuestas todavía no aceptadas
 *  que alcanzan el piso y tienen el stock que piden. Entra al precio más alto del rango y con el stock mínimo. */
export async function prepararRelampagos(org: string, usuario: string, canal: number | null): Promise<{ lotes: number[]; filas: number }> {
  const filas = (await relampagos(org, canal)).filter((f) => f.estado === "candidate" && f.alcanza === true && f.conStock !== false && f.rel != null && f.stock_min != null);
  const yaPedidas = new Set((await consulta<{ item_id: string }>(
    "select item_id from ml_cola where organizacion_id = $1 and item_id like 'relampago:%' and estado in ('preparado', 'pendiente', 'enviando', 'ok') and creado_ts > now() - interval '7 days'", [org]))
    .map((x) => x.item_id));
  const porCanal = new Map<number, Relampago[]>();
  for (const f of filas) if (!yaPedidas.has(`relampago:${f.item_id}`)) porCanal.set(f.canal_id, [...(porCanal.get(f.canal_id) ?? []), f]);
  const lotes: number[] = [];
  for (const [c, fs] of porCanal) {
    const cambios: CambioMl[] = fs.map((f) => ({
      canalId: c, itemId: `relampago:${f.item_id}`, tipo: "campana", antes: { estado: "candidata a oferta relámpago" },
      payload: {
        descripcion: `Entrar a la oferta relámpago: ${f.item_id} (${f.sku}) a $ ${f.rel!.toLocaleString("es-AR")} con ${f.stock_min} u.; recibís $ ${(f.recibisRel ?? 0).toLocaleString("es-AR")} (hoy $ ${(f.recibisHoy ?? 0).toLocaleString("es-AR")})`,
        pedidos: [{ metodo: "POST", ruta: `/seller-promotions/items/${f.item_id}?app_version=v2`,
          cuerpo: { deal_price: f.rel, stock: f.stock_min, promotion_type: "LIGHTNING" } }],
      },
    }));
    lotes.push(await encolarLoteConBoton(org, c, cambios, `Ofertas relámpago: ${fs.length} publicaci${fs.length === 1 ? "ón" : "ones"} en ${fs[0].cuenta}`, usuario));
  }
  return { lotes, filas: [...porCanal.values()].reduce((s, x) => s + x.length, 0) };
}
