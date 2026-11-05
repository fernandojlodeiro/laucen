// Avisos de la preventa al cliente (Fer, 5/11). Cuando llega la mercadería de su orden, el cliente de la tienda recibe
// un mail con el link de su pedido para pagar el saldo (si debe algo). Mercado Libre no: ahí el comprador ya pagó todo
// y la mensajería es de ML. Va por la cola de los avisos de los pedidos (lib/correo/mails.ts, tipo «preventa_llego»).

import { consulta } from "@/lib/erp/base";
import { asegurarCodigo } from "@/lib/pedidos/seguimiento";

export async function avisarLlegadaPreventa(org: string, pedidoIds: number[]): Promise<void> {
  if (!pedidoIds.length) return;
  const filas = await consulta<{ id: number }>(`
    select p.id::int from pedido p join canal c on c.id = p.canal_id
     where p.organizacion_id = $1 and p.id = any($2::bigint[]) and c.tipo <> 'mercadolibre'`, [org, pedidoIds]);
  for (const f of filas) {
    await asegurarCodigo(org, f.id);
    // Por WhatsApp no sale solo: el mail lleva el link para pagar; el operador escribe si hace falta.
    await consulta(`insert into correo_cola (organizacion_id, pedido_id, tipo, wa_hecho_ts, wa_estado, wa_detalle)
                    values ($1, $2, 'preventa_llego', now(), 'no_corresponde', 'El aviso de llegada de la preventa va por mail.')
                    on conflict (pedido_id, tipo) do nothing`, [org, f.id]);
  }
}
