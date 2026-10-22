// Ofertas relámpago (Fer, 12/10). Mercado Libre invita publicaciones a una «oferta relámpago» (LIGHTNING): un rango de
// precio con descuento y un stock que se reserva; una vez activada no se puede borrar. Laucen ya las lee con las
// campañas de cada publicación (ml_promo_item, tipo LIGHTNING). Acá: cuánto se recibe vendiendo en la oferta (al precio
// de hoy si entra en el rango; Fer lo puede cambiar) contra lo que se recibe hoy, el piso que pone Fer por producto, y el lote para entrar.
// «Recibís» = lo que paga el comprador − la comisión de ML a ese precio (incluye el cargo fijo; /sites/MLA/listing_prices)
// − lo que cobra ML por el envío gratis (/users/{id}/shipping_options/free; sólo desde el precio de envío gratis).

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolar, encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { ErrorErp } from "@/lib/erp/base";
import { barreraPlanes, gruposPlanes, grupoDeLugar } from "@/lib/precios-ml/grupos";
import { cadenaFamilias, comisionesDe, esPlan, planDePublicacion, precioPlan, type PlanOClasica } from "@/lib/precios-ml/motor";
import { comisionesMl, familiasDe } from "@/lib/precios-ml/datos";

/** Lo que queda de una venta: precio − comisión − envío. null si falta un dato. Pura. */
export function recibis(precio: number | null, comision: number | null, envio: number | null): number | null {
  if (precio == null || comision == null || envio == null) return null;
  return Math.round(precio - comision - envio);
}

/** El precio con que entra (Fer, 13/10): un peso debajo de lo que paga hoy el comprador (sin pasar el más alto del rango).
 *  Hay publicaciones donde ML lo acepta así (la notebook MLA1706473983 y las del G3-3500, 12/10) y otras donde lo rechaza
 *  por «no creíble» (ERROR_CREDIBILITY_DISCOUNTED_PRICE) y sólo acepta el precio que propone para la relámpago (el «price»
 *  de la propuesta, ≈ 5 % debajo): `propuestoMl` va sólo después de ese rechazo. En pesos enteros (hacia abajo). Fer lo
 *  puede cambiar a mano en la fila (`elegido`). null si queda fuera del rango. Pura. */
export function precioRelampago(max: number | null, hoy: number | null, min: number | null = null, elegido: number | null = null, propuestoMl: number | null = null): number | null {
  if (elegido != null) return (min != null && elegido < min) || (max != null && elegido > max) ? null : elegido;
  if (max == null || hoy == null) return null;
  const p = Math.min(Math.floor(max), Math.ceil(hoy) - 1, propuestoMl != null && propuestoMl > 0 ? Math.floor(propuestoMl) : Infinity);
  return min != null && p < min ? null : p;
}

/** Cuánto se lleva Mercado Libre (y el descuento, en la oferta) de lo que paga hoy el comprador, en %: hoy = comisión +
 *  envío; en la relámpago = lo que deja de entrar contra el precio de hoy. Un decimal. Pura. */
export function costoPct(hoy: number | null, recibe: number | null): number | null {
  if (hoy == null || recibe == null || hoy <= 0) return null;
  return Math.round(((hoy - recibe) / hoy) * 1000) / 10;
}

/** Lo que dice ML de una fecha («2026-10-15T12:00:00», a veces con zona) en hora argentina: «15/10 12:00». Pura. */
export function fechaRelampago(t: string | null): string | null {
  if (!t) return null;
  const sinZona = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t);
  if (sinZona && !/(Z|[+-]\d{2}:?\d{2})$/.test(t)) return `${sinZona[3]}/${sinZona[2]} ${sinZona[4]}:${sinZona[5]}`;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  const x = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const v = (k: string) => x.find((y) => y.type === k)?.value ?? "";
  return `${v("day")}/${v("month")} ${v("hour")}:${v("minute")}`;
}

export type FilaRelampago = {
  canal_id: number; cuenta: string; item_id: string; promocion_id: string; estado: string; producto_id: number; sku: string; titulo: string;
  tipo: string | null; categoria: string | null; stock: number | null; stock_min: number | null; stock_max: number | null;
  desde: string | null; hasta: string | null;
  hoy: number | null; hoy_comision: number | null; hoy_envio: number | null;
  rel: number | null; max: number | null; rel_comision: number | null; rel_envio: number | null; min: number | null; sugerido: number | null; tags: unknown;
  piso: number | null; elegido: number | null; elegido_stock: number | null; restante: number | null;
  /** La Clásica de la lista de precios del canal (Fer, 20/10): la base contra la que se mide cuánto baja una relámpago,
   *  en cualquier publicación y plan (no lo que paga hoy el comprador, que en un plan de cuotas o en la cuenta que no gana
   *  va inflado). */
  clasica: number | null;
  familia_id: number | null;
  /** Lo que pone Mercado Libre de su bolsillo en la campaña con que se vende hoy (ej. «Potencia tus ventas»: meli_percentage
   *  sobre el precio publicado). Entra a lo que se recibe hoy; en la relámpago no lo pone. */
  aporte: number | null;
  /** Qué oferta es (Fer, 21/10): LIGHTNING (relámpago), SMART_LIGHTNING (relámpago compartida) o SMART (oferta compartida:
   *  «Potencia tus ventas», «Tec Week»…). En las compartidas el precio lo pone ML y el descuento se reparte: el vendedor
   *  pone pct_vendedor y ML pct_meli, sobre `original` (el precio publicado). */
  tipo_promo: string; nombre_promo: string | null; ref_id: string | null;
  pct_vendedor: number | null; pct_meli: number | null; original: number | null;
};

/** Las ofertas que maneja esta pantalla. */
export const TIPOS_OFERTA = ["LIGHTNING", "SMART_LIGHTNING", "SMART"] as const;
/** Oferta compartida: el precio lo pone ML y pone parte del descuento. */
export const esCompartida = (tipo: string | null | undefined) => tipo === "SMART" || tipo === "SMART_LIGHTNING";
/** Las que son relámpago (una por producto): la común y la compartida. */
export const esRelampago = (tipo: string | null | undefined) => tipo === "LIGHTNING" || tipo === "SMART_LIGHTNING";
/** La fila de la cola para entrar: una relámpago común por publicación, y una compartida por publicación y campaña. */
export const claveCola = (f: Pick<FilaRelampago, "item_id" | "tipo_promo" | "promocion_id">) =>
  f.tipo_promo === "LIGHTNING" ? `relampago:${f.item_id}` : `compartida:${f.promocion_id}:${f.item_id}`;

export type Relampago = FilaRelampago & {
  plan: PlanOClasica | null; recibisHoy: number | null; recibisRel: number | null; diferencia: number | null; alcanza: boolean | null; conStock: boolean | null;
  /** Con cuántas unidades entra: las que eligió Fer en la fila, si no el mínimo que pide; en una aceptada, las que le quedan. */
  stockEntrar: number | null;
  /** El precio del esquema para esta publicación (Fer, 20/10): en una Clásica, la Clásica de la lista; en un plan de cuotas,
   *  el que sale de esa Clásica con la comisión del plan y el % extra del grupo (sin el % de la cuenta que no gana). Es la
   *  base contra la que se mide cuánto baja la relámpago. Sin Clásica en la lista, null. */
  base: number | null;
  /** Lo que de verdad pone el vendedor por venta: en una relámpago, el precio de entrada; en una compartida, el precio
   *  publicado menos la parte del descuento que pone el vendedor (la de ML no sale de su bolsillo). */
  efectivo: number | null;
  /** Lo que pone ML por venta en una compartida (precio publicado × pct_meli). */
  aporteRel: number;
  /** Cuánto más barato que `base` entra lo que pone el vendedor (`efectivo`), en % con un decimal (negativo = más caro). */
  bajaPct: number | null;
  costoHoyPct: number | null; costoRelPct: number | null;
};

// El precio de hoy, el más alto del rango y el de entrada (el elegido a mano; si no, el de hoy topeado por el rango; en una
// ya aceptada, el de la oferta). Los usan la pantalla y la lectura de costos.
const PRECIOS_SQL = `
      left join ml_precio_comprador pc on pc.canal_id = p.canal_id and pc.item_id = p.item_id
      left join ml_relampago_precio rp on rp.canal_id = p.canal_id and rp.item_id = p.item_id
      -- El último pedido para entrar: si ML lo rechazó por «no creíble», se baja al precio que propone (≈ 5 % debajo).
      left join lateral (select (q.payload -> 'pedidos' -> 0 -> 'cuerpo' ->> 'deal_price')::numeric precio
                           from ml_cola q where q.canal_id = p.canal_id and q.item_id = 'relampago:' || p.item_id
                            and q.estado = 'error' and q.ultimo_error ilike '%CREDIBILITY%' order by q.id desc limit 1) rz on true
      cross join lateral (select coalesce(pc.monto, (m.datos_externos -> 'ml' ->> 'price')::numeric) hoy,
                                 coalesce(p.max_precio, (p.datos ->> 'max_discounted_price')::numeric) max) x
      cross join lateral (select case when (p.estado <> 'candidate' or p.tipo <> 'LIGHTNING') and p.datos ->> 'price' is not null then round((p.datos ->> 'price')::numeric, 2)
                                      else round(coalesce(rp.precio, least(floor(x.max), ceil(x.hoy) - 1,
                                        case when rz.precio is not null then floor(nullif((p.datos ->> 'price')::numeric, 0)) end)), 2) end rel) y`;

/** Las propuestas de oferta relámpago de las publicaciones activas (de una cuenta o de todas), con lo que se recibe. */
export async function relampagos(org: string, canal: number | null = null): Promise<Relampago[]> {
  const filas = await consulta<FilaRelampago>(`
    select p.canal_id::int canal_id, c.nombre cuenta, p.item_id, p.promocion_id, p.estado, v.producto_id::int producto_id, v.sku,
           coalesce(m.datos_externos -> 'ml' ->> 'title', '') titulo, m.datos_externos -> 'ml' ->> 'listing_type_id' tipo,
           m.datos_externos -> 'ml' ->> 'category_id' categoria, m.datos_externos -> 'ml' -> 'tags' tags, (m.datos_externos -> 'ml' ->> 'available_quantity')::int stock,
           (p.datos -> 'stock' ->> 'min')::int stock_min, (p.datos -> 'stock' ->> 'max')::int stock_max,
           coalesce(fe.desde, p.datos ->> 'start_date', k.desde::text) desde, coalesce(fe.hasta, p.datos ->> 'finish_date', p.hasta::text, k.hasta::text) hasta,
           x.hoy::float8 hoy, ch.comision::float8 hoy_comision, ch.envio::float8 hoy_envio,
           y.rel::float8 rel, x.max::float8 max, cr.comision::float8 rel_comision, cr.envio::float8 rel_envio,
           coalesce(p.min_precio, (p.datos ->> 'min_discounted_price')::numeric)::float8 min, (p.datos ->> 'suggested_discounted_price')::float8 sugerido,
           ps.piso::float8 piso, rp.precio::float8 elegido, cl.lista_ars::float8 clasica, pr.familia_id::int familia_id,
           (select max((d.datos ->> 'original_price')::numeric * (d.datos ->> 'meli_percentage')::numeric / 100)
              from ml_promo_item d where d.canal_id = p.canal_id and d.item_id = p.item_id and d.estado = 'started'
               and (d.datos ->> 'meli_percentage')::numeric > 0 and round((d.datos ->> 'price')::numeric) = round(x.hoy))::float8 aporte, rp.stock elegido_stock, (p.datos -> 'stock' ->> 'remaining_stock')::int restante,
           p.tipo tipo_promo, coalesce(nullif(p.nombre, ''), k.nombre) nombre_promo, p.datos ->> 'ref_id' ref_id,
           (p.datos ->> 'seller_percentage')::float8 pct_vendedor, (p.datos ->> 'meli_percentage')::float8 pct_meli,
           (p.datos ->> 'original_price')::float8 original
      from ml_promo_item p
      join canal c on c.id = p.canal_id
      join meli_item m on m.canal_id = p.canal_id and m.item_id = p.item_id and m.estado = 'active'
      join publicacion pu on pu.id = m.publicacion_id join variacion v on v.id = pu.variacion_id join producto pr on pr.id = v.producto_id
      left join ml_promo_campana k on k.canal_id = p.canal_id and k.promocion_id = p.promocion_id
      left join ml_relampago_fecha fe on fe.canal_id = p.canal_id and fe.item_id = p.item_id and p.estado <> 'candidate'
      ${PRECIOS_SQL}
      left join ml_relampago_costo ch on ch.canal_id = p.canal_id and ch.item_id = p.item_id and ch.precio = round(x.hoy, 2)
      left join ml_relampago_costo cr on cr.canal_id = p.canal_id and cr.item_id = p.item_id and cr.precio = y.rel
      left join ml_relampago_piso ps on ps.organizacion_id = p.organizacion_id and ps.producto_id = v.producto_id
      -- La Clásica de la lista del canal (la del canal; si no tiene, la por defecto o «Clásicas»), como en lib/precios-ml/datos.ts (canalesMl).
      left join lateral (select lista_ars from precio_de(p.organizacion_id, pu.variacion_id,
                           coalesce(c.lista_precios_id, (select l.id from lista_precios l where l.organizacion_id = c.organizacion_id
                                                            and (l.por_defecto or lower(l.nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica')) order by l.por_defecto desc, l.id limit 1)),
                           (now() at time zone 'America/Argentina/Buenos_Aires')::date)) cl on true
     where p.organizacion_id = $1 and p.tipo = any($3::text[]) and p.estado in ('candidate', 'pending', 'started')
       and ($2::bigint is null or p.canal_id = $2)
     order by v.sku, c.nombre, p.tipo, p.promocion_id`, [org, canal, TIPOS_OFERTA]);
  const [com, familias, grupos] = filas.length ? await Promise.all([comisionesMl(), familiasDe(org), gruposPlanes(org)]) : [null, null, null];
  return filas.map((f) => {
    const plan = planDePublicacion(f.tipo, f.tags);
    let base: number | null = null;
    if (f.clasica != null && f.clasica > 0 && plan === "clasica") base = f.clasica;
    else if (f.clasica != null && f.clasica > 0 && esPlan(plan)) {
      // Como el motor (lib/precios-ml/motor.ts, proponer): Clásica × (1 − comisión Clásica) ÷ (1 − comisión del plan) ×
      // (1 + % extra del plan en el grupo del producto), con la comisión real de la categoría de la publicación.
      const c = comisionesDe(f.categoria ? com!.porCategoria.get(f.categoria) : null, com!.general).valores;
      const g = grupoDeLugar(grupos!, cadenaFamilias(f.familia_id, familias!.padres));
      const p = precioPlan(f.clasica, c.clasica, c[plan], g?.planes[plan]?.margenPct ?? 0);
      base = Number.isFinite(p) && p > 0 ? p : null;
    }
    const sinAporte = recibis(f.hoy, f.hoy_comision, f.hoy_envio);
    const recibisHoy = sinAporte == null ? null : Math.round(sinAporte + (f.aporte ?? 0));
    // Compartida: ML pone su parte del descuento (sobre el precio publicado) y no sale del bolsillo del vendedor.
    const compartida = esCompartida(f.tipo_promo);
    const aporteRel = compartida && f.original != null && f.pct_meli != null ? Math.round(f.original * f.pct_meli / 100) : 0;
    const efectivo = !compartida ? f.rel : f.original != null && f.pct_vendedor != null ? Math.round(f.original * (1 - f.pct_vendedor / 100)) : null;
    const sinAporteRel = recibis(f.rel, f.rel_comision, f.rel_envio);
    const recibisRel = sinAporteRel == null ? null : sinAporteRel + aporteRel;
    // Un precio de entrada fuera del rango no se puede usar (en una propuesta todavía no aceptada).
    if (f.estado === "candidate" && f.rel != null && ((f.min != null && f.rel < f.min) || (f.max != null && f.rel > f.max))) f.rel = null;
    return {
      ...f, plan, base, efectivo, aporteRel, recibisHoy, recibisRel,
      costoHoyPct: costoPct(f.hoy, recibisHoy), costoRelPct: f.rel == null ? null : costoPct(f.hoy, recibisRel),
      diferencia: recibisHoy != null && recibisRel != null ? recibisRel - recibisHoy : null,
      alcanza: f.piso == null || recibisRel == null ? null : recibisRel >= f.piso,
      stockEntrar: f.estado !== "candidate" ? f.restante : (f.elegido_stock ?? f.stock_min),
      bajaPct: bajaSobre(f.rel == null ? null : efectivo, base),
      conStock: f.estado !== "candidate" || f.stock == null || (f.elegido_stock ?? f.stock_min) == null ? null : f.stock >= (f.elegido_stock ?? f.stock_min)!,
    };
  });
}

/** Cuántas propuestas hay (para la pestaña). */
export async function cuentaRelampagos(org: string, canal: number | null = null): Promise<number> {
  return (await una<{ n: number }>(`
    select count(*)::int n from ml_promo_item p join meli_item m on m.canal_id = p.canal_id and m.item_id = p.item_id and m.estado = 'active'
     where p.organizacion_id = $1 and p.tipo = any($3::text[]) and p.estado in ('candidate', 'pending', 'started') and ($2::bigint is null or p.canal_id = $2)`, [org, canal, TIPOS_OFERTA]))?.n ?? 0;
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
    select distinct p.organizacion_id, p.canal_id::int canal_id, p.item_id, z.precio::float8 precio,
           m.datos_externos -> 'ml' ->> 'listing_type_id' tipo, m.datos_externos -> 'ml' ->> 'category_id' categoria
      from ml_promo_item p
      join meli_item m on m.canal_id = p.canal_id and m.item_id = p.item_id and m.estado = 'active'
      ${PRECIOS_SQL}
      cross join lateral (values (round(x.hoy, 2)), (y.rel)) z(precio)
      left join ml_relampago_costo k on k.canal_id = p.canal_id and k.item_id = p.item_id and k.precio = z.precio
     where p.tipo in ('LIGHTNING', 'SMART_LIGHTNING', 'SMART') and p.estado in ('candidate', 'pending', 'started') and z.precio is not null
       and (k.item_id is null or k.leido_ts < now() - interval '1 day' or k.comision is null or k.envio is null)
     limit 400`);
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

/** Lo que Fer cambia en la fila (un solo lápiz): el precio y el stock con que entra (vacío: el sugerido / el mínimo; dentro
 *  de lo que acepta ML y del stock que hay) y el piso del producto (vale para todas las cuentas; vacío: sin piso). Si
 *  cambia el precio, lee enseguida lo que cobra ML a ese precio, para que la fila muestre cuánto se recibe. */
export async function guardarFilaRelampago(org: string, canal: number, item: string, d: { precio: number | null; stock: number | null; piso: number | null }, promocion: string | null = null): Promise<void> {
  const f = (await relampagos(org, canal)).find((x) => x.item_id === item && (!promocion || x.promocion_id === promocion));
  if (!f) throw new ErrorErp("Esa publicación ya no tiene propuesta de oferta relámpago.");
  await guardarPiso(org, f.producto_id, d.piso);
  if (f.estado !== "candidate") {
    if (d.precio != null || d.stock != null) throw new ErrorErp("Esa oferta ya está aceptada: el precio y el stock ya no se cambian (el piso sí quedó grabado).");
    return;
  }
  if (d.precio != null && esCompartida(f.tipo_promo)) throw new ErrorErp("En una oferta compartida el precio lo pone Mercado Libre: no se cambia (el piso sí quedó grabado).");
  if (d.precio != null && ((f.min != null && d.precio < f.min) || (f.max != null && d.precio > f.max)))
    throw new ErrorErp(`Mercado Libre acepta un precio entre $ ${Math.ceil(f.min ?? 0).toLocaleString("es-AR")} y $ ${Math.floor(f.max ?? 0).toLocaleString("es-AR")}.`);
  if (d.stock != null) {
    if (!Number.isInteger(d.stock) || d.stock <= 0) throw new ErrorErp("El stock va en unidades enteras.");
    if (f.stock_min != null && d.stock < f.stock_min) throw new ErrorErp(`La oferta pide al menos ${f.stock_min} unidades.`);
    if (f.stock_max != null && d.stock > f.stock_max) throw new ErrorErp(`La oferta acepta hasta ${f.stock_max} unidades.`);
    if (f.stock != null && d.stock > f.stock) throw new ErrorErp(`Tenés ${f.stock} unidades.`);
  }
  if (d.precio == null && d.stock == null)
    await consulta("delete from ml_relampago_precio where organizacion_id = $1 and canal_id = $2 and item_id = $3", [org, canal, item]);
  else
    await consulta(`insert into ml_relampago_precio (organizacion_id, canal_id, item_id, precio, stock) values ($1, $2, $3, $4, $5)
                    on conflict (canal_id, item_id) do update set precio = excluded.precio, stock = excluded.stock, actualizado_ts = now()`,
      [org, canal, item, d.precio, d.stock]);
  if (d.precio == null || d.precio === f.elegido) return;
  const cuenta = await cuentaDelCanal(org, canal);
  if (!cuenta || cuenta.estado !== "activa" || !f.tipo || !f.categoria) return;
  const precio = Math.round(d.precio * 100) / 100;
  const k = await costos(cuenta, item, precio, f.tipo, f.categoria, await barreraPlanes());
  await consulta(`insert into ml_relampago_costo (canal_id, item_id, precio, comision, envio) values ($1, $2, $3, $4, $5)
                  on conflict (canal_id, item_id, precio) do update set comision = excluded.comision, envio = excluded.envio, leido_ts = now()`,
    [canal, item, precio, k.comision, k.envio]);
}

/** Cuándo corren las ofertas aceptadas: ML pone el día y la hora y sólo lo dice en la lista de la promoción. Lee las que
 *  todavía no tienen fecha, también las recién aceptadas desde Laucen (la cola dio ok) aunque la lectura de campañas no
 *  haya pasado todavía; de paso deja la propuesta como aceptada en Laucen (sólo lectura de ML). */
export async function actualizarFechasRelampago(hasta: number): Promise<number> {
  const faltan = await consulta<{ organizacion_id: string; canal_id: number; promocion_id: string }>(`
    select distinct p.organizacion_id, p.canal_id::int canal_id, p.promocion_id
      from ml_promo_item p
      left join ml_relampago_fecha f on f.canal_id = p.canal_id and f.item_id = p.item_id
     where p.tipo = 'LIGHTNING'
       and (p.estado in ('pending', 'started') and (f.item_id is null or f.desde is null or f.ref_id is distinct from p.datos ->> 'ref_id')
            or p.estado = 'candidate' and exists (select 1 from ml_cola q where q.canal_id = p.canal_id and q.item_id = 'relampago:' || p.item_id
                                                   and q.estado = 'ok' and q.enviado_ts > now() - interval '7 days'))
     limit 40`);
  let n = 0;
  for (const f of faltan) {
    if (Date.now() > hasta) break;
    const cuenta = await cuentaDelCanal(f.organizacion_id, f.canal_id);
    if (!cuenta || cuenta.estado !== "activa") continue;
    for (const estado of ["pending", "started"]) {
      const r = await ml<{ results?: { id: string; ref_id?: string; status?: string; price?: number; start_date?: string; finish_date?: string }[] }>(cuenta, "GET",
        `/seller-promotions/promotions/${encodeURIComponent(f.promocion_id)}/items?promotion_type=LIGHTNING&status=${estado}&limit=50&app_version=v2`);
      if (r.status !== 200) continue;
      for (const x of r.datos?.results ?? []) {
        await consulta(`insert into ml_relampago_fecha (canal_id, item_id, ref_id, desde, hasta) values ($1, $2, $3, $4, $5)
                        on conflict (canal_id, item_id) do update set ref_id = excluded.ref_id, desde = excluded.desde, hasta = excluded.hasta, leido_ts = now()`,
          [f.canal_id, x.id, x.ref_id ?? null, x.start_date ?? null, x.finish_date ?? null]);
        await consulta(`update ml_promo_item set estado = $3, datos = datos || jsonb_strip_nulls(jsonb_build_object('status', $3::text, 'ref_id', $4::text, 'price', $5::numeric))
                         where canal_id = $1 and item_id = $2 and tipo = 'LIGHTNING' and estado in ('candidate', 'pending', 'started')`,
          [f.canal_id, x.id, x.status ?? estado, x.ref_id ?? null, x.price ?? null]);
        n++;
      }
    }
  }
  return n;
}

/** «Preparar las que alcanzan el piso»: un lote por cuenta, para el clic de Fer, con las propuestas todavía no aceptadas
 *  que alcanzan el piso y tienen el stock que piden. Entra al precio más alto del rango y con el stock mínimo. */
export async function prepararRelampagos(org: string, usuario: string, canal: number | null): Promise<{ lotes: number[]; filas: number }> {
  const filas = (await relampagos(org, canal)).filter((f) => f.estado === "candidate" && f.alcanza === true && f.conStock !== false && f.rel != null && f.stockEntrar != null);
  const yaPedidas = new Set((await consulta<{ item_id: string }>(
    "select item_id from ml_cola where organizacion_id = $1 and (item_id like 'relampago:%' or item_id like 'compartida:%') and estado in ('preparado', 'pendiente', 'enviando', 'ok') and creado_ts > now() - interval '7 days'", [org]))
    .map((x) => x.item_id));
  const porCanal = new Map<number, Relampago[]>();
  for (const f of filas) if (!yaPedidas.has(claveCola(f))) porCanal.set(f.canal_id, [...(porCanal.get(f.canal_id) ?? []), f]);
  const lotes: number[] = [];
  for (const [c, fs] of porCanal) {
    const cambios: CambioMl[] = fs.map(cambioEntrar);
    lotes.push(await encolarLoteConBoton(org, c, cambios, `Ofertas relámpago: ${fs.length} publicaci${fs.length === 1 ? "ón" : "ones"} en ${fs[0].cuenta}`, usuario));
  }
  return { lotes, filas: [...porCanal.values()].reduce((s, x) => s + x.length, 0) };
}

/** El pedido para entrar a una oferta de una publicación. Relámpago (como dice el manual): deal_price, stock, promotion_type.
 *  Compartida (SMART, SMART_LIGHTNING): el precio lo pone ML; se acepta la propuesta por su campaña y su ref_id (offer_id),
 *  con stock en la relámpago compartida. */
function cambioEntrar(f: Relampago, stock: number | null = f.stockEntrar): CambioMl {
  const pesos = (x: number | null) => `$ ${(x ?? 0).toLocaleString("es-AR")}`;
  const que = f.tipo_promo === "LIGHTNING" ? "la oferta relámpago" : f.tipo_promo === "SMART_LIGHTNING" ? "la relámpago compartida" : `la oferta compartida «${f.nombre_promo ?? f.promocion_id}»`;
  const cuerpo = f.tipo_promo === "LIGHTNING" ? { deal_price: f.rel, stock, promotion_type: "LIGHTNING" }
    : { promotion_id: f.promocion_id, promotion_type: f.tipo_promo, ...(f.ref_id ? { offer_id: f.ref_id } : {}), ...(f.tipo_promo === "SMART_LIGHTNING" && stock != null ? { stock } : {}) };
  return {
    canalId: f.canal_id, itemId: claveCola(f), tipo: "campana", antes: { estado: `candidata a ${que}` },
    payload: {
      descripcion: `Entrar a ${que}: ${f.item_id} (${f.sku}), el comprador paga ${pesos(f.rel)}${esCompartida(f.tipo_promo) ? ` (ponés ${f.pct_vendedor ?? "?"} %, ML ${f.pct_meli ?? "?"} %)` : ""}${f.tipo_promo !== "SMART" ? ` con ${stock} u.` : ""}; recibís ${pesos(f.recibisRel)} (hoy ${pesos(f.recibisHoy)})`,
      // El precio con que se entró (para no reintentar al mismo precio una que ML rechazó).
      precio_oferta: f.rel,
      pedidos: [{ metodo: "POST", ruta: `/seller-promotions/items/${f.item_id}?app_version=v2`, cuerpo }],
    },
  };
}

/** «Entrar» de una fila (el clic de Fer): va directo a la cola de ML, sin lote. */
export async function entrarRelampago(org: string, usuario: string, canal: number, item: string, promocion: string | null = null): Promise<Relampago> {
  const f = (await relampagos(org, canal)).find((x) => x.item_id === item && (!promocion || x.promocion_id === promocion));
  if (!f) throw new ErrorErp("Esa publicación ya no tiene propuesta de oferta relámpago.");
  if (f.estado !== "candidate") throw new ErrorErp("Esa oferta ya está aceptada.");
  if (f.rel == null) throw new ErrorErp("El precio de entrada queda fuera del rango que acepta Mercado Libre: no se puede entrar.");
  if (f.stockEntrar == null) throw new ErrorErp("Mercado Libre no informa cuánto stock pide: no se puede entrar.");
  if (f.conStock === false) throw new ErrorErp(`Tenés ${f.stock} y querés entrar con ${f.stockEntrar}.`);
  await encolar(org, [cambioEntrar(f)], { origen: "boton", usuarioId: usuario });
  return f;
}

/** Lo último que se mandó para entrar, por fila de la cola (claveCola: para la pantalla y para no repetir). */
export async function enviosRelampago(org: string): Promise<Map<string, { estado: string; error: string | null; precio: number | null }>> {
  return new Map((await consulta<{ item_id: string; estado: string; error: string | null; precio: number | null }>(`
    select distinct on (item_id) item_id, estado, ultimo_error error,
           coalesce((payload -> 'pedidos' -> 0 -> 'cuerpo' ->> 'deal_price')::float8, (payload ->> 'precio_oferta')::float8) precio from ml_cola
     where organizacion_id = $1 and (item_id like 'relampago:%' or item_id like 'compartida:%') and creado_ts > now() - interval '7 days' order by item_id, id desc`, [org]))
    .map((x) => [x.item_id, { estado: x.estado, error: x.error, precio: x.precio }]));
}

/** Cuánto más barata que el precio del esquema de la publicación puede ser una relámpago para entrar sola (Fer, 12/10 y 20/10). */
export const RELAMPAGO_AUTO_PCT = 5;

/** Cuánto baja `precio` contra `base` (el precio del esquema), en % con un decimal (negativo: más caro). Pura. */
export function bajaSobre(precio: number | null, base: number | null): number | null {
  if (precio == null || base == null || base <= 0) return null;
  return Math.round(((base - precio) / base) * 1000) / 10;
}

/** Si una propuesta entra sola: todavía no aceptada, con precio dentro del rango que no baje más de RELAMPAGO_AUTO_PCT % del
 *  precio del esquema para su tipo de publicación (Fer, 20/10: la Clásica de la lista en una Clásica; en un plan de cuotas,
 *  el precio del plan que sale de esa Clásica con su comisión; nunca lo que paga hoy el comprador), que alcance el piso (si
 *  hay) y con stock para lo que pide. Sin precio de esquema no entra. Pura. */
export function entraSola(f: Pick<Relampago, "estado" | "rel" | "base" | "alcanza" | "piso" | "stock" | "stock_min"> & { efectivo?: number | null }): boolean {
  if (f.estado !== "candidate" || f.rel == null || f.base == null || f.base <= 0) return false;
  // En una compartida se mide lo que pone el vendedor, no lo que paga el comprador (Fer, 21/10).
  const pone = f.efectivo === undefined ? f.rel : f.efectivo;
  if (pone == null) return false;
  // Con piso, hace falta saber que lo alcanza (sin los costos leídos todavía, espera a la próxima vuelta).
  if (f.piso != null && f.alcanza !== true) return false;
  // Un peso de tolerancia (pesos enteros).
  if (pone < f.base * (1 - RELAMPAGO_AUTO_PCT / 100) - 1) return false;
  return f.stock != null && f.stock > 0 && (f.stock_min == null || f.stock >= f.stock_min);
}

/** Las unidades con que entra sola: todas las disponibles, hasta el máximo que acepta la oferta (o las que puso Fer). Pura. */
export function stockAuto(f: Pick<Relampago, "stock" | "stock_max" | "elegido_stock">): number | null {
  if (f.elegido_stock != null) return f.elegido_stock;
  if (f.stock == null) return null;
  return f.stock_max != null ? Math.min(f.stock, f.stock_max) : f.stock;
}

/** «Entrar solo a las ofertas relámpago» (interruptor de la cuenta, canal.config.relampago_auto; prenderlo es el clic de
 *  Fer): las propuestas que cumplen entraSola entran con todas las unidades, antes que cualquier otra campaña (mientras
 *  está aceptada, el esquema de precios no toca esa publicación). Una vez por propuesta. */
export async function entrarRelampagosAuto(hasta: number): Promise<number> {
  // «Entrar solo a las relámpago» (relampago_auto) y «Entrar solo a las compartidas» (compartidas_auto; Fer, 21/10).
  const canales = await consulta<{ organizacion_id: string; id: number; rel: boolean; comp: boolean }>(`
    select organizacion_id, id::int id, coalesce((config ->> 'relampago_auto')::boolean, false) rel, coalesce((config ->> 'compartidas_auto')::boolean, false) comp
      from canal where (config ->> 'relampago_auto')::boolean is true or (config ->> 'compartidas_auto')::boolean is true`);
  let n = 0;
  for (const c of canales) {
    if (Date.now() > hasta) break;
    const enviados = await enviosRelampago(c.organizacion_id);
    const todas = await relampagos(c.organizacion_id, null);
    const prendida = (f: Relampago) => (f.tipo_promo === "LIGHTNING" ? c.rel : c.comp);
    const elegidas = elegirOfertas(todas.filter((f) => f.canal_id === c.id && prendida(f) && entraSola(f)), todas, enviados);
    const cambios = elegidas.map((f) => cambioEntrar(f, stockAuto(f)));
    if (!cambios.length) continue;
    await encolar(c.organizacion_id, cambios.map((x) => ({ ...x, prioridad: 40 })), { origen: "automatico" });
    n += cambios.length;
  }
  return n;
}

type Envios = Map<string, { estado: string; error: string | null; precio: number | null }>;

/** Ya se pidió entrar (o ML la rechazó al mismo precio: no se repite hasta que cambie). */
const enviadaA = (enviados: Envios, f: Relampago) => { const e = enviados.get(claveCola(f)); return !!e && !(e.estado === "error" && e.precio !== f.rel); };

/** De las propuestas que entran, cuáles se piden: de las relámpago (común o compartida), una sola por producto
 *  (unaPorProducto); de las compartidas que no son relámpago, una por publicación (la que menos pone el vendedor),
 *  salteando las publicaciones que ya están en una compartida. */
export function elegirOfertas(candidatas: Relampago[], todas: Relampago[], enviados: Envios, azar: () => number = Math.random): Relampago[] {
  const rel = unaPorProducto(candidatas.filter((f) => esRelampago(f.tipo_promo)), todas.filter((f) => esRelampago(f.tipo_promo)), enviados, azar);
  const ocupadas = new Set(todas.filter((f) => f.tipo_promo === "SMART" && (f.estado !== "candidate" || enviadaA(enviados, f))).map((f) => `${f.canal_id}|${f.item_id}`));
  const porItem = new Map<string, Relampago>();
  for (const f of candidatas) {
    if (f.tipo_promo !== "SMART" || ocupadas.has(`${f.canal_id}|${f.item_id}`) || enviadaA(enviados, f)) continue;
    const k = `${f.canal_id}|${f.item_id}`, ya = porItem.get(k);
    if (!ya || (f.pct_vendedor ?? 100) < (ya.pct_vendedor ?? 100)) porItem.set(k, f);
  }
  return [...rel, ...porItem.values()];
}

/** De las propuestas `candidatas`, una sola por producto (al azar entre sus publicaciones y cuentas; Fer, 13/10: no
 *  entrar con el mismo producto en varias publicaciones), salteando los productos que ya tienen una relámpago aceptada o
 *  mandada en `todas`. Una que ML rechazó se vuelve a probar sólo si cambió su precio de entrada. */
export function unaPorProducto(candidatas: Relampago[], todas: Relampago[], enviados: Envios, azar: () => number = Math.random): Relampago[] {
  const enviada = (f: Relampago) => enviadaA(enviados, f);
  const ocupados = new Set(todas.filter((f) => f.estado !== "candidate" || enviada(f)).map((f) => f.producto_id));
  const porProducto = new Map<number, Relampago[]>();
  for (const f of candidatas) {
    if (ocupados.has(f.producto_id) || enviada(f)) continue;
    porProducto.set(f.producto_id, [...(porProducto.get(f.producto_id) ?? []), f]);
  }
  return [...porProducto.values()].map((fs) => fs[Math.floor(azar() * fs.length)]);
}

/** «Entrar a todas las que bajan hasta X %» (el clic de Fer): las propuestas de la cuenta (o de todas) que entran con
 *  una baja de hasta `maxPct` % sobre el precio del esquema (en una compartida, lo que pone el vendedor), alcanzan el piso
 *  y tienen el stock que piden; de las relámpago una por producto, de las compartidas una por publicación, con todas las
 *  unidades disponibles (hasta el máximo de la oferta). Van directo a la cola. */
export async function entrarRelampagosHasta(org: string, usuario: string, canal: number | null, maxPct: number): Promise<Relampago[]> {
  const todas = await relampagos(org, null);
  const candidatas = todas.filter((f) => (canal == null || f.canal_id === canal) && f.estado === "candidate" && f.rel != null
    && f.bajaPct != null && f.bajaPct <= maxPct + 0.05 && f.alcanza !== false && f.stock != null && f.stock > 0
    && (f.stock_min == null || f.stock >= f.stock_min));
  const elegidas = elegirOfertas(candidatas, todas, await enviosRelampago(org));
  if (elegidas.length) await encolar(org, elegidas.map((f) => cambioEntrar(f, stockAuto(f))), { origen: "boton", usuarioId: usuario });
  return elegidas;
}
