"use server";

// Facturar un pedido desde su detalle: arma la factura y la manda a ARCA. Y
// operar los pedidos que no son de ML: confirmar el pago y cambiar el estado.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, una } from "@/lib/erp/base";
import { intentar, id, texto } from "@/lib/erp/acciones";
import { cambiarEstado, esEstadoPedido, exigirCarritoLibre, ESTADOS_PEDIDO } from "@/lib/pedidos";
import { confirmarPago, entregarYCobrar } from "@/lib/tienda/pagos/confirmar";
import { prepararFactura, emitir } from "@/lib/arca/facturar";
import { subirFacturaDelPedidoConBoton } from "@/lib/mercadolibre/facturas";
import { deFondo } from "@/lib/tareas-fondo";
import { altaOca, anularOca, envioOcaDe, seguirEnvio } from "@/lib/oca/envios";
import { cancelarPedido } from "@/lib/pedidos/cancelar";

export async function accionFacturar(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const pid = id(fd, "pedido_id");
  const volver = `/ventas/pedidos/${pid}`;
  await intentar(volver, async () => {
    if (!pid) throw new ErrorErp("El pedido no existe.");
    // prepararFactura verifica que el pedido sea de la organización (y que no
    // sea un carrito de ML en espera).
    const cid = await prepararFactura(s.org.id, pid, s.usuario.id);
    const r = await emitir(s.org.id, cid);
    revalidatePath(volver);
    revalidatePath("/administracion/facturacion");
    if (r.estado !== "autorizado") throw new ErrorErp(r.mensaje);
    return r.mensaje;
  });
}

/** "Subir factura a Mercado Libre" (clic de Fer): la factura (y la nota de
 *  crédito, si la hay) del pedido van a la cola, aunque el interruptor del
 *  canal esté apagado. */
export async function accionSubirFacturaMlPedido(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const pid = id(fd, "pedido_id");
  const volver = `/ventas/pedidos/${pid}`;
  await intentar(volver, async () => {
    if (!pid) throw new ErrorErp("El pedido no existe.");
    await exigirCarritoLibre(s.org.id, pid);
    const r = await subirFacturaDelPedidoConBoton(s.org.id, pid, s.usuario.id);
    revalidatePath(volver);
    return r;
  });
}

// ── Operación de pedidos que no son de Mercado Libre (los de ML los mueve ML) ──

/** El pedido, verificado contra la organización y que no sea de ML. */
async function pedidoOperable(org: string, pid: number) {
  const p = await una<{ estado: string; estado_pago: string; total_ars: number; canal_tipo: string }>(`
    select p.estado, p.estado_pago, p.total_ars::float, c.tipo canal_tipo
      from pedido p join canal c on c.id = p.canal_id where p.id = $1 and p.organizacion_id = $2`, [pid, org]);
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (p.canal_tipo === "mercadolibre") throw new ErrorErp("Los pedidos de Mercado Libre se manejan desde Mercado Libre (también cancelarlos): Laucen lee el cambio enseguida y lo deja igual.");
  await exigirCarritoLibre(org, pid);
  return p;
}

export async function accionConfirmarPago(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  const volver = `/ventas/pedidos/${pid}?b=op`;
  await intentar(volver, async () => {
    const p = await pedidoOperable(s.org.id, pid);
    if (!["pendiente", "a_convenir", "a_cobrar"].includes(p.estado_pago)) throw new ErrorErp("Este pedido no tiene un pago pendiente.");
    if (["cancelado", "devuelto"].includes(p.estado)) throw new ErrorErp("El pedido está cancelado.");
    const medio = texto(fd, "medio");
    if (!medio) throw new ErrorErp("Elegí con qué pagó.");
    await confirmarPago(s.org.id, pid, { medio, importe: p.total_ars }, s.usuario.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return "Pago confirmado: el pedido quedó pagado.";
  });
}

/** «Entregado y cobrado»: retiro de un pedido «A cobrar» ya preparado; confirma el cobro y lo marca entregado. */
export async function accionEntregadoYCobrado(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  const volver = `/ventas/pedidos/${pid}?b=op`;
  await intentar(volver, async () => {
    const p = await pedidoOperable(s.org.id, pid);
    if (p.estado_pago === "pagado") throw new ErrorErp("Este pedido ya está cobrado: marcalo entregado.");
    const medio = texto(fd, "medio");
    if (!medio) throw new ErrorErp("Elegí con qué pagó.");
    await entregarYCobrar(s.org.id, pid, medio, s.usuario.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    revalidatePath("/ventas/pedidos");
    return "Cobrado y entregado.";
  });
}

export async function accionCambiarEstadoPedido(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  const volver = `/ventas/pedidos/${pid}?b=op`;
  await intentar(volver, async () => {
    await pedidoOperable(s.org.id, pid);
    const nuevo = fd.get("estado");
    if (!esEstadoPedido(nuevo)) throw new ErrorErp("Estado desconocido.");
    // Cancelar va por "Cancelar pedido" (anula OCA, Payway y la factura): nunca por acá.
    if (nuevo === "cancelado") throw new ErrorErp("Para cancelar usá el botón «Cancelar pedido».");
    await cambiarEstado(s.org.id, pid, nuevo, s.usuario.id, texto(fd, "nota"));
    revalidatePath(`/ventas/pedidos/${pid}`);
    return `Pedido ${ESTADOS_PEDIDO[nuevo].toLowerCase()}.`;
  });
}

// ── OCA (Fer, 6/10): alta del envío, seguimiento y anular, de fondo ──

export async function accionAltaOca(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  return deFondo(s, `oca-alta-${pid}`, `Alta en OCA del pedido ${pid}`, async () => {
    await pedidoOperable(s.org.id, pid);
    const n = await altaOca(s.org.id, pid);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return `Pedido ${pid}: envío de OCA ${n}. Ya podés imprimir la etiqueta.`;
  });
}

export async function accionSeguirOca(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  return deFondo(s, `oca-seguir-${pid}`, `Seguimiento de OCA del pedido ${pid}`, async () => {
    const e = await envioOcaDe(s.org.id, pid);
    if (!e) throw new ErrorErp("Este pedido no tiene un envío de OCA.");
    const estado = await seguirEnvio(s.org.id, e.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return `Pedido ${pid}: ${ESTADO_OCA[estado ?? ""] ?? "sin novedades"}.`;
  });
}

export async function accionAnularOca(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  return deFondo(s, `oca-anular-${pid}`, `Anular el envío de OCA del pedido ${pid}`, async () => {
    const e = await envioOcaDe(s.org.id, pid);
    if (!e) throw new ErrorErp("Este pedido no tiene un envío de OCA.");
    const r = await anularOca(s.org.id, e.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return r;
  });
}

const ESTADO_OCA: Record<string, string> = { ready_to_ship: "todavía no salió", shipped: "en camino", delivered: "entregado", returned: "devuelto", cancelled: "anulado" };

/** "Cancelar pedido" (Fer, 6/10): cancela y anula lo que arrastra (OCA, Payway y, si se pidió, la
 *  factura con nota de crédito), de fondo. Si algo falló, el cartel sale en rojo diciendo qué. */
export async function accionCancelarPedido(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  const nc = fd.get("nc") === "1";
  return deFondo(s, `cancelar-${pid}`, `Cancelar el pedido ${pid}`, async () => {
    await pedidoOperable(s.org.id, pid);
    const r = await cancelarPedido(s.org.id, pid, s.usuario.id, { notaCredito: nc });
    revalidatePath(`/ventas/pedidos/${pid}`);
    const listo = r.hecho.join(" · ");
    if (r.fallo.length) throw new ErrorErp(`${listo}. Falló: ${r.fallo.join(" · ")}. Eso hay que hacerlo a mano desde el pedido.`);
    return `${listo}.`;
  });
}
