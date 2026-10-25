// Lo que comparten la pantalla de mensajes, la barra de estado y el tablero de Mercado Libre.

/** ¿La conversación espera respuesta? El último mensaje es del comprador, de los últimos 15 días (Fer, 22/10:
 *  se cuentan las sin responder, no las sin leer); o la IA le avisó que derivaba el caso a una persona y ninguna
 *  persona escribió después (Fer, 25/10). `c`: el alias de meli_conversacion. */
export const SQL_SIN_RESPONDER = (c: string) => `(${c}.ultimo_ts > now() - interval '15 days' and (coalesce((select not m.de_vendedor from meli_mensaje m
  where m.organizacion_id = ${c}.organizacion_id and m.pack_id = ${c}.pack_id order by m.fecha desc limit 1), false)
  or ${SQL_DERIVADA_ESPERA(c)}))`;

/** La IA derivó la conversación a una persona y todavía nadie del equipo contestó (un mensaje del vendedor que no
 *  mandó la IA sola: desde Laucen o desde Mercado Libre). */
export const SQL_DERIVADA_ESPERA = (c: string) => `(${c}.derivada_ts is not null and not exists (select 1 from meli_mensaje m
  where m.organizacion_id = ${c}.organizacion_id and m.pack_id = ${c}.pack_id and m.de_vendedor and not m.auto and m.fecha > ${c}.derivada_ts))`;
