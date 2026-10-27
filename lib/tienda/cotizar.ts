// Cotizar un carrito de la tienda: precios (precioDe con la lista del canal),
// reglas comerciales, descuento del medio de pago, interés de las cuotas
// (esquema de cuotas y descuentos, lib/tienda/financiacion.ts) y costo de envío. Es la
// MISMA cuenta para el carrito, el checkout y el pedido que se crea (el
// precio final de cada línea va al pedido como precio_unitario).

import { consulta, ErrorErp } from "@/lib/erp/base";
import { precioDe } from "@/lib/precios";
import type { Tienda } from "@/lib/tienda/tienda";
import { cotizarOca } from "@/lib/oca/envios";
import { tcDelDia } from "@/lib/moneda";
import { financiacionTienda, planesDisponibles } from "@/lib/tienda/financiacion";
import { mediosActivos } from "@/lib/tienda/medios";

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
  /** Con el esquema de cuotas prendido y pagando con tarjeta de crédito (Payway): los planes que le
   *  tocan a la compra, lo que suman los productos antes del interés (y del descuento por pagar en N cuotas),
   *  ese descuento para cada cantidad de cuotas que lo tiene y las cuotas elegidas. */
  cuotas: { planes: { cuotas: number; interes_pct: number }[]; productos: number; descuentoPorCuotas: Record<number, number>; elegidas: number } | null;
};

type Regla = { id: number; nombre: string; condicion: Record<string, unknown>; accion: Record<string, unknown>; acumulable: boolean };

const r2 = (x: number) => Math.round(x * 100) / 100;
const numPct = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 1 });
/** El nombre de un descuento con su %, para que se lea en el resumen y en el pedido (Fer, 27/10). */
const conPct = (nombre: string, a: Record<string, unknown>) =>
  a.tipo === "descuento_pct" && !nombre.includes("%") ? `${nombre} (${numPct(Number(a.valor ?? 0))} %)` : nombre;

export async function cotizar(t: Tienda, carrito: LineaCarrito[], op: { medio?: string | null; cuotas?: number | null; metodoEnvioId?: number | null; provincia?: string | null; codigoPostal?: string | null } = {}): Promise<Cotizacion> {
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
    if (!(venta > 0)) continue; // precio cero: tampoco (nunca un pedido a $ 0)
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
    with hoy as (select (now() at time zone 'America/Argentina/Buenos_Aires')::date d)
    select id::int, nombre, condicion, accion, acumulable from regla_comercial, hoy
     where organizacion_id = $1 and activa and (canal_id is null or canal_id = $2)
       and (desde is null or desde <= hoy.d) and (hasta is null or hasta >= hoy.d)
       -- Días de la semana (1 = lunes … 7 = domingo, hora argentina); sin días, todos.
       and (coalesce(cardinality(dias), 0) = 0 or extract(isodow from hoy.d)::int = any(dias))
     order by prioridad desc, id`, [org, t.canalId]);
  let huboDescuento = false, cerrado = false;
  // Lo que se descuenta por la forma de pago (reglas de medio de pago y descuento del medio): no cuenta
  // para el envío gratis (Fer, 27/10: el que paga por transferencia no pierde el envío por el 10 %).
  let descuentoDelPago = 0;
  // Las de un medio en N cuotas (ej. miércoles y sábados −10 % en 3 cuotas) se aplican después, con las
  // cuotas: así el checkout muestra cada opción con su descuento.
  const porCuotas: { r: Regla; vale: boolean }[] = [];
  for (const r of reglas) {
    const c = r.condicion, a = r.accion;
    if (c.tipo === "medio_pago" && Number(c.cuotas) > 1) {
      if (op.medio && op.medio === c.medio && a.tipo !== "envio_bonificado") porCuotas.push({ r, vale: !cerrado && (r.acumulable || !huboDescuento) });
      continue;
    }
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
    descuentos.push({ nombre: conPct(r.nombre, a), importe });
    if (c.tipo === "medio_pago") descuentoDelPago += importe;
    huboDescuento = true;
    if (!r.acumulable) cerrado = true;
  }

  // Descuento (o recargo) del medio de pago (con el esquema de cuotas prendido, el de contado: lib/tienda/medios.ts).
  if (op.medio) {
    const m = (await mediosActivos(t)).find((x) => x.tipo === op.medio);
    const pct = Number(m?.descuento_pct ?? 0);
    if (pct) {
      const base = lineas.reduce((s, l) => s + l.montoFinal, 0);
      const importe = r2(base * pct / 100);
      descuentoDelPago += importe;
      for (const l of lineas) l.montoFinal = r2(l.montoFinal * (1 - pct / 100));
      descuentos.push({ nombre: `${pct > 0 ? "Descuento" : "Recargo"} del ${numPct(Math.abs(pct))} % por pagar con ${m!.nombre}`, importe });
    }
  }

  // Para el envío gratis: lo que compra antes de los descuentos por la forma de pago (y sin el interés de las cuotas, que va abajo).
  const paraEnvioGratis = r2(lineas.reduce((s, l) => s + l.montoFinal, 0) + descuentoDelPago);

  // Descuento por pagar en N cuotas (regla de un medio con cuotas): el de la primera regla que vale para esas cuotas.
  const productosAntesDeCuotas = r2(lineas.reduce((s, l) => s + l.montoFinal, 0));
  const descuentoCuotas = (n: number) => {
    const x = porCuotas.find((y) => y.vale && Number(y.r.condicion.cuotas) === n);
    if (!x || productosAntesDeCuotas <= 0) return null;
    const a = x.r.accion, v = Math.max(0, Number(a.valor ?? 0));
    const importe = r2(a.tipo === "descuento_pct" ? productosAntesDeCuotas * Math.min(100, v) / 100 : Math.min(productosAntesDeCuotas, v));
    return importe > 0 ? { nombre: conPct(x.r.nombre, a), importe } : null;
  };
  const elegidas = Math.trunc(Number(op.cuotas)) || 1;
  const dc = descuentoCuotas(elegidas);
  if (dc) {
    for (const l of lineas) l.montoFinal = r2(l.montoFinal - dc.importe * (l.montoFinal / productosAntesDeCuotas));
    descuentos.push(dc);
  }

  // Cuotas con tarjeta de crédito (Payway), con el esquema prendido: todos sus planes; el interés del plan elegido se suma a los productos (queda en el pedido
  // y en la factura, y es lo que se cobra).
  const fin = financiacionTienda(t);
  let cuotas: Cotizacion["cuotas"] = null;
  if (fin.activo && op.medio === "payway") {
    const planes = planesDisponibles(fin, { medio: "payway" });
    const productosSinInteres = r2(lineas.reduce((s, l) => s + l.montoFinal, 0));
    const plan = planes.find((p) => p.cuotas === elegidas);
    if (elegidas > 1 && !plan) throw new ErrorErp("Esa cantidad de cuotas no está disponible para esta compra. Elegí otra.");
    if (plan && plan.interes_pct > 0) {
      const importe = r2(productosSinInteres * plan.interes_pct / 100);
      for (const l of lineas) l.montoFinal = r2(l.montoFinal * (1 + plan.interes_pct / 100));
      descuentos.push({ nombre: `Interés por pagar en ${plan.cuotas} cuotas`, importe: -importe });
    }
    const descuentoPorCuotas: Record<number, number> = {};
    for (const n of [1, ...planes.map((p) => p.cuotas)]) { const d = descuentoCuotas(n); if (d) descuentoPorCuotas[n] = d.importe; }
    cuotas = { planes, productos: productosAntesDeCuotas, descuentoPorCuotas, elegidas: plan ? elegidas : 1 };
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
    const gratis = envioBonificado || (m.gratis_desde_ars != null && paraEnvioGratis >= Number(m.gratis_desde_ars));
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
    subtotal, descuentos, envio, total: r2(productos + (envio?.costo ?? 0)), sinStock, cuotas,
  };
}
