// Cambiar la forma de pago de un pedido de la tienda sin pagar (Fer, 25/10): desde la página del pedido —el
// link de los avisos del seguimiento—, el comprador que no pudo pagar con tarjeta elige otra forma (o la
// misma con otras cuotas). El precio depende de la forma de pago (descuento de contado, interés de las
// cuotas), así que el pedido se vuelve a cotizar con la MISMA cuenta que la compra (cotizar) y sus líneas se
// reemplazan como al editar un pedido: lo reservado sigue reservado. La reserva: con transferencia o
// efectivo, la de días de siempre desde hoy; con tarjeta o Mercado Pago, la que tenía.
// Sólo para los pedidos de la tienda: uno cargado a mano tiene precios pactados y no se recotiza.

import { una, consulta, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { agregarLineas, quitarLineas } from "@/lib/pedidos";
import { fijarVencimiento } from "@/lib/pedidos/reserva";
import { cotizar } from "@/lib/tienda/cotizar";
import { mediosActivos, tipoBase, type Medio } from "@/lib/tienda/medios";
import { financiacionTienda, planesDisponibles } from "@/lib/tienda/financiacion";
import type { Tienda } from "@/lib/tienda/tienda";
import { convertir, type Moneda } from "@/lib/moneda";

type PedidoTienda = {
  id: number; estado: string; estado_pago: string; metodo_envio_id: number | null; metodo_tipo: string | null; medio: string | null;
  debito: boolean | null; cuotas: number | null; provincia: string | null; cp: string | null; total: number; facturado: boolean; pagos: number;
};

async function pedidoDe(t: Tienda, codigo: string): Promise<PedidoTienda | null> {
  return una<PedidoTienda>(`
    select p.id::int, p.estado, p.estado_pago, p.metodo_envio_id::int, me.tipo metodo_tipo, p.datos_externos #>> '{tienda,medio}' medio,
           (p.datos_externos #>> '{tienda,debito}')::boolean debito, (p.datos_externos #>> '{tienda,cuotas}')::int cuotas,
           p.envio #>> '{direccion,provincia}' provincia, p.envio #>> '{direccion,codigo_postal}' cp,
           (case when p.moneda = 'USD' then p.total_usd else p.total_ars end)::float total,
           exists (select 1 from comprobante cb where cb.pedido_id = p.id and cb.estado in ('autorizado', 'pendiente')) facturado,
           (select count(*)::int from pago where pedido_id = p.id and estado = 'aprobado') pagos
      from pedido p left join metodo_envio me on me.id = p.metodo_envio_id
     where p.organizacion_id = $1 and p.canal_id = $2 and p.codigo_seguimiento = $3`, [t.organizacionId, t.canalId, codigo]);
}

/** ¿Se le puede cambiar la forma de pago? null = sí; si no, el motivo. */
function motivoNoCambia(p: PedidoTienda): string | null {
  if (p.estado === "cancelado") return "El pedido está cancelado.";
  if (p.estado_pago === "pagado" || p.pagos > 0) return "El pedido ya está pagado.";
  if (p.estado !== "nuevo" || !["pendiente", "a_cobrar"].includes(p.estado_pago)) return "El pedido ya se está preparando: escribinos y lo vemos.";
  if (p.facturado) return "El pedido ya tiene factura: escribinos y lo vemos.";
  return null;
}

/** La clave de la forma de pago actual, como las de la tienda (payway_debito para débito). */
const claveDe = (p: PedidoTienda) => (p.medio === "payway" && p.debito ? "payway_debito" : p.medio);

export type Opcion = Medio & { actual: boolean };

/** Las formas de pago que puede elegir (las de la tienda, sin cuenta corriente; efectivo, sólo si retira) y las cuotas. */
export async function opcionesDePago(t: Tienda, codigo: string): Promise<{ opciones: Opcion[]; cuotas: { cuotas: number; interes_pct: number }[]; cuotasActuales: number | null } | null> {
  const p = await pedidoDe(t, codigo);
  if (!p || motivoNoCambia(p)) return null;
  const opciones = (await mediosActivos(t))
    .filter((m) => m.tipo !== "cuenta_corriente" && (m.tipo !== "efectivo" || p.metodo_tipo === "retiro"))
    .map((m) => ({ ...m, actual: m.tipo === claveDe(p) }));
  const fin = financiacionTienda(t);
  return { opciones, cuotas: fin.activo ? planesDisponibles(fin, { medio: "payway" }) : [], cuotasActuales: p.cuotas };
}

/** Cambia la forma de pago y vuelve a cotizar. Devuelve el medio base (payway, mercadopago, transferencia, efectivo). */
export async function cambiarFormaDePago(t: Tienda, codigo: string, medio: string, cuotasPedidas: number | null): Promise<string> {
  const org = t.organizacionId;
  const p = await pedidoDe(t, codigo);
  if (!p) throw new ErrorErp("El pedido no existe.");
  const motivo = motivoNoCambia(p);
  if (motivo) throw new ErrorErp(motivo);
  const op = await opcionesDePago(t, codigo);
  const elegido = op?.opciones.find((m) => m.tipo === medio);
  if (!elegido) throw new ErrorErp("Elegí una forma de pago.");
  const conCuotas = medio === "payway" && (op?.cuotas.length ?? 0) > 0;
  const cuotas = conCuotas ? Math.max(1, Math.trunc(Number(cuotasPedidas)) || 1) : null;
  if (elegido.actual && (cuotas ?? null) === (p.cuotas ?? (conCuotas ? 1 : null))) return tipoBase(medio);

  const lineas = await consulta<{ variacion_id: number | null; cantidad: number; titulo: string }>(
    "select variacion_id::int, cantidad::int, titulo from pedido_linea where pedido_id = $1 order by orden, id", [p.id]);
  if (!lineas.length || lineas.some((l) => !l.variacion_id)) throw new ErrorErp("Este pedido no se puede cambiar desde acá: escribinos y lo vemos.");
  const cot = await cotizar(t, lineas.map((l) => ({ variacionId: l.variacion_id!, cantidad: l.cantidad })),
    { medio, cuotas, metodoEnvioId: p.metodo_envio_id, provincia: p.provincia, codigoPostal: p.cp });
  // Lo que ya está reservado para este pedido no cuenta como faltante (cot.sinStock): sólo tiene que estar a la venta.
  if (cot.lineas.length !== lineas.length) throw new ErrorErp("Algún producto del pedido ya no está a la venta: escribinos y lo vemos.");
  const envio = cot.envio?.costo ?? 0;
  const base = tipoBase(medio);

  await enTransaccion(async (c) => {
    const viejas = (await c.query<{ id: string }>("select id from pedido_linea where pedido_id = $1", [p.id])).rows.map((x) => Number(x.id));
    await quitarLineas(org, p.id, viejas, "tienda", c, "cambio de forma de pago");
    await agregarLineas(org, p.id, cot.lineas.map((l) => ({ variacion_id: l.variacionId, cantidad: l.cantidad, precio_unitario: l.finalUnit, titulo: l.titulo,
      // El precio antes de los descuentos del carrito: el pedido y la factura muestran el % de descuento (Fer, 27/10).
      datos_externos: { tienda: { precio_venta: l.ventaUnit } } })),
      "tienda", c, { nota: "cambio de forma de pago" });
    const tienda = { descuentos: cot.descuentos, subtotal: cot.subtotal, medio: base, debito: medio === "payway_debito" ? true : null, cuotas: cot.cuotas ? cot.cuotas.elegidas : null };
    await c.query(`
      update pedido set medio_pago = $3, estado_pago = $4,
             datos_externos = jsonb_set(datos_externos, '{tienda}', (coalesce(datos_externos -> 'tienda', '{}'::jsonb) - 'debito' - 'cuotas') || jsonb_strip_nulls($5::jsonb))
       where id = $1 and organizacion_id = $2`,
      [p.id, org, elegido.nombre, medio === "efectivo" ? "a_cobrar" : "pendiente", JSON.stringify(tienda)]);
    // El envío, en las dos monedas (como al editar un pedido).
    const ped = (await c.query<{ moneda: Moneda; fecha: string }>(
      "select moneda, to_char(fecha at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') fecha from pedido where id = $1", [p.id])).rows[0];
    const otro = envio ? await convertir(org, envio, ped.moneda, ped.moneda === "ARS" ? "USD" : "ARS", ped.fecha, c) : 0;
    const [envioArs, envioUsd] = ped.moneda === "ARS" ? [envio, otro] : [otro, envio];
    await c.query(`update pedido set costo_envio_ars = $2,
                     total_ars = coalesce((select sum(precio_unit_ars * cantidad) from pedido_linea where pedido_id = $1), 0) + $2,
                     total_usd = coalesce((select sum(precio_unit_usd * cantidad) from pedido_linea where pedido_id = $1), 0) + $3
                   where id = $1`, [p.id, envioArs, envioUsd]);
    const total = Number((await c.query<{ t: string }>("select case when moneda = 'USD' then total_usd else total_ars end t from pedido where id = $1", [p.id])).rows[0].t);
    const pago = await c.query("update pago set medio = $2, importe_ars = $3 where pedido_id = $1 and estado = 'pendiente'", [p.id, base, total]);
    if (!pago.rowCount) await c.query("insert into pago (organizacion_id, pedido_id, medio, estado, importe_ars) values ($1, $2, $3, 'pendiente', $4)", [org, p.id, base, total]);
    await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota) values ($1, $2, 'nuevo', 'nuevo', 'tienda', $3)`,
      [org, p.id, `El cliente cambió la forma de pago a ${elegido.nombre}${cot.cuotas && cot.cuotas.elegidas > 1 ? ` en ${cot.cuotas.elegidas} cuotas` : ""}: total ${total}`]);
  });
  // Con transferencia o efectivo, la reserva de días desde hoy (y sus recordatorios); con tarjeta o Mercado Pago, la que tenía.
  if (base === "transferencia" || base === "efectivo") await fijarVencimiento(org, p.id);
  return base;
}
