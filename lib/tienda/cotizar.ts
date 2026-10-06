// Cotizar un carrito de la tienda: precios (precioDe con la lista del canal),
// reglas comerciales, descuento del medio de pago y costo de envío. Es la
// MISMA cuenta para el carrito, el checkout y el pedido que se crea (el
// precio final de cada línea va al pedido como precio_unitario).

import { consulta, ErrorErp } from "@/lib/erp/base";
import { precioDe } from "@/lib/precios";
import type { Tienda } from "@/lib/tienda/tienda";
import { cotizarOca } from "@/lib/oca/envios";
import { tcDelDia } from "@/lib/moneda";

export type LineaCarrito = { variacionId: number; cantidad: number };

export type LineaCotizada = {
  variacionId: number; productoId: number; sku: string; titulo: string; foto: string | null; cantidad: number;
  disponible: number; listaUnit: number; ventaUnit: number; finalUnit: number; subtotal: number; descuentoPct: number;
};

export type Cotizacion = {
  lineas: LineaCotizada[];
  /** Suma a precio de venta (con el descuento propio de cada producto). */
  subtotal: number;
  /** Descuentos de reglas y del medio de pago, para mostrar. */
  descuentos: { nombre: string; importe: number }[];
  /** sinCp: es de OCA y falta el código postal para calcularlo. plazoDias: lo que tarda, según OCA. */
  envio: { metodoId: number | null; nombre: string | null; costo: number; bonificado: boolean; aConvenir: boolean; sinCp?: boolean; plazoDias?: number | null } | null;
  total: number;
  sinStock: string[];
};

type Regla = { id: number; nombre: string; condicion: Record<string, unknown>; accion: Record<string, unknown>; acumulable: boolean };

const r2 = (x: number) => Math.round(x * 100) / 100;

export async function cotizar(t: Tienda, carrito: LineaCarrito[], op: { medio?: string | null; metodoEnvioId?: number | null; provincia?: string | null; codigoPostal?: string | null } = {}): Promise<Cotizacion> {
  const org = t.organizacionId;
  if (!t.listaId) throw new ErrorErp("La tienda no tiene lista de precios.");
  const ids = [...new Set(carrito.filter((l) => l.cantidad > 0).map((l) => l.variacionId))];
  const datos = ids.length ? await consulta<{ id: number; producto_id: number; sku: string; titulo: string; foto: string | null; disponible: number; familias: number[] }>(`
    with recursive base as (
      select v.id, v.producto_id, v.sku, titulo_variacion(v.id) titulo, p.familia_id,
             coalesce((select url from variacion_foto where variacion_id = v.id order by orden limit 1),
                      (select url from producto_foto where producto_id = p.id order by orden limit 1)) foto,
             greatest(stock_disponible_canal($1, v.id, $2), 0) disponible
        from variacion v join producto p on p.id = v.producto_id
       where v.organizacion_id = $1 and v.id = any($3::bigint[]) and v.estado = 'activa' and p.estado = 'activo'
    ), fam as (
      select b.id vid, f.id, f.padre_id, 0 n from base b join familia f on f.id = b.familia_id
      union all select fam.vid, f.id, f.padre_id, fam.n + 1 from fam join familia f on f.id = fam.padre_id where fam.n < 20
    )
    select b.id::int, b.producto_id::int, b.sku, b.titulo, b.foto, b.disponible,
           coalesce((select array_agg(fam.id::int) from fam where fam.vid = b.id), '{}') familias
      from base b`, [org, t.canalId, ids]) : [];
  const porId = new Map(datos.map((d) => [d.id, d]));

  const lineas: (LineaCotizada & { familias: number[]; montoFinal: number })[] = [];
  const sinStock: string[] = [];
  for (const l of carrito) {
    const d = porId.get(l.variacionId);
    if (!d || l.cantidad <= 0) continue;
    const p = await precioDe(org, d.id, t.listaId);
    if (!p) continue; // sin precio en la lista: no se vende
    const venta = t.moneda === "USD" ? p.venta.usd : p.venta.ars;
    const lista = t.moneda === "USD" ? p.lista.usd : p.lista.ars;
    if (d.disponible < l.cantidad) sinStock.push(`${d.titulo}: hay ${d.disponible}`);
    lineas.push({
      variacionId: d.id, productoId: d.producto_id, sku: d.sku, titulo: d.titulo, foto: d.foto, cantidad: l.cantidad, disponible: d.disponible,
      listaUnit: lista, ventaUnit: venta, finalUnit: venta, subtotal: r2(venta * l.cantidad), descuentoPct: p.descuentoPct,
      familias: d.familias, montoFinal: r2(venta * l.cantidad),
    });
  }
  const subtotal = r2(lineas.reduce((s, l) => s + l.subtotal, 0));
  const descuentos: Cotizacion["descuentos"] = [];
  let envioBonificado = false;

  // Reglas comerciales.
  const reglas = await consulta<Regla>(`
    select id::int, nombre, condicion, accion, acumulable from regla_comercial
     where organizacion_id = $1 and activa and (canal_id is null or canal_id = $2)
       and (desde is null or desde <= current_date) and (hasta is null or hasta >= current_date)
     order by prioridad desc, id`, [org, t.canalId]);
  let huboDescuento = false, cerrado = false;
  for (const r of reglas) {
    const c = r.condicion, a = r.accion;
    const objetivo = (l: (typeof lineas)[number]) =>
      c.producto_id ? l.productoId === Number(c.producto_id) : c.familia_id ? l.familias.includes(Number(c.familia_id)) : true;
    let cumple = false;
    if (c.tipo === "cantidad_minima") cumple = lineas.filter(objetivo).reduce((s, l) => s + l.cantidad, 0) >= Number(c.cantidad ?? 0);
    // Monto mínimo: sobre lo que va quedando (después de los descuentos de reglas anteriores).
    else if (c.tipo === "monto_minimo") cumple = lineas.reduce((s, l) => s + l.montoFinal, 0) >= Number(c.monto ?? 0);
    else if (c.tipo === "medio_pago") cumple = !!op.medio && op.medio === c.medio;
    if (!cumple) continue;
    if (a.tipo === "envio_bonificado") { envioBonificado = true; descuentos.push({ nombre: r.nombre, importe: 0 }); continue; }
    if (cerrado || (!r.acumulable && huboDescuento)) continue;
    const afectadas = c.tipo === "cantidad_minima" ? lineas.filter(objetivo) : lineas;
    const base = afectadas.reduce((s, l) => s + l.montoFinal, 0);
    if (base <= 0) continue;
    let importe = 0;
    if (a.tipo === "descuento_pct") importe = base * Math.min(100, Math.max(0, Number(a.valor ?? 0))) / 100;
    else if (a.tipo === "descuento_fijo") importe = Math.min(base, Math.max(0, Number(a.valor ?? 0)));
    importe = r2(importe);
    if (importe <= 0) continue;
    for (const l of afectadas) l.montoFinal = r2(l.montoFinal - importe * (l.montoFinal / base));
    descuentos.push({ nombre: r.nombre, importe });
    huboDescuento = true;
    if (!r.acumulable) cerrado = true;
  }

  // Descuento (o recargo) del medio de pago.
  if (op.medio) {
    const m = (await consulta<{ nombre: string; descuento_pct: string }>(
      "select nombre, descuento_pct from medio_pago where organizacion_id = $1 and (canal_id is null or canal_id = $2) and tipo = $3 and activo order by canal_id nulls last limit 1",
      [org, t.canalId, op.medio]))[0];
    const pct = Number(m?.descuento_pct ?? 0);
    if (pct) {
      const base = lineas.reduce((s, l) => s + l.montoFinal, 0);
      const importe = r2(base * pct / 100);
      for (const l of lineas) l.montoFinal = r2(l.montoFinal * (1 - pct / 100));
      descuentos.push({ nombre: `${pct > 0 ? "Descuento" : "Recargo"} por pagar con ${m!.nombre}`, importe });
    }
  }
  for (const l of lineas) { l.finalUnit = r2(l.montoFinal / l.cantidad); }
  const productos = r2(lineas.reduce((s, l) => s + l.finalUnit * l.cantidad, 0));

  // Envío.
  let envio: Cotizacion["envio"] = null;
  if (op.metodoEnvioId) {
    const m = (await consulta<{ id: number; tipo: string; nombre: string; costo_ars: string; gratis_desde_ars: string | null; tarifas: Record<string, number> }>(
      "select id::int, tipo, nombre, costo_ars, gratis_desde_ars, tarifas from metodo_envio where id = $1 and organizacion_id = $2 and activo and (canal_id is null or canal_id = $3)",
      [op.metodoEnvioId, org, t.canalId]))[0];
    if (!m) throw new ErrorErp("Ese método de envío no está disponible.");
    if (m.tipo === "andreani") throw new ErrorErp("Ese método de envío todavía no está disponible.");
    const esOca = m.tipo === "oca" || m.tipo === "oca_sucursal";
    let costo = m.tipo === "tarifa_fija" ? Number(m.costo_ars)
      : m.tipo === "por_provincia" ? Number(m.tarifas?.[op.provincia ?? ""] ?? m.tarifas?.["*"] ?? m.costo_ars) : 0;
    let sinCp = false, plazoDias: number | null = null;
    const gratis = envioBonificado || (m.gratis_desde_ars != null && productos >= Number(m.gratis_desde_ars));
    if (esOca && !gratis) {
      // OCA cotiza en pesos con el peso y las medidas del carrito; "Costo $" del método se suma (embalaje).
      if (!op.codigoPostal?.trim()) sinCp = true;
      else {
        const tc = t.moneda === "USD" ? (await tcDelDia(org))?.venta ?? null : 1;
        if (!tc) throw new ErrorErp("No pudimos calcular el envío ahora. Probá en un rato.");
        const r = await cotizarOca(org, m.tipo, lineas.map((l) => ({ variacionId: l.variacionId, cantidad: l.cantidad })), op.codigoPostal, productos * tc);
        if (!r.ok) {
          console.error("[oca] cotizar", r.motivo);
          throw new ErrorErp("No pudimos calcular el envío de OCA a ese código postal. Revisalo o elegí otra forma de entrega.");
        }
        costo = (r.datos.total + Number(m.costo_ars || 0)) / tc;
        plazoDias = r.datos.plazoDias;
      }
    }
    if (gratis) costo = 0;
    envio = { metodoId: m.id, nombre: m.nombre, costo: r2(costo), bonificado: gratis && m.tipo !== "retiro", aConvenir: m.tipo === "a_convenir", sinCp, plazoDias };
  }
  return {
    lineas: lineas.map(({ familias: _f, montoFinal: _m, ...l }) => ({ ...l, subtotal: r2(l.finalUnit * l.cantidad) })),
    subtotal, descuentos, envio, total: r2(productos + (envio?.costo ?? 0)), sinStock,
  };
}
