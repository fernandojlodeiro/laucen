// Las notas internas del pedido (pedido.notas): las ve el equipo en el pedido, el cliente no. Lo que Laucen hace
// solo con un pedido y alguien tiene que poder revisar (un comprobante que no concilió, un alta en OCA que falló)
// queda acá, un renglón con fecha y hora.

import { consulta } from "@/lib/erp/base";

/** Suma un renglón, con fecha y hora argentina, a las notas del pedido. */
export async function anotarEnPedido(org: string, pid: number, texto: string): Promise<void> {
  await consulta(`update pedido set notas = concat_ws(E'\\n', nullif(notas, ''), to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ' · ' || $3)
                   where id = $1 and organizacion_id = $2`, [pid, org, texto]);
}
