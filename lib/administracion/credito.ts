// Límite de crédito de la cuenta corriente (Fer, 7/10). Un pedido a cuenta
// corriente (pago «A convenir») se prepara sólo si el cliente tiene la cuenta
// habilitada, un límite cargado y el saldo de su cuenta más sus pedidos a
// cuenta sin facturar no pasan el límite. La regla vive en la base
// (cc_motivo_freno, db/administracion.sql) y la usa el picking (sqlCcLibre).
// Habilitar la cuenta y cargar el límite pide el permiso «cc_asignar».

import { una } from "@/lib/erp/base";

export type SituacionCc = { saldo: number; pedidos: number; limite: number | null; disponible: number | null };

/** Lo que el cliente debe, lo que tiene pedido a cuenta sin facturar y cuánto le queda del límite. */
export async function situacionCc(org: string, clienteId: number): Promise<SituacionCc> {
  const r = await una<{ saldo: string; pedidos: string; limite: string | null }>(`
    select coalesce((select sum(m.importe_ars) from cc_movimiento m
                      where m.organizacion_id = $1 and m.tercero_tipo = 'cliente' and m.tercero_id = $2), 0) saldo,
           coalesce((select sum(q.total_ars) from pedido q
                      where q.organizacion_id = $1 and q.cliente_id = $2 and q.estado_pago = 'a_convenir'
                        and q.estado not in ('cancelado', 'devuelto', 'presupuesto')
                        and not exists (select 1 from comprobante cb join cc_movimiento m on m.referencia_tipo = 'comprobante' and m.referencia_id = cb.id
                                         where cb.pedido_id = q.id and cb.estado = 'autorizado')), 0) pedidos,
           (select limite_cc from cliente where id = $2 and organizacion_id = $1) limite`, [org, clienteId]);
  const saldo = Number(r?.saldo ?? 0), pedidos = Number(r?.pedidos ?? 0);
  const limite = r?.limite == null ? null : Number(r.limite);
  return { saldo, pedidos, limite, disponible: limite == null ? null : limite - saldo - pedidos };
}

/** Por qué un pedido a cuenta no se prepara (null = se prepara, o no es a cuenta). */
export async function motivoFrenoCc(pedidoId: number): Promise<string | null> {
  return (await una<{ m: string | null }>("select cc_motivo_freno($1::bigint) m", [pedidoId]))?.m ?? null;
}
