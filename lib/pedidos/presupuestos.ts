// Presupuestos (Fer, 7/10): un pedido en estado 'presupuesto' es igual a un
// pedido pero no reserva stock. Nace sólo en el canal local ("Nuevo
// presupuesto" de Ventas › Pedidos y presupuestos). «Pasar a pedido» lo deja
// nuevo, con el pago pendiente, y reserva el stock; «Pasar a presupuesto»
// libera la reserva de un pedido que todavía no se tocó (nuevo o a cuenta
// corriente, sin cobrar, sin picking ni factura, que no sea de Mercado Libre).
// Las reglas viven en la base (pedido_a_presupuesto / presupuesto_a_pedido, db/ventas.sql).

import { una, ErrorErp } from "@/lib/erp/base";
import { avisarStockMl } from "@/lib/tienda/pagos/confirmar";
import { fijarVencimiento } from "@/lib/pedidos/reserva";

/** Cuántos días vale un presupuesto si no se dice otra cosa. */
export const DIAS_VIGENCIA = 7;

export async function pasarAPresupuesto(org: string, pedidoId: number, quien: string, vigencia?: string | null) {
  await una("select pedido_a_presupuesto($1, $2, $3, $4::date)", [org, pedidoId, quien, vigencia ?? null]);
  await avisarStockMl(org, pedidoId);
}

export async function pasarAPedido(org: string, pedidoId: number, quien: string): Promise<boolean> {
  const r = await una<{ r: boolean }>("select presupuesto_a_pedido($1, $2, $3) r", [org, pedidoId, quien]);
  await fijarVencimiento(org, pedidoId);
  await avisarStockMl(org, pedidoId);
  return !!r?.r;
}

export async function cambiarVigencia(org: string, pedidoId: number, vigencia: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigencia)) throw new ErrorErp("Elegí la fecha hasta la que vale.");
  const r = await una("update pedido set vigencia = $3::date where id = $1 and organizacion_id = $2 and estado = 'presupuesto' returning id", [pedidoId, org, vigencia]);
  if (!r) throw new ErrorErp("Ese presupuesto no existe.");
}

/** ¿Se puede pasar a presupuesto? null = sí; si no, el motivo (para mostrar en la ficha). */
export async function motivoNoPresupuesto(org: string, pedidoId: number): Promise<string | null> {
  const p = await una<{ estado: string; estado_pago: string; canal_tipo: string; picking: boolean; factura: boolean }>(`
    select p.estado, p.estado_pago, c.tipo canal_tipo,
           exists (select 1 from picking_pedido pp where pp.pedido_id = p.id) picking,
           exists (select 1 from comprobante cb where cb.pedido_id = p.id and cb.estado in ('autorizado', 'pendiente')) factura
      from pedido p join canal c on c.id = p.canal_id where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]);
  if (!p) return "El pedido no existe.";
  if (p.canal_tipo === "mercadolibre") return "Una venta de Mercado Libre no se pasa a presupuesto.";
  if (!["nuevo", "pagado"].includes(p.estado)) return "Ya está en preparación o más adelante: no se pasa a presupuesto.";
  if (p.estado_pago === "pagado") return "Ya está pagado: no se pasa a presupuesto.";
  if (p.picking) return "Ya entró en un lote de picking: no se pasa a presupuesto.";
  if (p.factura) return "Ya tiene factura: no se pasa a presupuesto.";
  return null;
}
