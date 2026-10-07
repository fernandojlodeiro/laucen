// Los botones de la ficha del pedido o presupuesto, arriba a la derecha (Fer,
// 7/10: «los botones siempre arriba a la derecha, donde iría Nuevo»):
//   presupuesto: Imprimir · Pasar a pedido · Cancelar presupuesto · WhatsApp · lápiz
//   pedido:      Pasar a presupuesto · Cancelar pedido · WhatsApp · lápiz
//   cancelado:   Levantar pedido (vuelve a Nuevo y reserva otra vez)
// El lápiz sólo si se puede editar (lib/pedidos/editar.ts). Lo que pide datos
// (confirmar pago, el estado siguiente con su nota) sigue en «Operación».

import { una } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { sqlEstadoPago, type EstadoPedido } from "@/lib/pedidos";
import { queArrastraCancelar, motivoNoCancelable } from "@/lib/pedidos/cancelar";
import { motivoNoPresupuesto } from "@/lib/pedidos/presupuestos";
import { tiendaDelCanal, nombreTienda } from "@/lib/tienda/tienda";
import { urlTienda } from "@/lib/tienda/dominios-tienda";
import { Lapiz } from "@/app/componentes/erp";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import CancelarPedido from "./CancelarPedido";
import CancelarMl from "./CancelarMl";
import { mensaje, telefonoWhatsapp } from "./Operacion";
import { accionPasarAPedido, accionPasarAPresupuesto, accionEliminarPedido, accionLevantarPedido } from "./acciones";
import { TachoConfirmar } from "@/app/radar/Cliente";

const CERRADOS: EstadoPedido[] = ["entregado", "cancelado", "devuelto"];

export default async function AccionesPedido({ org, pid, editable, superadmin = false }: { org: string; pid: number; editable: boolean; superadmin?: boolean }) {
  const p = await una<{ estado: EstadoPedido; estado_pago: string; id_externo: string | null; codigo: string | null; canal_id: number; canal_tipo: string;
    cliente: string | null; telefono: string | null; movil: string | null }>(`
    select p.estado, ${sqlEstadoPago("p")} estado_pago, p.id_externo, p.codigo_seguimiento codigo, p.canal_id::int, c.tipo canal_tipo,
           cl.nombre cliente, cl.telefono, cl.telefono_movil movil
      from pedido p join canal c on c.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
     where p.id = $1 and p.organizacion_id = $2`, [pid, org]);
  if (!p) return null;
  const esMl = p.canal_tipo === "mercadolibre";
  const esPresupuesto = p.estado === "presupuesto";
  // Eliminar del todo (Fer, 7/10): sólo superadministradores, un presupuesto o un pedido cancelado (la base controla el resto).
  const tacho = superadmin && !esMl && (esPresupuesto || p.estado === "cancelado")
    ? <TachoConfirmar accion={accionEliminarPedido} campos={{ pedido_id: String(pid) }} pregunta={`¿Eliminar ${esPresupuesto ? "el presupuesto" : "el pedido"} del todo? No queda nada.`} />
    : null;
  // Imprimir en PDF (Fer, 7/10): el presupuesto y también el pedido; sólo cambia el título.
  const imprimir = <a href={`/ventas/pedidos/${pid}/presupuesto`} target="_blank" rel="noopener" className={esPresupuesto ? PRIMARIO : SUAVE}>🖨 Imprimir</a>;
  const lapiz = editable ? <Lapiz href={`/ventas/pedidos/${pid}?editar=ficha`} etiqueta={esPresupuesto ? "Editar el presupuesto" : "Editar el pedido"} /> : null;

  if (esMl) {
    const cancelable = !CERRADOS.includes(p.estado) && p.estado !== "despachado";
    const enlaceMl = p.id_externo && /^\d+$/.test(p.id_externo) ? `https://www.mercadolibre.com.ar/ventas/${p.id_externo}/detalle` : null;
    return <>{imprimir}{cancelable ? <CancelarMl enlace={enlaceMl} /> : null}</>;
  }

  // WhatsApp: con el link de seguimiento si es un pedido de la tienda.
  const tel = telefonoWhatsapp(p.movil) ?? telefonoWhatsapp(p.telefono);
  let wa: string | null = null;
  if (tel) {
    const t = p.canal_tipo === "web_minorista" ? await tiendaDelCanal(org, p.canal_id) : null;
    const seguimiento = !esPresupuesto && t && p.codigo ? await urlTienda(t, `/pedido/${p.codigo}`) : null;
    const despacho = p.estado === "despachado"
      ? (await una<{ nota: string | null }>("select nota from pedido_estado_historial where pedido_id = $1 and estado_nuevo = 'despachado' order by fecha desc, id desc limit 1", [pid]))?.nota ?? null
      : null;
    const pagoPendiente = ["pendiente", "a_convenir", "a_cobrar"].includes(p.estado_pago) && !CERRADOS.includes(p.estado);
    const texto = mensaje(p.estado, { nombre: p.cliente, pedido: pid, tienda: t ? nombreTienda(t) : "nuestra tienda", seguimiento, despacho,
      pagoPendiente, aCobrar: p.estado_pago === "a_cobrar" });
    wa = `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
  }
  const waBoton = wa
    ? <a href={wa} target="_blank" rel="noopener" className={SUAVE}>WhatsApp ↗</a>
    : <span className={`${SUAVE} opacity-50 cursor-not-allowed`} title="El cliente no tiene teléfono cargado">WhatsApp</span>;

  const cancelar = !CERRADOS.includes(p.estado) ? await queArrastraCancelar(org, pid) : null;
  const botonCancelar = cancelar && !motivoNoCancelable(p.estado, cancelar)
    ? <CancelarPedido pid={pid} presupuesto={esPresupuesto} oca={cancelar.oca} factura={cancelar.factura?.texto ?? null}
        payway={cancelar.payway ? { importe: formatear(cancelar.payway.importe, "ARS"), mismoDia: cancelar.payway.mismoDia } : null} />
    : null;

  if (esPresupuesto) {
    return (
      <>
        {imprimir}
        <BotonTarea accion={accionPasarAPedido} tipo={`presupuesto-a-pedido-${pid}`} texto="Pasar a pedido" clase={VERDE} campos={{ pedido_id: String(pid) }}
          pregunta="¿Pasarlo a pedido? Reserva el stock y queda con el pago pendiente." />
        {botonCancelar}
        {waBoton}
        {lapiz}
        {tacho}
      </>
    );
  }
  const aPresupuesto = !(await motivoNoPresupuesto(org, pid));
  // Levantar un pedido cancelado (Fer, 7/10): el cliente se arrepintió o se canceló por error.
  const levantar = p.estado === "cancelado"
    ? <BotonTarea accion={accionLevantarPedido} tipo={`levantar-pedido-${pid}`} texto="Levantar pedido" clase={VERDE} campos={{ pedido_id: String(pid) }}
        pregunta="¿Levantar el pedido? Vuelve a Nuevo y reserva el stock otra vez (si falta algo, te aviso)." />
    : null;
  return (
    <>
      {imprimir}
      {levantar}
      {aPresupuesto && (
        <BotonTarea accion={accionPasarAPresupuesto} tipo={`pedido-a-presupuesto-${pid}`} texto="Pasar a presupuesto" clase={SUAVE} campos={{ pedido_id: String(pid) }}
          pregunta="¿Pasarlo a presupuesto? Se libera el stock reservado." />
      )}
      {botonCancelar}
      {waBoton}
      {lapiz}
      {tacho}
    </>
  );
}
