// Cuánto se le guarda el stock a un pedido sin pagar (Fer, 7/10).
//   - Todo pedido reserva su stock al nacer (lib/pedidos, crearPedido). Si no
//     está pago (pendiente o «A cobrar»), lleva reserva_hasta = hoy + los días
//     de Configuración › Empresa › Pedidos (7 de entrada).
//   - El día de reserva_hasta todavía vale entero; al terminar ese día, si
//     sigue Nuevo y sin pagar (y no entró en picking), se cancela solo
//     (vencerReservas, desde el barrido de cada media hora) y libera el stock.
//   - «Levantar el pedido» lo vuelve a Nuevo, reserva otra vez y le da otros N días.
// Pendiente (Fer, 7/10): avisarle al cliente por WhatsApp y mail a 48 h y el día del vencimiento.

import { consulta, una, ErrorErp, type Consultor } from "@/lib/erp/base";
import { cambiarEstado } from "@/lib/pedidos";
import { avisarStockMl } from "@/lib/tienda/pagos/confirmar";

const ZONA = "America/Argentina/Buenos_Aires";

/** Los días de reserva de la organización (Configuración › Empresa). */
export async function diasReserva(org: string, c?: Consultor): Promise<number> {
  const sql = "select coalesce((select dias_reserva from empresa where organizacion_id = $1), 7) d";
  const r = c ? (await c.query<{ d: number }>(sql, [org])).rows[0] : await una<{ d: number }>(sql, [org]);
  return Number(r?.d ?? 7);
}

/** Pone el vencimiento de la reserva (hoy + N días) a un pedido sin pagar; a uno pago, ninguno. */
export async function fijarVencimiento(org: string, pedidoId: number, c?: Consultor) {
  const dias = await diasReserva(org, c);
  const sql = `update pedido set reserva_hasta = case when estado = 'nuevo' and estado_pago in ('pendiente', 'a_cobrar')
                 then (now() at time zone '${ZONA}')::date + $3::int else null end
               where id = $1 and organizacion_id = $2`;
  if (c) await c.query(sql, [pedidoId, org, dias]); else await consulta(sql, [pedidoId, org, dias]);
}

/** SQL: el pedido guarda stock sin estar pago y tiene vencimiento. */
export const sqlReservaSinPagar = (a = "p") =>
  `(${a}.estado = 'nuevo' and ${a}.estado_pago in ('pendiente', 'a_cobrar') and ${a}.reserva_hasta is not null)`;

/** Cancela los pedidos cuya reserva venció (pasó entero el día reserva_hasta) y siguen sin pagar. */
export async function vencerReservas(hastaMs: number): Promise<{ cancelados: number[] }> {
  const vencidos = await consulta<{ id: number; org: string; hasta: string }>(`
    select p.id::int, p.organizacion_id org, to_char(p.reserva_hasta, 'DD/MM') hasta from pedido p
     where ${sqlReservaSinPagar("p")} and p.reserva_hasta < (now() at time zone '${ZONA}')::date
       and not exists (select 1 from picking_pedido pp where pp.pedido_id = p.id)
     order by p.reserva_hasta, p.id limit 50`);
  const cancelados: number[] = [];
  for (const v of vencidos) {
    if (Date.now() > hastaMs) break;
    try {
      await cambiarEstado(v.org, v.id, "cancelado", "sistema", `venció la reserva (sin pagar hasta el ${v.hasta})`);
      await consulta("update pedido set reserva_hasta = null where id = $1", [v.id]);
      await avisarStockMl(v.org, v.id);
      cancelados.push(v.id);
    } catch (e) {
      console.error("[reserva] no se pudo cancelar", v.id, e instanceof Error ? e.message : e);
    }
  }
  return { cancelados };
}

/** Levanta un pedido cancelado: Nuevo, reserva otra vez y, si no está pago, N días más. Devuelve lo que quedó sin stock. */
export async function reactivarPedido(org: string, pedidoId: number, quien: string): Promise<string[]> {
  const dias = await diasReserva(org);
  await una(`select reactivar_pedido($1, $2::bigint, $3, (now() at time zone '${ZONA}')::date + $4::int)`, [org, pedidoId, quien, dias]);
  await avisarStockMl(org, pedidoId);
  // Lo que se reservó sin tener: el disponible del depósito quedó en negativo.
  const faltan = await consulta<{ sku: string }>(`
    select distinct v.sku from movimiento_stock m join variacion v on v.id = m.variacion_id
     where m.organizacion_id = $1 and m.referencia_tipo = 'pedido' and m.referencia_id = $2 and m.tipo = 'reserva'
       and m.nota = 'sin stock suficiente' and m.fecha > now() - interval '5 minutes' order by v.sku`, [org, String(pedidoId)]);
  return faltan.map((f) => f.sku);
}

/** Para la ficha: hasta cuándo se guarda el stock y cuántos días faltan (0 = vence hoy). */
export async function vencimientoDe(org: string, pedidoId: number): Promise<{ hasta: string; faltan: number } | null> {
  const r = await una<{ hasta: string | null; faltan: number | null }>(`
    select to_char(p.reserva_hasta, 'YYYY-MM-DD') hasta, (p.reserva_hasta - (now() at time zone '${ZONA}')::date)::int faltan
      from pedido p where p.id = $1 and p.organizacion_id = $2 and ${sqlReservaSinPagar("p")}`, [pedidoId, org]);
  return r?.hasta ? { hasta: r.hasta, faltan: Number(r.faltan) } : null;
}

export { ErrorErp };
