// Órdenes de compra al exterior (pedido de Fer, 5/11; bitácora #1106). Tablas en db/compras.sql y db/preventa.sql.
//
//   · Una orden por cada llegada (aéreo A, marítimo M o courier C). Se crea subiendo el Excel del proveedor, que queda
//     como invoice para la estadística: los renglones de la orden SON los del invoice (no se cargan dos veces).
//   · Código: letra + correlativo del año (2 dígitos) + año (2 dígitos). M0226 = segundo marítimo de 2026. Cajas: M0226-34.
//   · Borrador → «Confirmar»: el invoice queda confirmado, el FOB de cada producto pasa a ser el del Excel (el costo
//     puesto estimado sale de ahí con los % de importación) y la orden queda «en camino»: cuenta como mercadería entrante.
//     NO toca el costo último ni el promedio: esos los graba el ingreso real (factura o despacho).
//     Si es courier, además queda armada su compra por courier (Compras › Compras por courier) para grabar el costo real.
//   · Se recibe por cajas en Recepción; al cerrar la recepción queda «recibida».

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";
import { configInvoices, crearInvoice, confirmar as confirmarInvoice, volverARevisar, leerArchivoInvoice, matriz } from "@/lib/compras/invoices";
import { abrirLibro } from "@/lib/importar/leer";
import { leerPacking, porUnidad, type PackingLeido } from "@/lib/compras/packing-leer";
import { hoyArgentina } from "@/lib/rango-fechas";

export const VIAS_ORDEN = {
  aereo: { letra: "A", texto: "Aéreo", invoice: "avion" },
  maritimo: { letra: "M", texto: "Marítimo", invoice: "barco" },
  courier: { letra: "C", texto: "Courier", invoice: "avion" },
} as const;
export type ViaOrden = keyof typeof VIAS_ORDEN;
export const esViaOrden = (v: unknown): v is ViaOrden => typeof v === "string" && Object.hasOwn(VIAS_ORDEN, v);

export const ESTADOS_ORDEN = { borrador: "A revisar", en_camino: "En camino", recibida: "Recibida" } as const;
export type EstadoOrden = keyof typeof ESTADOS_ORDEN;

const dos = (n: number) => String(n).padStart(2, "0");

/** «M0226»: letra de la vía, correlativo del año (2 dígitos; 3 si pasa de 99) y año (2 dígitos). */
export function codigoOrden(via: ViaOrden, numero: number, anio: number): string {
  return `${VIAS_ORDEN[via].letra}${dos(numero)}${dos(anio % 100)}`;
}

/** «M0226-34»: la caja 34 de la orden M0226. */
export const codigoCaja = (codigoOrden: string, numero: number) => `${codigoOrden}-${dos(numero)}`;

/** Lee un código de caja escrito o escaneado: «M0226-34», «m0226 34», «M022634» no (ambiguo). */
export function leerCodigoCaja(texto: string): { orden: string; caja: number } | null {
  const m = texto.trim().toUpperCase().match(/^([AMC]\d{4,5})\s*[-–_ ]\s*(\d{1,4})$/);
  return m ? { orden: m[1], caja: Number(m[2]) } : null;
}

const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Llegada estimada de una orden: su fecha + la demora de la vía (la de Invoices de compra). */
export async function llegadaEstimada(org: string, via: ViaOrden, fecha: string): Promise<string> {
  const cfg = await configInvoices(org);
  return sumarDias(fecha, via === "maritimo" ? cfg.demoraBarco : cfg.demoraAvion);
}

async function siguienteNumero(c: Consultor, org: string, via: ViaOrden, anio: number): Promise<number> {
  const r = (await c.query<{ n: number }>("select coalesce(max(numero), 0)::int + 1 n from orden_compra where organizacion_id = $1 and via = $2 and anio = $3", [org, via, anio])).rows[0];
  return r.n;
}

/** Crea la orden desde el Excel del proveedor (ya subido a Storage). El invoice queda «a revisar» hasta confirmar la orden. */
export async function crearOrdenDesdeExcel(org: string, a: { contenido: ArrayBuffer; archivo: string; ruta: string; proveedorId: number; via: ViaOrden; usuarioId: string }): Promise<{ id: number; codigo: string; renglones: number }> {
  if (!esViaOrden(a.via)) throw new ErrorErp("Elegí si es aéreo, marítimo o courier.");
  if (!(await una("select 1 from proveedor where id = $1 and organizacion_id = $2", [a.proveedorId, org]))) throw new ErrorErp("Elegí el proveedor.");
  const { hoja, leido } = await leerArchivoInvoice(a.contenido);
  const invoiceId = await crearInvoice(org, { archivo: a.archivo, ruta: a.ruta, proveedorId: a.proveedorId, usuarioId: a.usuarioId, hoja, leido, reusar: true });
  const fecha = leido.fecha ?? hoyArgentina();
  const anio = Number(fecha.slice(0, 4));
  const llegada = await llegadaEstimada(org, a.via, fecha);
  return enTransaccion(async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('orden_compra:' || $1))", [org]);
    const numero = await siguienteNumero(c, org, a.via, anio);
    const codigo = codigoOrden(a.via, numero, anio);
    await c.query("update compra_invoice set via = $3, proveedor_id = $4 where id = $2 and organizacion_id = $1", [org, invoiceId, VIAS_ORDEN[a.via].invoice, a.proveedorId]);
    const r = (await c.query<{ id: number }>(`
      insert into orden_compra (organizacion_id, via, anio, numero, codigo, proveedor_id, invoice_id, fecha, llegada, llegada_ml, archivo, usuario_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11) returning id::int`,
      [org, a.via, anio, numero, codigo, a.proveedorId, invoiceId, leido.fecha, llegada, a.archivo.slice(0, 200), a.usuarioId])).rows[0];
    const n = (await c.query<{ n: number }>("select count(*)::int n from compra_invoice_linea where invoice_id = $1", [invoiceId])).rows[0].n;
    return { id: r.id, codigo, renglones: n };
  });
}

export type FilaOrden = {
  id: number; codigo: string; via: ViaOrden; anio: number; numero: number; estado: EstadoOrden; fecha: string | null; llegada: string | null; llegada_ml: string | null;
  publicar_web: boolean; publicar_ml: boolean; proveedor_id: number | null; proveedor: string | null; invoice_id: number | null; compra_courier_id: number | null;
  compra_courier: string | null; packing_list_id: number | null; archivo: string | null; notas: string | null;
  margen_unidades: number | null; margen_pct: number | null; margen_modo: "menor" | "mayor" | null; descuento_pct: number | null;
  confirmada_ts: Date | null; recibida_ts: Date | null; creado_ts: Date;
  renglones: number; unidades: number; total_usd: number | null; sin_producto: number; cajas: number; recibido: number; prevendido: number;
};

const CAMPOS = `
  o.id::int, o.codigo, o.via, o.anio, o.numero, o.estado, o.fecha::text, o.llegada::text, o.llegada_ml::text, o.publicar_web, o.publicar_ml,
  o.proveedor_id::int, pr.nombre proveedor, o.invoice_id::int, o.compra_courier_id::int, cc.nombre compra_courier, o.packing_list_id::int, o.archivo, o.notas,
  o.margen_unidades, o.margen_pct::float8, o.margen_modo, o.descuento_pct::float8, o.confirmada_ts, o.recibida_ts, o.creado_ts,
  (select count(*) from compra_invoice_linea l where l.invoice_id = o.invoice_id)::int renglones,
  (select coalesce(sum(l.cantidad), 0) from compra_invoice_linea l where l.invoice_id = o.invoice_id)::float8 unidades,
  (select case when bool_or(i.ignorar_precio) then null else coalesce(sum(l.cantidad * l.precio_usd), 0) end
     from compra_invoice i left join compra_invoice_linea l on l.invoice_id = i.id where i.id = o.invoice_id)::float8 total_usd,
  (select count(*) from compra_invoice_linea l where l.invoice_id = o.invoice_id and l.variacion_id is null)::int sin_producto,
  (select count(*) from orden_compra_caja k where k.orden_id = o.id)::int cajas,
  (select coalesce(sum(rl.cantidad), 0) from recepcion r join recepcion_linea rl on rl.recepcion_id = r.id where r.orden_compra_id = o.id)::int recibido,
  (select coalesce(sum(pr2.cantidad), 0) from preventa_reserva pr2 where pr2.orden_id = o.id and pr2.estado in ('activa', 'cubierta'))::int prevendido`;
const DESDE = `orden_compra o left join proveedor pr on pr.id = o.proveedor_id left join compra_courier cc on cc.id = o.compra_courier_id`;

export const ORDEN_ORDENES = {
  codigo: "anio desc, codigo", estado: "estado", llegada: "llegada", fecha: "fecha", proveedor: "lower(proveedor)", unidades: "unidades", total: "total_usd", cajas: "cajas",
} as const;

export async function listaOrdenes(org: string, orden: string, f: { q?: string | null; estado?: string | null } = {}): Promise<FilaOrden[]> {
  const v: unknown[] = [org];
  let donde = "";
  if (f.estado && f.estado in ESTADOS_ORDEN) { v.push(f.estado); donde += ` and o.estado = $${v.length}`; }
  if (f.q?.trim()) {
    v.push(`%${f.q.trim().toLowerCase()}%`);
    donde += ` and (lower(o.codigo) like $${v.length} or lower(coalesce(pr.nombre, '')) like $${v.length}
                    or exists (select 1 from compra_invoice_linea l join variacion va on va.id = l.variacion_id where l.invoice_id = o.invoice_id and lower(va.sku) like $${v.length}))`;
  }
  return consulta<FilaOrden>(`select * from (select ${CAMPOS} from ${DESDE} where o.organizacion_id = $1 ${donde}) o order by ${orden}`, v);
}

export async function ordenCabecera(org: string, id: number, c?: Consultor): Promise<FilaOrden | null> {
  const sql = `select ${CAMPOS} from ${DESDE} where o.organizacion_id = $1 and o.id = $2`;
  return c ? ((await c.query<FilaOrden>(sql, [org, id])).rows[0] ?? null) : una<FilaOrden>(sql, [org, id]);
}

export type LineaOrden = {
  id: number; fila: number | null; sku: string; descripcion: string | null; cantidad: number; precio_usd: number | null;
  variacion_id: number | null; producto_id: number | null; sku_sistema: string | null; titulo: string | null; fotos: string[] | null;
  recibido: number; prevendido: number; en_cajas: number;
};

export async function lineasOrden(org: string, ordenId: number): Promise<LineaOrden[]> {
  return consulta<LineaOrden>(`
    select l.id::int, l.fila, l.sku, l.descripcion, l.cantidad::float8, l.precio_usd::float8, l.variacion_id::int, va.producto_id::int, va.sku sku_sistema, p.titulo,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = p.id) fotos,
           coalesce((select sum(rl.cantidad) from recepcion r join recepcion_linea rl on rl.recepcion_id = r.id
                      where r.orden_compra_id = o.id and rl.variacion_id = l.variacion_id), 0)::int recibido,
           coalesce((select sum(x.cantidad) from preventa_reserva x where x.orden_id = o.id and x.variacion_id = l.variacion_id and x.estado in ('activa', 'cubierta')), 0)::int prevendido,
           coalesce((select sum(ci.cantidad) from orden_compra_caja_item ci join orden_compra_caja k on k.id = ci.caja_id
                      where k.orden_id = o.id and upper(replace(ci.sku, ' ', '')) = upper(replace(coalesce(va.sku, l.sku), ' ', ''))), 0)::int en_cajas
      from orden_compra o join compra_invoice_linea l on l.invoice_id = o.invoice_id
      left join variacion va on va.id = l.variacion_id left join producto p on p.id = va.producto_id
     where o.organizacion_id = $1 and o.id = $2
     order by l.variacion_id is not null, l.fila, l.id`, [org, ordenId]);
}

export type CajaOrden = {
  id: number; numero: number; codigo: string; peso_kg: number | null; cbm: number | null; largo_cm: number | null; ancho_cm: number | null; alto_cm: number | null;
  ubicacion_id: number | null; ubicacion: string | null; deposito: string | null; recibida_ts: Date | null; en_ubicacion: number;
  items: { id: number; sku: string; descripcion: string | null; cantidad: number; variacion_id: number | null; producto_id: number | null; titulo: string | null }[];
};

export async function cajasOrden(org: string, ordenId: number): Promise<CajaOrden[]> {
  const cajas = await consulta<Omit<CajaOrden, "items" | "codigo"> & { orden: string }>(`
    select k.id::int, k.numero, o.codigo orden, k.peso_kg::float8, k.cbm::float8, k.largo_cm::float8, k.ancho_cm::float8, k.alto_cm::float8, k.ubicacion_id::int,
           u.codigo ubicacion, d.nombre deposito, k.recibida_ts,
           coalesce((select sum(s.cantidad) from stock s where s.ubicacion_id = k.ubicacion_id), 0)::int en_ubicacion
      from orden_compra_caja k join orden_compra o on o.id = k.orden_id
      left join ubicacion u on u.id = k.ubicacion_id left join deposito d on d.id = u.deposito_id
     where k.organizacion_id = $1 and k.orden_id = $2 order by k.numero`, [org, ordenId]);
  if (!cajas.length) return [];
  const items = await consulta<CajaOrden["items"][number] & { caja_id: number }>(`
    select ci.id::int, ci.caja_id::int, ci.sku, ci.descripcion, ci.cantidad, ci.variacion_id::int, va.producto_id::int, titulo_variacion(va.id) titulo
      from orden_compra_caja_item ci left join variacion va on va.id = ci.variacion_id
     where ci.organizacion_id = $1 and ci.caja_id = any($2::bigint[]) order by ci.fila, ci.id`, [org, cajas.map((k) => k.id)]);
  return cajas.map(({ orden, ...k }) => ({ ...k, codigo: codigoCaja(orden, k.numero), items: items.filter((i) => i.caja_id === k.id) }));
}

// ── Cabecera ─────────────────────────────────────────────

export type CabeceraOrden = {
  via: string; anio: number; numero: number; proveedorId: number | null; fecha: string | null; llegada: string | null; llegadaMl: string | null; notas: string | null;
  margenUnidades: number | null; margenPct: number | null; margenModo: string | null; descuentoPct: number | null;
};

const esFecha = (s: string | null) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function guardarCabecera(org: string, id: number, d: CabeceraOrden): Promise<void> {
  if (!esViaOrden(d.via)) throw new ErrorErp("Elegí si es aéreo, marítimo o courier.");
  if (!Number.isInteger(d.anio) || d.anio < 2000 || d.anio > 2100) throw new ErrorErp("El año no es válido.");
  if (!Number.isInteger(d.numero) || d.numero < 1 || d.numero > 999) throw new ErrorErp("El número de la orden va de 1 a 999.");
  if (!esFecha(d.fecha) || !esFecha(d.llegada) || !esFecha(d.llegadaMl)) throw new ErrorErp("Alguna fecha no es válida.");
  if (d.fecha && d.llegada && d.llegada < d.fecha) throw new ErrorErp("La llegada no puede ser anterior a la fecha de la orden.");
  if (d.llegada && d.llegadaMl && d.llegadaMl < d.llegada) throw new ErrorErp("La llegada para Mercado Libre no puede ser antes que la de la web: en Mercado Libre se toma más margen.");
  if (d.margenModo && d.margenModo !== "menor" && d.margenModo !== "mayor") throw new ErrorErp("El margen de seguridad toma el menor o el mayor.");
  if (d.margenUnidades != null && !(Number.isInteger(d.margenUnidades) && d.margenUnidades >= 0)) throw new ErrorErp("El margen en unidades tiene que ser un entero.");
  if (d.margenPct != null && !(d.margenPct >= 0 && d.margenPct <= 100)) throw new ErrorErp("El margen en % va de 0 a 100.");
  if (d.descuentoPct != null && !(d.descuentoPct >= 0 && d.descuentoPct <= 90)) throw new ErrorErp("El descuento de preventa va de 0 % a 90 %.");
  if (d.proveedorId && !(await una("select 1 from proveedor where id = $1 and organizacion_id = $2", [d.proveedorId, org]))) throw new ErrorErp("Ese proveedor no existe.");
  const o = await una<{ estado: string; invoice_id: number | null }>("select estado, invoice_id::int from orden_compra where id = $1 and organizacion_id = $2", [id, org]);
  if (!o) throw new ErrorErp("Esa orden no existe.");
  const codigo = codigoOrden(d.via, d.numero, d.anio);
  const choca = await una("select 1 from orden_compra where organizacion_id = $1 and (codigo = $2 or (via = $3 and anio = $4 and numero = $5)) and id <> $6",
    [org, codigo, d.via, d.anio, d.numero, id]);
  if (choca) throw new ErrorErp(`Ya hay otra orden ${codigo}.`);
  await enTransaccion(async (c) => {
    await c.query(`update orden_compra set via = $3, anio = $4, numero = $5, codigo = $6, proveedor_id = $7, fecha = $8, llegada = $9, llegada_ml = $10, notas = $11,
                     margen_unidades = $12, margen_pct = $13, margen_modo = $14, descuento_pct = $15
                    where id = $2 and organizacion_id = $1`,
      [org, id, d.via, d.anio, d.numero, codigo, d.proveedorId, d.fecha, d.llegada, d.llegadaMl, d.notas, d.margenUnidades, d.margenPct, d.margenModo || null, d.descuentoPct]);
    if (o.invoice_id) {
      await c.query(`update compra_invoice set via = $3, proveedor_id = coalesce($4, proveedor_id), fecha = coalesce($5::date, fecha),
                       llegada = case when $6 then $7::date else llegada end where id = $2 and organizacion_id = $1`,
        [org, o.invoice_id, VIAS_ORDEN[d.via as ViaOrden].invoice, d.proveedorId, d.fecha, o.estado === "en_camino", d.llegada]);
    }
    // Los pedidos en preventa de esta orden que todavía esperan: la fecha prometida sigue a la de la orden.
    await c.query(`update pedido p set preventa_llegada = case when ca.tipo = 'mercadolibre' then coalesce($3::date, $4::date) else $4::date end
                     from canal ca where ca.id = p.canal_id and p.preventa_orden_id = $2 and p.organizacion_id = $1 and p.preventa_cubierto_ts is null
                      and p.estado not in ('cancelado', 'devuelto')`, [org, id, d.llegadaMl, d.llegada]);
  });
}

// ── Renglones (son los del invoice) ─────────────────────────

/** Antes de achicar un renglón: no puede quedar menos de lo ya vendido en preventa de esa variación (Fer, 5/11:
 *  primero se resuelve cada pedido que sobra, uno por uno, en Ventas › Preventas). */
async function exigirNoMenosQueVendido(c: Consultor, org: string, ordenId: number, variacionId: number | null, cantidadNueva: number) {
  if (!variacionId) return;
  const r = (await c.query<{ vendido: number }>(`select coalesce(sum(cantidad), 0)::int vendido from preventa_reserva
                                                  where organizacion_id = $1 and orden_id = $2 and variacion_id = $3 and estado = 'activa'`, [org, ordenId, variacionId])).rows[0];
  if (cantidadNueva < r.vendido) {
    throw new ErrorErp(`Ya hay ${r.vendido} vendidas en preventa de ese producto en esta orden: no puede quedar en ${cantidadNueva}. Resolvé primero los pedidos que sobran (Ventas › Preventas).`);
  }
}

async function ordenDeLinea(org: string, lineaId: number) {
  return una<{ orden_id: number; invoice_id: number; estado: EstadoOrden; variacion_id: number | null }>(`
    select o.id::int orden_id, o.invoice_id::int, o.estado, l.variacion_id::int from compra_invoice_linea l join orden_compra o on o.invoice_id = l.invoice_id
     where l.id = $1 and l.organizacion_id = $2`, [lineaId, org]);
}

const emparejarSql = `
  update compra_invoice_linea l set variacion_id = (
    select va.id from variacion va where va.organizacion_id = $1 and upper(replace(va.sku, ' ', '')) = upper(replace(l.sku, ' ', ''))
     order by va.es_default desc, va.id limit 1)
   where l.invoice_id = $2 and l.organizacion_id = $1`;

export async function guardarLinea(org: string, lineaId: number, d: { sku: string; cantidad: number; precio: number | null }): Promise<number> {
  if (!d.sku.trim()) throw new ErrorErp("El renglón necesita un SKU.");
  if (!(Number.isInteger(d.cantidad) && d.cantidad > 0)) throw new ErrorErp("La cantidad tiene que ser un entero mayor que cero.");
  if (d.precio != null && !(d.precio >= 0)) throw new ErrorErp("El precio no es válido.");
  const o = await ordenDeLinea(org, lineaId);
  if (!o) throw new ErrorErp("Ese renglón no existe.");
  if (o.estado === "recibida") throw new ErrorErp("La orden ya se recibió: no se cambia.");
  await enTransaccion(async (c) => {
    await c.query("update compra_invoice_linea set sku = $3, cantidad = $4, precio_usd = $5 where id = $2 and organizacion_id = $1", [org, lineaId, d.sku.trim(), d.cantidad, d.precio]);
    await c.query(emparejarSql, [org, o.invoice_id]);
    const nueva = (await c.query<{ variacion_id: number | null }>("select variacion_id::int from compra_invoice_linea where id = $1", [lineaId])).rows[0];
    // Lo que quedó de cada variación tocada (la de antes y la de ahora) no puede bajar de lo vendido.
    for (const v of new Set([o.variacion_id, nueva.variacion_id])) {
      if (!v) continue;
      const t = (await c.query<{ n: number }>("select coalesce(sum(cantidad), 0)::int n from compra_invoice_linea where invoice_id = $1 and variacion_id = $2", [o.invoice_id, v])).rows[0].n;
      await exigirNoMenosQueVendido(c, org, o.orden_id, v, t);
    }
  });
  return o.orden_id;
}

export async function agregarLinea(org: string, ordenId: number, d: { sku: string; cantidad: number; precio: number | null; descripcion: string | null }): Promise<void> {
  if (!d.sku.trim()) throw new ErrorErp("El renglón necesita un SKU.");
  if (!(Number.isInteger(d.cantidad) && d.cantidad > 0)) throw new ErrorErp("La cantidad tiene que ser un entero mayor que cero.");
  const o = await una<{ invoice_id: number | null; estado: EstadoOrden }>("select invoice_id::int, estado from orden_compra where id = $1 and organizacion_id = $2", [ordenId, org]);
  if (!o?.invoice_id) throw new ErrorErp("Esa orden no existe.");
  if (o.estado === "recibida") throw new ErrorErp("La orden ya se recibió: no se cambia.");
  await enTransaccion(async (c) => {
    await c.query(`insert into compra_invoice_linea (organizacion_id, invoice_id, fila, sku, descripcion, cantidad, precio_usd)
                   values ($1, $2, (select coalesce(max(fila), 0) + 1 from compra_invoice_linea where invoice_id = $2), $3, $4, $5, $6)`,
      [org, o.invoice_id, d.sku.trim(), d.descripcion, d.cantidad, d.precio]);
    await c.query(emparejarSql, [org, o.invoice_id]);
  });
}

export async function borrarLinea(org: string, lineaId: number): Promise<number> {
  const o = await ordenDeLinea(org, lineaId);
  if (!o) throw new ErrorErp("Ese renglón no existe.");
  if (o.estado === "recibida") throw new ErrorErp("La orden ya se recibió: no se cambia.");
  await enTransaccion(async (c) => {
    await c.query("delete from compra_invoice_linea where id = $2 and organizacion_id = $1", [org, lineaId]);
    if (o.variacion_id) {
      const t = (await c.query<{ n: number }>("select coalesce(sum(cantidad), 0)::int n from compra_invoice_linea where invoice_id = $1 and variacion_id = $2", [o.invoice_id, o.variacion_id])).rows[0].n;
      await exigirNoMenosQueVendido(c, org, o.orden_id, o.variacion_id, t);
    }
  });
  return o.orden_id;
}

// ── Confirmar, volver a revisar, borrar ─────────────────────

export type ResultadoConfirmar = { fob: number; courier: string | null };

/** Confirma la orden: pasa a «en camino» (mercadería entrante), confirma su invoice, deja el FOB del Excel en cada
 *  producto y, si es courier, arma su compra por courier. */
export async function confirmarOrden(org: string, id: number): Promise<ResultadoConfirmar> {
  const o = await ordenCabecera(org, id);
  if (!o) throw new ErrorErp("Esa orden no existe.");
  if (o.estado !== "borrador") throw new ErrorErp("La orden ya está confirmada.");
  if (!o.invoice_id || !o.renglones) throw new ErrorErp("La orden no tiene renglones.");
  if (!o.proveedor_id) throw new ErrorErp("Falta el proveedor: cargalo con el lápiz.");
  if (!o.fecha) throw new ErrorErp("Falta la fecha de la orden: cargala con el lápiz.");
  if (!o.llegada) throw new ErrorErp("Falta la fecha de arribo: cargala con el lápiz.");
  if (o.sin_producto) throw new ErrorErp(`Hay ${o.sin_producto} renglón${o.sin_producto === 1 ? "" : "es"} sin producto en el sistema: corregí el SKU o dalo de alta antes de confirmar.`);
  await confirmarInvoice(org, o.invoice_id);
  return enTransaccion(async (c) => {
    // Para la estadística, el invoice llega cuando dice la orden (al recibirla, la fecha real).
    await c.query("update compra_invoice set llegada = $4::date, via = $3 where id = $2 and organizacion_id = $1", [org, o.invoice_id, VIAS_ORDEN[o.via].invoice, o.llegada]);
    // El FOB del Excel pasa a cada variación (el costo puesto estimado se calcula con él y los % de importación).
    const fob = await c.query(`
      update variacion va set costo_fob = x.precio, costo_moneda = 'USD'
        from (select distinct on (l.variacion_id) l.variacion_id, l.precio_usd precio
                from compra_invoice_linea l join compra_invoice i on i.id = l.invoice_id
               where l.invoice_id = $2 and l.variacion_id is not null and l.precio_usd > 0 and not i.ignorar_precio
               order by l.variacion_id, l.fila desc nulls last, l.id desc) x
       where va.id = x.variacion_id and va.organizacion_id = $1 and not es_kit(va.id)`, [org, o.invoice_id]);
    let courier: string | null = null;
    if (o.via === "courier" && !o.compra_courier_id) courier = await armarCompraCourier(c, org, o);
    await c.query("update orden_compra set estado = 'en_camino', confirmada_ts = now() where id = $2 and organizacion_id = $1", [org, id]);
    return { fob: fob.rowCount ?? 0, courier };
  }).then(async (r) => {
    // Los pedidos en espera sin orden de estos productos pasan primero a esta orden (Fer, 5/11).
    const { asignarEsperas } = await import("@/lib/preventa");
    await asignarEsperas(org, id);
    return r;
  });
}

/** Prende o apaga la preventa de la orden en un canal (la web o Mercado Libre). Es el clic que autoriza a Laucen a
 *  ofrecer en preventa los productos de esta orden en ese canal. La primera vez que se prende queda la fecha: entre
 *  dos órdenes del mismo producto, se ofrece la que se publicó primero. */
export async function publicarOrden(org: string, id: number, canal: "web" | "ml", prender: boolean): Promise<void> {
  const o = await ordenCabecera(org, id);
  if (!o) throw new ErrorErp("Esa orden no existe.");
  if (prender && o.estado !== "en_camino") throw new ErrorErp(o.estado === "borrador" ? "Primero confirmá la orden." : "La orden ya se recibió.");
  if (prender && canal === "web" && !o.llegada) throw new ErrorErp("Falta la fecha de arribo para la web.");
  if (prender && canal === "ml" && !(o.llegada_ml ?? o.llegada)) throw new ErrorErp("Falta la fecha de arribo para Mercado Libre.");
  if (canal === "web") {
    await consulta("update orden_compra set publicar_web = $3, publicada_web_ts = case when $3 then coalesce(publicada_web_ts, now()) else publicada_web_ts end where id = $2 and organizacion_id = $1", [org, id, prender]);
  } else {
    await consulta("update orden_compra set publicar_ml = $3, publicada_ml_ts = case when $3 then coalesce(publicada_ml_ts, now()) else publicada_ml_ts end where id = $2 and organizacion_id = $1", [org, id, prender]);
  }
  await avisarCambioPreventa(org, id);
}

/** Algo de la orden cambió (se publicó, se confirmó, cambió una fecha): la tienda recalcula sus precios y Mercado Libre
 *  revisa las publicaciones de esos productos (lib/mercadolibre/stock.ts, que decide si pasan a preventa). */
export async function avisarCambioPreventa(org: string, ordenId: number): Promise<void> {
  const vs = await consulta<{ v: number }>(`
    select distinct coalesce(k.variacion_kit_id, l.variacion_id)::int v
      from orden_compra o join compra_invoice_linea l on l.invoice_id = o.invoice_id
      left join kit_componente k on k.variacion_componente_id = l.variacion_id
     where o.id = $1 and o.organizacion_id = $2 and l.variacion_id is not null
    union select l.variacion_id::int from orden_compra o join compra_invoice_linea l on l.invoice_id = o.invoice_id where o.id = $1 and l.variacion_id is not null`, [ordenId, org]);
  if (!vs.length) return;
  await consulta("insert into precio_web_pendiente (variacion_id, organizacion_id) select unnest($2::bigint[]), $1 on conflict (variacion_id) do update set desde = clock_timestamp()", [org, vs.map((x) => x.v)]).catch(() => {});
  const { sincronizarStockMl } = await import("@/lib/mercadolibre/stock");
  await sincronizarStockMl(org, vs.map((x) => x.v)).catch((e) => console.error("[preventa] revisar ML", e));
}

/** La compra por courier de una orden C: los renglones con su FOB y el peso por unidad (el del packing list si está,
 *  si no el de la ficha). El flete por kilo y el % courier se cargan ahí, y su botón graba el costo real. */
async function armarCompraCourier(c: PoolClient, org: string, o: FilaOrden): Promise<string> {
  const ya = (await c.query<{ id: number }>("select id::int from compra_courier where organizacion_id = $1 and nombre = $2", [org, o.codigo])).rows[0];
  const compraId = ya?.id ?? (await c.query<{ id: number }>(`insert into compra_courier (organizacion_id, nombre, proveedor, notas)
                                                            values ($1, $2, $3, $4) returning id::int`, [org, o.codigo, o.proveedor, `Orden de compra ${o.codigo}`])).rows[0].id;
  if (!ya) {
    await c.query(`
      insert into compra_courier_linea (organizacion_id, compra_id, variacion_id, sku, descripcion, cantidad, fob_unit_usd, peso_g, orden)
      select $1, $2, l.variacion_id, va.sku, coalesce(nullif(l.descripcion, ''), titulo_variacion(va.id), l.sku), l.cantidad::int, coalesce(l.precio_usd, 0),
             coalesce((select (pi.peso_kg * 1000 / pi.cantidad) from packing_item pi join packing_list pl on pl.id = pi.packing_list_id
                        where pi.variacion_id = l.variacion_id order by pi.exacto desc, pl.fecha desc nulls last, pl.id desc limit 1), p.peso_g),
             coalesce(l.fila, 0)
        from compra_invoice_linea l join variacion va on va.id = l.variacion_id join producto p on p.id = va.producto_id
       where l.invoice_id = $3`, [org, compraId, o.invoice_id]);
  }
  await c.query("update orden_compra set compra_courier_id = $3 where id = $2 and organizacion_id = $1", [org, o.id, compraId]);
  await c.query("update compra_invoice set compra_courier_id = $3 where id = $2 and organizacion_id = $1", [org, o.invoice_id, compraId]);
  return o.codigo;
}

/** Vuelve a «a revisar» una orden en camino a la que todavía no le entró nada ni tiene preventas. */
export async function volverABorrador(org: string, id: number): Promise<void> {
  const o = await ordenCabecera(org, id);
  if (!o) throw new ErrorErp("Esa orden no existe.");
  if (o.estado !== "en_camino") throw new ErrorErp("Sólo una orden en camino vuelve a revisar.");
  if (o.recibido) throw new ErrorErp("Ya se recibió mercadería de esta orden: no vuelve a revisar.");
  if (o.prevendido) throw new ErrorErp("Tiene ventas en preventa: resolvé primero esos pedidos (Ventas › Preventas).");
  await consulta("update orden_compra set estado = 'borrador', confirmada_ts = null, publicar_web = false, publicar_ml = false where id = $2 and organizacion_id = $1", [org, id]);
  if (o.invoice_id) await volverARevisar(org, o.invoice_id);
}

/** Borra una orden a revisar (y su invoice, que nació con ella). */
export async function borrarOrden(org: string, id: number): Promise<void> {
  const o = await ordenCabecera(org, id);
  if (!o) throw new ErrorErp("Esa orden no existe.");
  if (o.estado !== "borrador") throw new ErrorErp("Sólo se borra una orden a revisar: primero volvela a revisar.");
  if (await una("select 1 from recepcion where orden_compra_id = $1", [id])) throw new ErrorErp("Tiene una recepción: no se borra.");
  await enTransaccion(async (c) => {
    await c.query("delete from orden_compra where id = $2 and organizacion_id = $1", [org, id]);
    if (o.packing_list_id) await c.query("delete from packing_list where id = $1 and organizacion_id = $2", [o.packing_list_id, org]);
    if (o.invoice_id) await c.query("delete from compra_invoice where id = $1 and organizacion_id = $2", [o.invoice_id, org]);
  });
}

// ── Packing list ──────────────────────────────────────────

/** Lee el Excel del packing list (la primera hoja con cajas). */
export async function leerArchivoPacking(contenido: ArrayBuffer): Promise<PackingLeido> {
  const libro = await abrirLibro(contenido);
  let primero: PackingLeido | null = null;
  for (const h of libro.worksheets) {
    const r = leerPacking(matriz(h));
    if (r.cajas.length) return r;
    primero ??= r;
  }
  return primero ?? { cajas: [], avisos: ["El archivo no tiene hojas."], total: { unidades: 0, peso_kg: 0, cbm: 0 } };
}

/** Guarda las cajas del packing list en la orden (reemplaza las que tenía, si ninguna se recibió todavía) y el peso y
 *  volumen por unidad de cada producto (Packing lists, como siempre). Devuelve cajas, unidades y avisos. */
export async function guardarPacking(org: string, ordenId: number, archivo: string, leido: PackingLeido): Promise<{ cajas: number; unidades: number; avisos: string[] }> {
  const o = await ordenCabecera(org, ordenId);
  if (!o) throw new ErrorErp("Esa orden no existe.");
  if (!leido.cajas.length) throw new ErrorErp(leido.avisos[0] ?? "El packing list no tiene cajas.");
  if (await una("select 1 from orden_compra_caja where orden_id = $1 and recibida_ts is not null", [ordenId])) {
    throw new ErrorErp("Ya se recibieron cajas de esta orden: el packing list no se cambia.");
  }
  const avisos = [...leido.avisos];
  await enTransaccion(async (c) => {
    await c.query("delete from orden_compra_caja where orden_id = $1 and organizacion_id = $2", [ordenId, org]);
    for (const k of leido.cajas) {
      const caja = (await c.query<{ id: number }>(`insert into orden_compra_caja (organizacion_id, orden_id, numero, peso_kg, cbm, largo_cm, ancho_cm, alto_cm)
                                                   values ($1, $2, $3, $4, $5, $6, $7, $8) returning id::int`,
        [org, ordenId, k.numero, k.peso_kg, k.cbm, k.largo_cm, k.ancho_cm, k.alto_cm])).rows[0].id;
      await c.query(`insert into orden_compra_caja_item (organizacion_id, caja_id, fila, sku, descripcion, cantidad)
                     select $1, $2, x.fila, x.sku, x.descripcion, x.cantidad from jsonb_to_recordset($3::jsonb) x(fila int, sku text, descripcion text, cantidad int)`,
        [org, caja, JSON.stringify(k.items)]);
    }
    await c.query(`update orden_compra_caja_item ci set variacion_id = (
                     select va.id from variacion va where va.organizacion_id = $1 and upper(replace(va.sku, ' ', '')) = upper(replace(ci.sku, ' ', ''))
                      order by va.es_default desc, va.id limit 1)
                    where ci.organizacion_id = $1 and ci.caja_id in (select id from orden_compra_caja where orden_id = $2)`, [org, ordenId]);
    // Peso y volumen por unidad (el packing list de siempre, vinculado al invoice de la orden).
    if (o.packing_list_id) await c.query("delete from packing_list where id = $1 and organizacion_id = $2", [o.packing_list_id, org]);
    const pl = (await c.query<{ id: number }>(`insert into packing_list (organizacion_id, archivo, numero, fecha, invoice_id, via, cajas, unidades, peso_kg, cbm)
                                               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id::int`,
      [org, archivo.slice(0, 200), o.codigo, o.fecha, o.invoice_id, o.via === "maritimo" ? "barco" : "avion", leido.cajas.length, leido.total.unidades, leido.total.peso_kg, leido.total.cbm])).rows[0].id;
    await c.query(`insert into packing_item (organizacion_id, packing_list_id, sku, cantidad, peso_kg, cbm, exacto, cajas, variacion_id)
                   select $1, $2, x.sku, x.cantidad, x.peso_kg, x.cbm, x.exacto, x.cajas,
                          (select va.id from variacion va where va.organizacion_id = $1 and upper(replace(va.sku, ' ', '')) = upper(replace(x.sku, ' ', '')) order by va.es_default desc, va.id limit 1)
                     from jsonb_to_recordset($3::jsonb) x(sku text, cantidad numeric, peso_kg numeric, cbm numeric, exacto boolean, cajas text)
                    where x.cantidad > 0`, [org, pl, JSON.stringify(porUnidad(leido.cajas))]);
    await c.query("update orden_compra set packing_list_id = $3 where id = $2 and organizacion_id = $1", [org, ordenId, pl]);
  });
  // Lo que no cierra entre el packing list y la orden.
  const dif = await consulta<{ sku: string; orden: number; cajas: number }>(`
    with o as (select upper(replace(coalesce(va.sku, l.sku), ' ', '')) sku, sum(l.cantidad)::int n from compra_invoice_linea l left join variacion va on va.id = l.variacion_id
                where l.invoice_id = $2 group by 1),
         k as (select upper(replace(ci.sku, ' ', '')) sku, sum(ci.cantidad)::int n from orden_compra_caja_item ci join orden_compra_caja ca on ca.id = ci.caja_id
                where ca.orden_id = $1 group by 1)
    select coalesce(o.sku, k.sku) sku, coalesce(o.n, 0) orden, coalesce(k.n, 0) cajas from o full join k on k.sku = o.sku
     where coalesce(o.n, 0) <> coalesce(k.n, 0) order by 1 limit 20`, [ordenId, o.invoice_id]);
  for (const d of dif) avisos.push(`${d.sku}: la orden dice ${d.orden} y las cajas traen ${d.cajas}.`);
  const sinProducto = await una<{ n: number }>(`select count(*)::int n from orden_compra_caja_item ci join orden_compra_caja k on k.id = ci.caja_id
                                                 where k.orden_id = $1 and ci.variacion_id is null`, [ordenId]);
  if (sinProducto?.n) avisos.push(`${sinProducto.n} renglón${sinProducto.n === 1 ? "" : "es"} de las cajas con un SKU que no está en el sistema.`);
  return { cajas: leido.cajas.length, unidades: leido.total.unidades, avisos };
}

// ── Mercadería entrante ─────────────────────────────────────

export type Entrante = { llegando: number; prevendido: number; saldo: number; proxima_llegada: string | null; proxima_orden: string | null; proxima_orden_id: number | null; ordenes: number };

/** La mercadería entrante de cada variación (las órdenes en camino): llegando, prevendido y saldo. */
export async function entrantePorVariacion(org: string, variaciones: number[], c?: Consultor): Promise<Map<number, Entrante>> {
  if (!variaciones.length) return new Map();
  const sql = `select variacion_id::int, llegando, prevendido, saldo, proxima_llegada::text, proxima_orden, proxima_orden_id::int, ordenes
                 from entrante_variacion where organizacion_id = $1 and variacion_id = any($2::bigint[])`;
  const filas = c ? (await c.query<Entrante & { variacion_id: number }>(sql, [org, variaciones])).rows : await consulta<Entrante & { variacion_id: number }>(sql, [org, variaciones]);
  return new Map(filas.map(({ variacion_id, ...e }) => [variacion_id, e]));
}

/** SQL para sumar a una consulta de variaciones (alias `va`): llegando, prevendido y saldo entrante. */
export const SQL_ENTRANTE = (va = "va") => `
  left join lateral (select ev.llegando, ev.prevendido, ev.saldo, ev.proxima_llegada, ev.proxima_orden
                       from entrante_variacion ev where ev.variacion_id = ${va}.id) ent on true`;
