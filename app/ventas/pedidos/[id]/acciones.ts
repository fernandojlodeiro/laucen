"use server";

// Facturar un pedido desde su detalle: arma la factura y la manda a ARCA. Y
// operar los pedidos que no son de ML: confirmar el pago y cambiar el estado.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, una, consulta, motivoErp } from "@/lib/erp/base";
import { supabaseServer } from "@/lib/supabase";
import { intentar, id, texto } from "@/lib/erp/acciones";
import { cambiarEstado, esEstadoPedido, exigirCarritoLibre, ESTADOS_PEDIDO, sqlEstadoPago } from "@/lib/pedidos";
import { confirmarPago, entregarYCobrar } from "@/lib/tienda/pagos/confirmar";
import { prepararFactura, emitir } from "@/lib/arca/facturar";
import { refacturar, liberarFactura, LARGO_LEYENDA, sqlFacturaVigente } from "@/lib/facturacion/revision";
import { cambiarClientePedido } from "@/lib/pedidos/cliente";
import { conciliarComprobante, confirmarCandidato, descartarCandidatos } from "@/lib/pagos/comprobante";
import { tienePermiso } from "@/lib/permisos";
import { subirFacturaDelPedidoConBoton } from "@/lib/mercadolibre/facturas";
import { deFondo } from "@/lib/tareas-fondo";
import { pasarAPedido, pasarAPresupuesto, cambiarVigencia } from "@/lib/pedidos/presupuestos";
import { altaOca, anularOca, envioOcaDe, seguirEnvio } from "@/lib/oca/envios";
import { cancelarPedido } from "@/lib/pedidos/cancelar";
import { clientePresenteRetira, clientePresenteRetiraMl } from "@/lib/pedidos/retiro";
import { reactivarPedido } from "@/lib/pedidos/reserva";

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
    // Una persona la facturó: si estaba retenida (lib/facturacion/revision.ts), ya no.
    if (r.estado === "autorizado") await liberarFactura(s.org.id, pid);
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

// ── Presupuestos (Fer, 7/10) ──

export async function accionPasarAPedido(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  return deFondo(s, `presupuesto-a-pedido-${pid}`, `Presupuesto ${pid} a pedido`, async () => {
    await pasarAPedido(s.org.id, pid, s.usuario.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return `El presupuesto ${pid} ya es un pedido: el stock quedó reservado y el pago, pendiente.`;
  });
}

export async function accionPasarAPresupuesto(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  return deFondo(s, `pedido-a-presupuesto-${pid}`, `Pedido ${pid} a presupuesto`, async () => {
    await pasarAPresupuesto(s.org.id, pid, s.usuario.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return `El pedido ${pid} pasó a presupuesto: se liberó el stock reservado.`;
  });
}

export async function accionVigenciaPresupuesto(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  await intentar(`/ventas/pedidos/${pid}?b=op`, async () => {
    await cambiarVigencia(s.org.id, pid, String(fd.get("vigencia") ?? ""));
    revalidatePath(`/ventas/pedidos/${pid}`);
    return "Vigencia cambiada.";
  });
}

/** «Cliente presente: retira» (Fer, 7/10): cobra si se paga al retirar, entrega y factura si falta. En una venta
 *  de Mercado Libre sin envío, además le avisa a ML que se concretó (lib/pedidos/retiro.ts). */
export async function accionClientePresente(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  await intentar(`/ventas/pedidos/${pid}?b=op`, () => retirar(s.org.id, pid, s.usuario.id, texto(fd, "medio")));
}

/** «Cliente presente: retira»: entregado, factura si falta (y, en Mercado Libre, el aviso a ML). Lo usan el botón
 *  verde y el conforme de retiro (subir la firma hace lo mismo). Devuelve qué hizo; si algo falló, tira. */
async function retirar(org: string, pid: number, quien: string, medio: string | null): Promise<string> {
  // Una venta de Mercado Libre sin envío también (Fer, 22/10): se entrega, se factura si falta y se le avisa a ML.
  const esMl = !!(await una("select 1 from pedido p join canal c on c.id = p.canal_id where p.id = $1 and p.organizacion_id = $2 and c.tipo = 'mercadolibre'", [pid, org]));
  if (esMl) await exigirCarritoLibre(org, pid); else await pedidoOperable(org, pid);
  const r = esMl ? await clientePresenteRetiraMl(org, pid, quien) : await clientePresenteRetira(org, pid, quien, medio);
  revalidatePath(`/ventas/pedidos/${pid}`);
  revalidatePath("/ventas/pedidos");
  const listo = r.hecho.join(" · ");
  if (r.fallo.length) throw new ErrorErp(`${listo.charAt(0).toUpperCase() + listo.slice(1)}. Falló: ${r.fallo.join(" · ")}`);
  return `${listo.charAt(0).toUpperCase() + listo.slice(1)}.`;
}

/** Eliminar del todo un presupuesto o un pedido cancelado (Fer, 7/10): sólo
 *  superadministradores; las condiciones las controla eliminar_pedido (db/ventas.sql). */
export async function accionEliminarPedido(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  await intentar(`/ventas/pedidos/${pid}?b=op`, async () => {
    if (!s.superadmin) throw new ErrorErp("Sólo un superadministrador puede eliminar.");
    await una("select eliminar_pedido($1, $2::bigint)", [s.org.id, pid]);
    revalidatePath("/ventas/pedidos");
    return { ir: `/ventas/pedidos?ok=${encodeURIComponent(`Se eliminó el ${pid}: no quedó nada de él.`)}` };
  });
}

/** Levantar un pedido cancelado (Fer, 7/10): vuelve a Nuevo y reserva otra vez; avisa lo que quedó sin stock. */
export async function accionLevantarPedido(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  return deFondo(s, `levantar-pedido-${pid}`, `Levantar el pedido ${pid}`, async () => {
    const faltan = await reactivarPedido(s.org.id, pid, s.usuario.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return faltan.length
      ? `Pedido ${pid} levantado, pero OJO: no alcanza el stock de ${faltan.join(", ")}. Quedó reservado igual (en negativo): reponelo o sacalo del pedido.`
      : `Pedido ${pid} levantado: volvió a Nuevo y el stock quedó reservado.`;
  });
}

// ── Revisión de la factura (pedido de Fer, 13/10; lib/facturacion/revision.ts) ──

/** «Refacturar con datos actuales»: nota de crédito idéntica a la factura vigente y factura nueva
 *  con lo que hoy tiene la ficha del cliente y las observaciones del pedido (las dos con la fecha del día). */
export async function accionRefacturar(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const pid = id(fd, "pedido_id");
  const volver = `/ventas/pedidos/${pid}`;
  await intentar(volver, async () => {
    if (!pid) throw new ErrorErp("El pedido no existe.");
    if (!(await una("select 1 from pedido where id = $1 and organizacion_id = $2", [pid, s.org.id]))) throw new ErrorErp("El pedido no existe.");
    const r = await refacturar(s.org.id, pid, s.usuario.id);
    revalidatePath(volver);
    revalidatePath("/administracion/facturacion");
    return r;
  });
}

/** «Dejar la factura como está»: la persona miró lo retenido y no hace falta cambiar nada. */
export async function accionLiberarFactura(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const pid = id(fd, "pedido_id");
  const volver = `/ventas/pedidos/${pid}`;
  await intentar(volver, async () => {
    if (!pid) throw new ErrorErp("El pedido no existe.");
    await liberarFactura(s.org.id, pid);
    revalidatePath(volver);
    return "Listo: la factura queda como está.";
  });
}

/** Las observaciones que salen en la próxima factura del pedido. */
export async function accionLeyendaFactura(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const pid = id(fd, "pedido_id");
  const volver = `/ventas/pedidos/${pid}`;
  await intentar(volver, async () => {
    if (!pid) throw new ErrorErp("El pedido no existe.");
    const t = (texto(fd, "leyenda") ?? "").trim();
    if (t.length > LARGO_LEYENDA) throw new ErrorErp(`Las observaciones de la factura: hasta ${LARGO_LEYENDA} letras.`);
    await una("update pedido set factura_leyenda = $3 where id = $1 and organizacion_id = $2 returning id", [pid, s.org.id, t || null]);
    revalidatePath(volver);
    return { ir: `${volver}?ok=${encodeURIComponent("Observaciones de la factura grabadas.")}` };
  });
}

/** «Mandar por WhatsApp»: la factura al WhatsApp confirmado del cliente (lib/facturacion/envio.ts). */
export async function accionFacturaWhatsapp(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const pid = id(fd, "pedido_id");
  const cid = id(fd, "comprobante_id");
  const volver = `/ventas/pedidos/${pid}`;
  await intentar(volver, async () => {
    if (!cid || !(await una("select 1 from comprobante where id = $1 and organizacion_id = $2 and pedido_id = $3", [cid, s.org.id, pid]))) throw new ErrorErp("El comprobante no existe.");
    const { enviarFacturaWhatsapp } = await import("@/lib/facturacion/envio");
    const r = await enviarFacturaWhatsapp(s.org.id, cid, { manual: true });
    revalidatePath(volver);
    return r;
  });
}

/** «Mandar por mail» / «Reenviar por mail»: la factura en PDF al mail del cliente, aunque no tenga el tilde. */
export async function accionFacturaMail(fd: FormData) {
  const s = await entrarErp("facturacion_ver");
  const pid = id(fd, "pedido_id");
  const cid = id(fd, "comprobante_id");
  const volver = `/ventas/pedidos/${pid}`;
  await intentar(volver, async () => {
    if (!cid || !(await una("select 1 from comprobante where id = $1 and organizacion_id = $2 and pedido_id = $3", [cid, s.org.id, pid]))) throw new ErrorErp("El comprobante no existe.");
    const { mailFactura } = await import("@/lib/correo/mails");
    const r = await mailFactura(s.org.id, cid, { manual: true });
    revalidatePath(volver);
    if (r.ok) return "Factura enviada por mail.";
    // En pantalla, en criollo; el motivo técnico queda en el registro de mails.
    const MOTIVOS: Record<string, string> = {
      sin_mail: "El cliente no tiene mail: cargalo en su ficha.", mail_invalido: "El mail del cliente no es válido: corregilo en su ficha.",
      dominio_sin_correo: "Ese mail no existe (el dominio no recibe correo): corregilo en la ficha del cliente.",
      sin_configurar: "El correo de salida no está configurado (Configuración › Correo).", sin_autorizar: "La factura todavía no está autorizada.",
    };
    throw new ErrorErp(MOTIVOS[r.motivo ?? ""] ?? "No se pudo mandar el mail. Probá de nuevo en un rato.");
  });
}

// Lo que el navegador ya subió al bucket privado «comprobantes»: el comprobante de pago y el conforme de retiro
// (la firma de quien retira y su DNI; Fer, 25/10). Son dos cosas distintas, cada una con su tabla.
const ARCHIVOS = { pago: "pedido_comprobante_pago", retiro: "pedido_conforme_retiro" } as const;

async function guardarArchivo(fd: FormData, clase: keyof typeof ARCHIVOS): Promise<{ motivo?: string; id?: number }> {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  try {
    if (!(await una("select 1 from pedido where id = $1 and organizacion_id = $2", [pid, s.org.id]))) throw new ErrorErp("El pedido no existe.");
    const ruta = texto(fd, "ruta");
    if (!ruta || !ruta.startsWith(`${s.org.id}/`)) throw new ErrorErp("No llegó bien el archivo. Probá de nuevo.");
    const r = await una<{ id: number }>(`insert into ${ARCHIVOS[clase]} (organizacion_id, pedido_id, ruta, nombre, tipo, subido_por) values ($1, $2, $3, $4, $5, $6) returning id::int`,
      [s.org.id, pid, ruta, texto(fd, "nombre"), texto(fd, "tipo"), s.usuario.id]);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return { id: r!.id };
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

async function borrarArchivo(fd: FormData, clase: keyof typeof ARCHIVOS) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  await intentar(`/ventas/pedidos/${pid}?b=op`, async () => {
    const r = await una<{ ruta: string }>(`delete from ${ARCHIVOS[clase]} where id = $1 and organizacion_id = $2 and pedido_id = $3 returning ruta`,
      [id(fd, "id"), s.org.id, pid]);
    if (r?.ruta.startsWith(`${s.org.id}/`)) {
      try { await (await supabaseServer()).storage.from("comprobantes").remove([r.ruta]); } catch { /* queda huérfano */ }
    }
    revalidatePath(`/ventas/pedidos/${pid}`);
    return clase === "pago" ? "Comprobante borrado." : "Conforme borrado.";
  });
}

/** El comprobante de pago: se guarda y se concilia en el momento con Mercado Pago (lib/pagos/comprobante.ts):
 *  si cierra, el pago queda registrado solo; si no, queda a confirmar o se vuelve a buscar solo. */
export async function guardarComprobantePago(fd: FormData): Promise<{ motivo?: string; ok?: string }> {
  const g = await guardarArchivo(fd, "pago");
  if (g.motivo || !g.id) return g;
  const s = await entrarErp("pedidos_ver");
  try {
    const ruta = texto(fd, "ruta")!;
    const { data } = await (await supabaseServer()).storage.from("comprobantes").download(ruta);
    const archivo = data ? { datos: Buffer.from(await data.arrayBuffer()), tipo: texto(fd, "tipo") ?? data.type } : undefined;
    const v = await conciliarComprobante(s.org.id, g.id, s.usuario.id, archivo);
    revalidatePath(`/ventas/pedidos/${id(fd, "pedido_id")}`);
    return { ok: v.estado === "conciliado" ? `Pago registrado: ${v.detalle}` : v.detalle };
  } catch (e) {
    console.error("[comprobante] conciliar", e);
    return { ok: "Comprobante guardado. No se pudo revisar ahora: se vuelve a intentar solo." };
  }
}

/** «Buscar de nuevo» en Mercado Pago. */
export async function accionConciliarComprobante(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  await intentar(`/ventas/pedidos/${pid}?b=op`, async () => {
    await perteneceAlPedido(s.org.id, pid, id(fd, "id"));
    const v = await conciliarComprobante(s.org.id, id(fd, "id"), s.usuario.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return v.estado === "conciliado" ? `Pago registrado: ${v.detalle}` : v.detalle;
  });
}

/** «Sí, es de este cliente»: registra el pago con la transferencia elegida. */
export async function accionConfirmarTransferencia(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  await intentar(`/ventas/pedidos/${pid}?b=op`, async () => {
    await perteneceAlPedido(s.org.id, pid, id(fd, "id"));
    const r = await confirmarCandidato(s.org.id, id(fd, "id"), texto(fd, "movimiento") ?? "", s.usuario.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    return r;
  });
}

/** «No»: ninguna de las transferencias propuestas es de este cliente. */
export async function accionDescartarTransferencias(fd: FormData) {
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  await intentar(`/ventas/pedidos/${pid}?b=op`, async () => {
    await perteneceAlPedido(s.org.id, pid, id(fd, "id"));
    await descartarCandidatos(s.org.id, id(fd, "id"));
    revalidatePath(`/ventas/pedidos/${pid}`);
    return "Anotado: no es de este cliente.";
  });
}

async function perteneceAlPedido(org: string, pid: number, cid: number) {
  if (!(await una("select 1 from pedido_comprobante_pago where id = $1 and organizacion_id = $2 and pedido_id = $3", [cid, org, pid]))) throw new ErrorErp("El comprobante no existe.");
}
export async function accionBorrarComprobantePago(fd: FormData) { return borrarArchivo(fd, "pago"); }
/** El conforme de retiro (Fer, 25/10): subir la firma de quien retira cumple la función de «Cliente presente:
 *  retira» si el pedido ya está preparado y no hay que elegir con qué pagó. Con varias fotos, al terminar la última. */
export async function guardarConformeRetiro(fd: FormData): Promise<{ motivo?: string; ok?: string }> {
  const g = await guardarArchivo(fd, "retiro");
  if (g.motivo || fd.get("ultimo") !== "1") return g;
  const s = await entrarErp("pedidos_ver");
  const pid = id(fd, "pedido_id");
  const p = await una<{ estado: string; estado_pago: string; ml: boolean }>(`
    select p.estado, ${sqlEstadoPago("p")} estado_pago, c.tipo = 'mercadolibre' ml from pedido p join canal c on c.id = p.canal_id
     where p.id = $1 and p.organizacion_id = $2`, [pid, s.org.id]);
  if (p?.estado !== "preparado") return { ok: "Conforme guardado." };
  if (!p.ml && !["pagado", "a_convenir"].includes(p.estado_pago))
    return { ok: "Conforme guardado. Falta cobrarlo: elegí con qué pagó y tocá «Cliente presente: retira y paga»." };
  try {
    return { ok: `Conforme guardado. ${await retirar(s.org.id, pid, s.usuario.id, null)}` };
  } catch (e) {
    return { motivo: `Conforme guardado, pero no se pudo entregar: ${motivoErp(e)}` };
  }
}
export async function accionBorrarConformeRetiro(fd: FormData) { return borrarArchivo(fd, "retiro"); }

/** «Cambiar cliente» (Fer, 25/10; lib/pedidos/cliente.ts). Si el pedido ya tenía factura, la refactura con el
 *  cliente nuevo (nota de crédito idéntica y factura nueva); si no, queda listo para «Facturar». */
export async function accionCambiarCliente(pid: number, clienteId: number): Promise<{ error?: string; ok?: string }> {
  const s = await entrarErp("pedidos_ver");
  try {
    if (!(await una("select 1 from pedido where id = $1 and organizacion_id = $2", [pid, s.org.id]))) throw new ErrorErp("El pedido no existe.");
    const facturado = await una(`select 1 from comprobante cb where cb.organizacion_id = $1 and cb.pedido_id = $2 and ${sqlFacturaVigente("cb")}`, [s.org.id, pid]);
    if (facturado && !tienePermiso(s.permisos, "facturacion_ver")) throw new ErrorErp("El pedido ya está facturado: el cliente lo cambia quien puede facturar.");
    const r = await cambiarClientePedido(s.org.id, pid, clienteId, s.usuario.id);
    revalidatePath(`/ventas/pedidos/${pid}`);
    if (!r.facturado) return { ok: `Listo: el cliente ahora es ${r.nuevo}.` };
    try {
      const m = await refacturar(s.org.id, pid, s.usuario.id);
      revalidatePath("/administracion/facturacion");
      return { ok: `Listo: el cliente ahora es ${r.nuevo}. ${m}` };
    } catch (e) {
      return { error: `El cliente ya es ${r.nuevo}, pero la factura nueva no salió: ${motivoErp(e)} Probá con «Refacturar con datos actuales».` };
    }
  } catch (e) {
    return { error: motivoErp(e) };
  }
}
