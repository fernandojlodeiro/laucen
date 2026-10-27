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
import { sucursalesOca } from "@/lib/oca/envios";
import { cotizar, type LineaCarrito } from "@/lib/tienda/cotizar";
import { mediosActivos, tipoBase } from "@/lib/tienda/medios";
import { planesDelCarrito } from "@/lib/tienda/cuotas";
import { codigoPayway, financiacionTienda, marcasPermitidas, planesDisponibles, MARCAS_DEBITO } from "@/lib/tienda/financiacion";
import { crearPreferencia } from "@/lib/tienda/pagos/mercadopago";
import { cobrar } from "@/lib/tienda/pagos/payway";
import { confirmarPago, pagoFallido, avisarStockMl } from "@/lib/tienda/pagos/confirmar";
import { nombreTienda, type Tienda } from "@/lib/tienda/tienda";
import { urlPanel } from "@/lib/tienda/dominios";
import { urlTienda } from "@/lib/tienda/dominios-tienda";

export type DatosCompra = {
  carrito: LineaCarrito[];
  cliente: { nombre: string; email: string; telefono?: string | null; documento?: string | null; cuit?: string | null; razon_social?: string | null; condicion_iva?: string | null;
    /** Con «Necesito factura A»: el domicilio fiscal. */
    fiscal?: { calle: string; localidad: string; provincia: string; codigo_postal: string } | null; // calle, localidad y CP pueden venir vacíos
    /** «Prefiero recibir la factura por»: mail y/o WhatsApp (cliente.factura_por_mail / factura_por_whatsapp). */
    facturaPorMail?: boolean; facturaPorWhatsapp?: boolean };
  entrega: { metodoEnvioId: number; calle?: string | null; numero?: string | null; piso_depto?: string | null; localidad?: string | null; provincia?: string | null; codigo_postal?: string | null; referencia?: string | null; sucursalOca?: string | null };
  /** payway_debito: Payway con tarjeta de débito en un pago (el descuento de contado del esquema de cuotas). */
  medio: "mercadopago" | "payway" | "payway_debito" | "transferencia" | "efectivo" | "cuenta_corriente";
  /** Con tarjeta de crédito y el esquema de cuotas prendido: las cuotas elegidas (el interés va al total). */
  cuotas?: number | null;
  notas?: string | null;
};

export { mediosActivos, type Medio } from "@/lib/tienda/medios";

async function credencial(t: Tienda, tipo: string): Promise<{ medioId: number; datos: Record<string, string> }> {
  const r = await una<{ id: string; datos: Record<string, string> }>(`
    select m.id, c.datos from medio_pago m join medio_pago_credencial c on c.medio_pago_id = m.id
     where m.organizacion_id = $1 and (m.canal_id is null or m.canal_id = $2) and m.tipo = $3 and m.activo order by m.canal_id nulls last limit 1`,
    [t.organizacionId, t.canalId, tipo]);
  if (!r) throw new ErrorErp("Ese medio de pago no está disponible ahora. Elegí otro.");
  return { medioId: Number(r.id), datos: r.datos };
}

/** Crea el pedido. Devuelve a dónde seguir. */
export async function comprar(t: Tienda, d: DatosCompra, op: { clienteId?: number | null }) {
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
  const cot = await cotizar(t, d.carrito, { medio: d.medio, cuotas: d.cuotas ?? null, metodoEnvioId: d.entrega.metodoEnvioId, provincia: d.entrega.provincia, codigoPostal: d.entrega.codigo_postal });
  if (!cot.lineas.length) throw new ErrorErp("Ninguno de los productos del carrito está disponible.");
  if (cot.sinStock.length) throw new ErrorErp(`No alcanza el stock: ${cot.sinStock.join("; ")}. Ajustá las cantidades.`);
  if (!cot.envio) throw new ErrorErp("Elegí cómo lo recibís.");
  const metodo = await una<{ tipo: string }>("select tipo from metodo_envio where id = $1", [d.entrega.metodoEnvioId]);
  if (metodo?.tipo !== "retiro" && metodo?.tipo !== "a_convenir" && (!d.entrega.calle || !d.entrega.localidad || !d.entrega.provincia)) {
    throw new ErrorErp("Completá la dirección de entrega (calle, localidad y provincia).");
  }
  if (cot.envio.sinCp) throw new ErrorErp("Poné tu código postal para calcular el envío.");
  // OCA a sucursal: la sucursal elegida tiene que ser una de las de ese código postal.
  let sucursalOca: { id: string; nombre: string; direccion: string } | null = null;
  if (metodo?.tipo === "oca_sucursal") {
    const s = (await sucursalesOca(d.entrega.codigo_postal ?? "")).find((x) => x.id === d.entrega.sucursalOca);
    if (!s) throw new ErrorErp("Elegí la sucursal de OCA donde lo retirás.");
    sucursalOca = { id: s.id, nombre: s.nombre, direccion: [s.direccion, s.localidad, s.provincia].filter(Boolean).join(", ") };
  }

  const codigo = randomBytes(6).toString("base64url");
  const doc = d.cliente.documento?.replace(/\D/g, "") || null;
  const pedido = await crearPedido(org, {
    canalId: t.canalId,
    clienteId: op.clienteId ?? null,
    cliente: op.clienteId ? null : {
      nombre: d.cliente.razon_social?.trim() || d.cliente.nombre.trim(), razon_social: d.cliente.razon_social?.trim() || null,
      // El teléfono del checkout es el WhatsApp: va como celular (cliente.whatsapp si parece uno).
      email: d.cliente.email.trim().toLowerCase(), telefono_movil: d.cliente.telefono?.trim() || null,
      documento_tipo: doc ? (doc.length === 11 ? "CUIT" : "DNI") : null, documento_numero: doc, cuit: d.cliente.cuit ?? (doc?.length === 11 ? doc : null),
      condicion_iva: d.cliente.condicion_iva ?? null,
      // La fiscal, la de la factura A; la de envío, la de la entrega.
      direccion: d.cliente.fiscal ? { calle: d.cliente.fiscal.calle || undefined, localidad: d.cliente.fiscal.localidad || undefined, provincia: d.cliente.fiscal.provincia, codigo_postal: d.cliente.fiscal.codigo_postal || undefined } : null,
      direccion_envio: d.entrega.calle ? { calle: d.entrega.calle, numero: d.entrega.numero ?? undefined, piso_depto: d.entrega.piso_depto ?? undefined,
        localidad: d.entrega.localidad ?? undefined, provincia: d.entrega.provincia ?? undefined, codigo_postal: d.entrega.codigo_postal ?? undefined } : null,
    },
    moneda: t.moneda,
    lineas: cot.lineas.map((l) => ({ variacion_id: l.variacionId, cantidad: l.cantidad, precio_unitario: l.finalUnit, titulo: l.titulo,
      // El precio antes de los descuentos del carrito: el pedido y la factura muestran el % de descuento (Fer, 27/10).
      datos_externos: { tienda: { precio_venta: l.ventaUnit } } })),
    medio_pago: medio.nombre,
    estado_pago: d.medio === "cuenta_corriente" ? "a_convenir" : d.medio === "efectivo" ? "a_cobrar" : "pendiente",
    costo_envio: cot.envio.costo,
    metodo_envio_id: cot.envio.metodoId,
    envio: { metodo: cot.envio.nombre, a_convenir: cot.envio.aConvenir, bonificado: cot.envio.bonificado, direccion: metodo?.tipo === "retiro" ? null : {
      calle: d.entrega.calle, numero: d.entrega.numero, piso_depto: d.entrega.piso_depto, localidad: d.entrega.localidad,
      provincia: d.entrega.provincia, codigo_postal: d.entrega.codigo_postal, referencia: d.entrega.referencia }, sucursal_oca: sucursalOca },
    notas: d.notas?.trim() || null,
    // medio: el de medio_pago (payway_debito → payway, con debito: true); cuotas: las elegidas con el esquema de cuotas (el pago las respeta).
    // contacto: quién compró y cómo ubicarlo EN ESTA compra. El cliente puede ser una empresa ya cargada
    // (se la encuentra por el CUIT) con otro mail: los avisos del pedido van a lo que escribió el comprador
    // (Fer, 25/10: con el CUIT de Virtual Argentina, el mail le llegaba a otra persona).
    datos_externos: { tienda: { descuentos: cot.descuentos, medio: tipoBase(d.medio), subtotal: cot.subtotal, dominio: t.dominio,
      contacto: { nombre: d.cliente.nombre.trim(), email: d.cliente.email.trim().toLowerCase(), telefono: d.cliente.telefono?.trim() || null,
        factura_mail: d.cliente.facturaPorMail ?? true, factura_whatsapp: d.cliente.facturaPorWhatsapp ?? false },
      ...(d.medio === "payway_debito" ? { debito: true } : {}), ...(cot.cuotas ? { cuotas: cot.cuotas.elegidas } : {}) } },
  }, op.clienteId ? `cliente:${op.clienteId}` : "tienda");
  await consulta("update pedido set codigo_seguimiento = $3 where id = $1 and organizacion_id = $2", [pedido.pedidoId, org, codigo]);
  // Cómo quiere la factura y, con factura A, sus datos fiscales (también si ya era cliente).
  if (pedido.clienteId) {
    await consulta(`update cliente set factura_por_mail = $3, factura_por_whatsapp = $4,
                           whatsapp = coalesce(whatsapp, whatsapp_normal($5)),
                           razon_social = coalesce($6, razon_social), cuit = coalesce($7, cuit), condicion_iva = coalesce($8, condicion_iva)
                     where id = $1 and organizacion_id = $2`,
      [pedido.clienteId, org, d.cliente.facturaPorMail ?? true, d.cliente.facturaPorWhatsapp ?? false, d.cliente.telefono?.trim() || null,
       d.cliente.fiscal ? d.cliente.razon_social?.trim() || null : null, d.cliente.fiscal ? d.cliente.cuit ?? null : null, d.cliente.fiscal ? d.cliente.condicion_iva ?? null : null]);
    if (d.cliente.fiscal && op.clienteId) {
      await consulta(`insert into cliente_direccion (organizacion_id, cliente_id, etiqueta, calle, localidad, provincia, codigo_postal, pais, principal)
                      select $1, $2, 'Fiscal', $3, $4, $5, $6, 'AR', false
                       where not exists (select 1 from cliente_direccion where cliente_id = $2 and etiqueta = 'Fiscal' and lower(coalesce(calle, '')) = lower(coalesce($3, '')))`,
        [org, pedido.clienteId, d.cliente.fiscal.calle || null, d.cliente.fiscal.localidad || null, d.cliente.fiscal.provincia, d.cliente.fiscal.codigo_postal || null]);
    }
  }
  if (pedido.reservo) await avisarStockMl(org, pedido.pedidoId);
  // "Recibimos tu pedido", por la cola de los avisos (sale en un minuto): el mail, a todos; el WhatsApp, a los que
  // esperan el pago (lib/pedidos/seguimiento.ts). Si paga antes con tarjeta, no sale: le llega el de pago confirmado.
  await consulta(`insert into correo_cola (organizacion_id, pedido_id, tipo) values ($1, $2, 'recibido') on conflict (pedido_id, tipo) do nothing`, [org, pedido.pedidoId]);
  await consulta(`insert into pago (organizacion_id, pedido_id, medio, estado, importe_ars) values ($1, $2, $3, 'pendiente', $4)`,
    [org, pedido.pedidoId, tipoBase(d.medio), cot.total]);

  // La vuelta del comprador, a la dirección pública de la tienda; el aviso
  // de Mercado Pago (de servidor a servidor), al panel, que siempre anda.
  const seguir = await urlTienda(t, `/pedido/${codigo}`);
  if (d.medio === "mercadopago") {
    const cred = await credencial(t, "mercadopago");
    const planes = await planesDeLaCompra(t, cot.lineas.map((l) => l.variacionId));
    const pref = await crearPreferencia(cred.datos.access_token, {
      pedidoId: pedido.pedidoId, titulo: `${nombreTienda(t)} — pedido ${pedido.pedidoId}`, total: cot.total, email: d.cliente.email, nombre: d.cliente.nombre,
      maxCuotas: planes.length ? planes[planes.length - 1].cuotas : null,
      exito: seguir, fallo: `${seguir}?pago=fallo`, pendiente: seguir, aviso: `${urlPanel()}/api/tienda/mercadopago?medio=${cred.medioId}`,
    });
    return { pedidoId: pedido.pedidoId, codigo, total: cot.total, ir: pref.url };
  }
  return { pedidoId: pedido.pedidoId, codigo, total: cot.total, ir: tipoBase(d.medio) === "payway" ? `${seguir}?pagar=1` : seguir };
}

/** Cobra con Payway un pedido de la tienda (con el token de la tarjeta que armó el navegador). */
export async function cobrarConPayway(t: Tienda, codigo: string, tarjeta: { token: string; bin: string; marca: number; cuotas: number }) {
  const org = t.organizacionId;
  const p = await una<{ id: number; total_ars: string; estado: string; estado_pago: string; email: string | null; cliente_id: number | null;
    tienda: { subtotal?: number; cuotas?: number; debito?: boolean } | null }>(`
    select p.id::int, p.total_ars, p.estado, p.estado_pago, cl.email, p.cliente_id::int, p.datos_externos -> 'tienda' tienda
      from pedido p left join cliente cl on cl.id = p.cliente_id
     where p.organizacion_id = $1 and p.canal_id = $2 and p.codigo_seguimiento = $3`, [org, t.canalId, codigo]);
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (p.estado_pago === "pagado") return { aprobado: true, detalle: "Ya estaba pagado." };
  if (p.estado === "cancelado") throw new ErrorErp("El pedido está cancelado.");
  if (p.tienda?.debito) {
    // Con el descuento de débito: sólo tarjeta de débito y en un pago.
    if (!MARCAS_DEBITO.includes(tarjeta.marca)) throw new ErrorErp("Elegiste pagar con débito (con descuento): usá una tarjeta de débito.");
    if (tarjeta.cuotas !== 1) throw new ErrorErp("Con débito es en un pago.");
  } else if (p.tienda?.cuotas) {
    // Las cuotas se eligieron al comprar y su interés ya está en el total del pedido.
    if (tarjeta.cuotas !== p.tienda.cuotas) throw new ErrorErp(`Elegiste ${p.tienda.cuotas === 1 ? "un pago" : `${p.tienda.cuotas} cuotas`} al comprar: el pago es así.`);
    if (!marcasPermitidas(financiacionTienda(t), false, p.tienda.cuotas)(tarjeta.marca)) {
      throw new ErrorErp(p.tienda.cuotas > 1 ? "En cuotas sin interés, sólo con Visa o Mastercard de crédito. Con otra tarjeta podés pagar en cuotas con Mercado Pago." : "Con tarjeta de débito elegí la opción «Tarjeta de débito» (tiene descuento).");
    }
  } else {
    const vars = (await consulta<{ v: number }>("select variacion_id::int v from pedido_linea where pedido_id = $1 and variacion_id is not null", [p.id])).map((x) => x.v);
    const planes = await planesDeLaCompra(t, vars, "payway");
    if (tarjeta.cuotas > 1 && !planes.some((pl) => pl.cuotas === tarjeta.cuotas)) throw new ErrorErp("Esa cantidad de cuotas no está disponible para estos productos.");
  }
  const cred = await credencial(t, "payway");
  const r = await cobrar({ private_key: cred.datos.private_key, ambiente: cred.datos.ambiente }, {
    // A Payway va el código del plan (ej. 13 = 3 cuotas MiPyME), no siempre la cantidad de cuotas.
    pedidoId: p.id, token: tarjeta.token, bin: tarjeta.bin, marca: tarjeta.marca, total: Number(p.total_ars), cuotas: codigoPayway(financiacionTienda(t), tarjeta.cuotas), email: p.email, clienteId: p.cliente_id,
  });
  if (r.aprobado) await confirmarPago(org, p.id, { medio: "payway", idExterno: r.id, importe: Number(p.total_ars), cuotas: tarjeta.cuotas, detalle: r.detalle, crudo: r.crudo }, "tienda");
  else await pagoFallido(org, p.id, "payway", r.id, "rechazado", r.detalle, r.crudo);
  return { aprobado: r.aprobado, detalle: r.detalle };
}

/** Los planes de cuotas de una compra: con el esquema de cuotas prendido, todos los suyos
 *  (lib/tienda/financiacion.ts; con `medio`, sólo los que se cobran por ahí); si no, los que
 *  comparten todos sus productos. */
export async function planesDeLaCompra(t: Tienda, variaciones: number[], medio?: "payway" | "mercadopago") {
  const f = financiacionTienda(t);
  return f.activo ? planesDisponibles(f, { medio }) : planesDelCarrito(t.organizacionId, variaciones);
}
