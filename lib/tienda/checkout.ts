// Cerrar una compra de la tienda: vuelve a cotizar (los precios y el stock
// del momento), crea el pedido con crearPedido (cliente invitado o con
// cuenta) y deja el pago pendiente. Según el medio:
//   mercadopago → devuelve la dirección de pago de MP
//   payway      → el cobro con tarjeta lo hace cobrarConPayway (token del navegador)
//   transferencia → pendiente hasta que el operador lo confirma
//   efectivo → «A cobrar»: reserva el stock ya y entra en picking; se cobra al retirar
//   cuenta_corriente → "a convenir" (sólo clientes habilitados): también reserva ya

import { randomBytes } from "node:crypto";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { crearPedido } from "@/lib/pedidos";
import { cotizar, type LineaCarrito } from "@/lib/tienda/cotizar";
import { planesDelCarrito } from "@/lib/tienda/cuotas";
import { crearPreferencia } from "@/lib/tienda/pagos/mercadopago";
import { cobrar } from "@/lib/tienda/pagos/payway";
import { confirmarPago, pagoFallido, avisarStockMl } from "@/lib/tienda/pagos/confirmar";
import { nombreTienda, rutaTienda, type Tienda } from "@/lib/tienda/tienda";

export type DatosCompra = {
  carrito: LineaCarrito[];
  cliente: { nombre: string; email: string; telefono?: string | null; documento?: string | null; cuit?: string | null; razon_social?: string | null; condicion_iva?: string | null };
  entrega: { metodoEnvioId: number; calle?: string | null; numero?: string | null; piso_depto?: string | null; localidad?: string | null; provincia?: string | null; codigo_postal?: string | null; referencia?: string | null };
  medio: "mercadopago" | "payway" | "transferencia" | "efectivo" | "cuenta_corriente";
  notas?: string | null;
};

export type Medio = { id: number; tipo: string; nombre: string; descuento_pct: number; instrucciones: string | null };

export function mediosActivos(t: Tienda) {
  return consulta<Medio>(`select distinct on (tipo) id::int, tipo, nombre, descuento_pct::float, instrucciones from medio_pago
                           where organizacion_id = $1 and (canal_id is null or canal_id = $2) and activo order by tipo, canal_id nulls last`, [t.organizacionId, t.canalId]);
}

async function credencial(t: Tienda, tipo: string): Promise<{ medioId: number; datos: Record<string, string> }> {
  const r = await una<{ id: string; datos: Record<string, string> }>(`
    select m.id, c.datos from medio_pago m join medio_pago_credencial c on c.medio_pago_id = m.id
     where m.organizacion_id = $1 and (m.canal_id is null or m.canal_id = $2) and m.tipo = $3 and m.activo order by m.canal_id nulls last limit 1`,
    [t.organizacionId, t.canalId, tipo]);
  if (!r) throw new ErrorErp("Ese medio de pago no está disponible ahora. Elegí otro.");
  return { medioId: Number(r.id), datos: r.datos };
}

/** Crea el pedido. Devuelve a dónde seguir. */
export async function comprar(t: Tienda, d: DatosCompra, op: { origen: string; clienteId?: number | null }) {
  const org = t.organizacionId;
  if (t.estado !== "activo") throw new ErrorErp("La tienda no está tomando pedidos en este momento.");
  if (!d.carrito.length) throw new ErrorErp("El carrito está vacío.");
  if (!d.cliente.nombre?.trim() || !/^\S+@\S+\.\S+$/.test(d.cliente.email ?? "")) throw new ErrorErp("Completá tu nombre y un mail válido.");
  const medios = await mediosActivos(t);
  const medio = medios.find((m) => m.tipo === d.medio);
  if (!medio) throw new ErrorErp("Elegí un medio de pago.");
  if (d.medio === "cuenta_corriente") {
    const ok = op.clienteId ? await una("select 1 from cliente where id = $1 and organizacion_id = $2 and cuenta_corriente", [op.clienteId, org]) : null;
    if (!ok) throw new ErrorErp("La cuenta corriente es sólo para clientes habilitados: ingresá con tu cuenta o elegí otro medio.");
  }
  const cot = await cotizar(t, d.carrito, { medio: d.medio, metodoEnvioId: d.entrega.metodoEnvioId, provincia: d.entrega.provincia });
  if (!cot.lineas.length) throw new ErrorErp("Ninguno de los productos del carrito está disponible.");
  if (cot.sinStock.length) throw new ErrorErp(`No alcanza el stock: ${cot.sinStock.join("; ")}. Ajustá las cantidades.`);
  if (!cot.envio) throw new ErrorErp("Elegí cómo lo recibís.");
  const metodo = await una<{ tipo: string }>("select tipo from metodo_envio where id = $1", [d.entrega.metodoEnvioId]);
  if (metodo?.tipo !== "retiro" && metodo?.tipo !== "a_convenir" && (!d.entrega.calle || !d.entrega.localidad || !d.entrega.provincia)) {
    throw new ErrorErp("Completá la dirección de entrega (calle, localidad y provincia).");
  }

  const codigo = randomBytes(6).toString("base64url");
  const doc = d.cliente.documento?.replace(/\D/g, "") || null;
  const pedido = await crearPedido(org, {
    canalId: t.canalId,
    clienteId: op.clienteId ?? null,
    cliente: op.clienteId ? null : {
      nombre: d.cliente.razon_social?.trim() || d.cliente.nombre.trim(), razon_social: d.cliente.razon_social?.trim() || null,
      email: d.cliente.email.trim().toLowerCase(), telefono: d.cliente.telefono?.trim() || null,
      documento_tipo: doc ? (doc.length === 11 ? "CUIT" : "DNI") : null, documento_numero: doc, cuit: d.cliente.cuit ?? (doc?.length === 11 ? doc : null),
      condicion_iva: d.cliente.condicion_iva ?? null,
      direccion: d.entrega.calle ? { calle: d.entrega.calle, numero: d.entrega.numero ?? undefined, piso_depto: d.entrega.piso_depto ?? undefined,
        localidad: d.entrega.localidad ?? undefined, provincia: d.entrega.provincia ?? undefined, codigo_postal: d.entrega.codigo_postal ?? undefined } : null,
    },
    moneda: t.moneda,
    lineas: cot.lineas.map((l) => ({ variacion_id: l.variacionId, cantidad: l.cantidad, precio_unitario: l.finalUnit, titulo: l.titulo })),
    medio_pago: medio.nombre,
    estado_pago: d.medio === "cuenta_corriente" ? "a_convenir" : d.medio === "efectivo" ? "a_cobrar" : "pendiente",
    costo_envio: cot.envio.costo,
    metodo_envio_id: cot.envio.metodoId,
    envio: { metodo: cot.envio.nombre, a_convenir: cot.envio.aConvenir, bonificado: cot.envio.bonificado, direccion: metodo?.tipo === "retiro" ? null : {
      calle: d.entrega.calle, numero: d.entrega.numero, piso_depto: d.entrega.piso_depto, localidad: d.entrega.localidad,
      provincia: d.entrega.provincia, codigo_postal: d.entrega.codigo_postal, referencia: d.entrega.referencia } },
    notas: d.notas?.trim() || null,
    datos_externos: { tienda: { descuentos: cot.descuentos, medio: d.medio, subtotal: cot.subtotal } },
  }, op.clienteId ? `cliente:${op.clienteId}` : "tienda");
  await consulta("update pedido set codigo_seguimiento = $3 where id = $1 and organizacion_id = $2", [pedido.pedidoId, org, codigo]);
  if (pedido.reservo) await avisarStockMl(org, pedido.pedidoId);
  await consulta(`insert into pago (organizacion_id, pedido_id, medio, estado, importe_ars) values ($1, $2, $3, 'pendiente', $4)`,
    [org, pedido.pedidoId, d.medio, cot.total]);

  const seguir = `${op.origen}${rutaTienda(t, `/pedido/${codigo}`)}`;
  if (d.medio === "mercadopago") {
    const cred = await credencial(t, "mercadopago");
    const planes = await planesDelCarrito(org, cot.lineas.map((l) => l.variacionId));
    const pref = await crearPreferencia(cred.datos.access_token, {
      pedidoId: pedido.pedidoId, titulo: `${nombreTienda(t)} — pedido ${pedido.pedidoId}`, total: cot.total, email: d.cliente.email, nombre: d.cliente.nombre,
      maxCuotas: planes.length ? planes[planes.length - 1].cuotas : null,
      exito: seguir, fallo: `${seguir}?pago=fallo`, pendiente: seguir, aviso: `${op.origen}/api/tienda/mercadopago?medio=${cred.medioId}`,
    });
    return { pedidoId: pedido.pedidoId, codigo, total: cot.total, ir: pref.url };
  }
  return { pedidoId: pedido.pedidoId, codigo, total: cot.total, ir: d.medio === "payway" ? `${seguir}?pagar=1` : seguir };
}

/** Cobra con Payway un pedido de la tienda (con el token de la tarjeta que armó el navegador). */
export async function cobrarConPayway(t: Tienda, codigo: string, tarjeta: { token: string; bin: string; marca: number; cuotas: number }) {
  const org = t.organizacionId;
  const p = await una<{ id: number; total_ars: string; estado: string; estado_pago: string; email: string | null; cliente_id: number | null }>(`
    select p.id::int, p.total_ars, p.estado, p.estado_pago, cl.email, p.cliente_id::int from pedido p left join cliente cl on cl.id = p.cliente_id
     where p.organizacion_id = $1 and p.canal_id = $2 and p.codigo_seguimiento = $3`, [org, t.canalId, codigo]);
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (p.estado_pago === "pagado") return { aprobado: true, detalle: "Ya estaba pagado." };
  if (p.estado === "cancelado") throw new ErrorErp("El pedido está cancelado.");
  const planes = await planesDelCarrito(org, (await consulta<{ v: number }>("select variacion_id::int v from pedido_linea where pedido_id = $1 and variacion_id is not null", [p.id])).map((x) => x.v));
  if (tarjeta.cuotas > 1 && !planes.some((pl) => pl.cuotas === tarjeta.cuotas)) throw new ErrorErp("Esa cantidad de cuotas no está disponible para estos productos.");
  const cred = await credencial(t, "payway");
  const r = await cobrar({ private_key: cred.datos.private_key, ambiente: cred.datos.ambiente }, {
    pedidoId: p.id, token: tarjeta.token, bin: tarjeta.bin, marca: tarjeta.marca, total: Number(p.total_ars), cuotas: tarjeta.cuotas, email: p.email, clienteId: p.cliente_id,
  });
  if (r.aprobado) await confirmarPago(org, p.id, { medio: "payway", idExterno: r.id, importe: Number(p.total_ars), cuotas: tarjeta.cuotas, detalle: r.detalle, crudo: r.crudo }, "tienda");
  else await pagoFallido(org, p.id, "payway", r.id, "rechazado", r.detalle, r.crudo);
  return { aprobado: r.aprobado, detalle: r.detalle };
}
