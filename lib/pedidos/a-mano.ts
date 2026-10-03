// El pedido cargado a mano ("Nuevo pedido" de Ventas › Pedidos, y el que arma
// el asistente cuando se lo piden): valida y crea por la misma función única
// que usa cualquier canal (crearPedido), así la reserva de stock, el estado y
// la facturación andan igual. La pantalla arma los datos desde su formulario;
// el asistente, desde lo que le dijeron.

import { una, ErrorErp } from "@/lib/erp/base";
import { crearPedido, cambiarEstado, type LineaEntrada } from "@/lib/pedidos";
import { confirmarPago, avisarStockMl } from "@/lib/tienda/pagos/confirmar";

/** Canales donde se carga un pedido a mano: todos menos Mercado Libre (sus
 *  pedidos entran solos) y las ventas históricas. */
export const TIPOS_A_MANO = ["local", "web_minorista", "web_mayorista", "otro"];
export const MEDIOS_A_MANO = ["Efectivo", "Transferencia", "Tarjeta de débito", "Tarjeta de crédito", "Mercado Pago", "Cheque", "Otro"];
export const PAGOS_A_MANO = ["a_convenir", "pagado", "cuenta_corriente"] as const;
export type PagoAMano = (typeof PAGOS_A_MANO)[number];

export type Direccion = {
  calle: string | null; numero: string | null; piso_depto: string | null; localidad: string | null;
  provincia: string | null; codigo_postal: string | null; referencia: string | null;
};

export type PedidoAMano = {
  canalId: number;
  /** null = consumidor final. */
  clienteId: number | null;
  /** Por variación o por SKU. Precio null = el de la lista. */
  lineas: { variacionId?: number | null; sku?: string | null; cantidad: number; precio?: number | null; descuentoPct?: number | null }[];
  pago: PagoAMano;
  medio: string | null;
  entrega: "retiro" | "envio";
  direccion?: Direccion | null;
  costoEnvio?: number | null;
  notas?: string | null;
};

/** Valida lo que no depende de la base (para mostrarlo antes de confirmar). */
export function validarPedidoAMano(p: PedidoAMano): void {
  if (!p.lineas.length) throw new ErrorErp("Agregá al menos un producto.");
  p.lineas.forEach((l, i) => {
    const n = i + 1;
    if (!l.variacionId && !l.sku) throw new ErrorErp(`Línea ${n}: falta el producto.`);
    if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) throw new ErrorErp(`Línea ${n}: la cantidad tiene que ser un entero mayor que cero.`);
    if (l.precio != null && !(l.precio >= 0)) throw new ErrorErp(`Línea ${n}: el precio no es válido.`);
  });
  if (!(PAGOS_A_MANO as readonly string[]).includes(p.pago)) throw new ErrorErp("Elegí el estado del pago.");
  if (p.medio && p.pago !== "cuenta_corriente" && !MEDIOS_A_MANO.includes(p.medio)) throw new ErrorErp(`Medio de pago desconocido (los que hay: ${MEDIOS_A_MANO.join(", ")}).`);
  if (p.pago === "pagado" && !p.medio) throw new ErrorErp("Elegí con qué pagó.");
  if (p.pago === "cuenta_corriente" && !p.clienteId) throw new ErrorErp("La cuenta corriente necesita un cliente (no consumidor final).");
  if (p.entrega === "envio" && (!p.direccion?.calle || !p.direccion?.localidad)) throw new ErrorErp("Para el envío completá al menos la calle y la localidad.");
}

/** Verifica el canal (de la organización, activo y de los que admiten pedidos a mano). */
export async function canalAMano(org: string, canalId: number) {
  const canal = await una<{ nombre: string; tipo: string; estado: string }>("select nombre, tipo, estado from canal where id = $1 and organizacion_id = $2", [canalId, org]);
  if (!canal) throw new ErrorErp("Elegí el canal.");
  if (!TIPOS_A_MANO.includes(canal.tipo)) {
    throw new ErrorErp(canal.tipo === "mercadolibre" ? "Los pedidos de Mercado Libre entran solos: no se cargan a mano." : "En ese canal no se cargan pedidos a mano.");
  }
  if (canal.estado !== "activo") throw new ErrorErp("Ese canal no está activo.");
  return canal;
}

/** Crea el pedido. Devuelve su número y el total. */
export async function crearPedidoAMano(org: string, usuarioId: string, p: PedidoAMano, origen: string = "pantalla"): Promise<{ pedidoId: number; totalArs: number }> {
  validarPedidoAMano(p);
  await canalAMano(org, p.canalId);
  if (p.clienteId && !(await una("select 1 from cliente where id = $1 and organizacion_id = $2", [p.clienteId, org]))) throw new ErrorErp("El cliente no existe.");
  const lineas: LineaEntrada[] = p.lineas.map((l) => ({
    variacion_id: l.variacionId ?? null, sku: l.variacionId ? null : l.sku ?? null, cantidad: l.cantidad,
    precio_unitario: l.precio ?? null, descuento_pct: l.descuentoPct || null,
  }));
  const creado = await crearPedido(org, {
    canalId: p.canalId,
    clienteId: p.clienteId,
    lineas,
    medio_pago: p.pago === "cuenta_corriente" ? "Cuenta corriente" : p.medio,
    // «A convenir» a mano = «A cobrar» (Fer, 3/10): reserva ya y entra en picking; se cobra al entregar.
    estado_pago: p.pago === "pagado" ? "pendiente" : p.pago === "cuenta_corriente" ? "a_convenir" : "a_cobrar",
    envio: { metodo: p.entrega === "envio" ? "Envío" : "Retira", a_mano: true, direccion: p.entrega === "envio" ? p.direccion ?? null : null },
    costo_envio: p.entrega === "envio" ? p.costoEnvio || null : null,
    notas: p.notas ?? null,
    datos_externos: { a_mano: { usuario: usuarioId, pago: p.pago, origen } },
  }, usuarioId);
  if (p.pago === "pagado") {
    // Igual que «Confirmar pago» de la ficha: queda el pago, el pedido pagado y la reserva.
    await confirmarPago(org, creado.pedidoId, { medio: p.medio!, importe: creado.total.ars }, usuarioId);
  } else if (p.pago === "cuenta_corriente") {
    // Venta cerrada a cuenta: el pedido queda confirmado (reserva el stock) y el pago, a convenir.
    await cambiarEstado(org, creado.pedidoId, "pagado", usuarioId, "a cuenta corriente");
  }
  if (creado.reservo && p.pago !== "pagado") await avisarStockMl(org, creado.pedidoId);
  return { pedidoId: creado.pedidoId, totalArs: creado.total.ars };
}
