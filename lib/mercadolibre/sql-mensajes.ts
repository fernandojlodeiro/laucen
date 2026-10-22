// Lo que comparten la pantalla de mensajes, la barra de estado y el tablero de Mercado Libre.

/** ¿La conversación espera respuesta? El último mensaje es del comprador, de los últimos 15 días (Fer, 22/10:
 *  se cuentan las sin responder, no las sin leer). `c`: el alias de meli_conversacion. */
export const SQL_SIN_RESPONDER = (c: string) => `(${c}.ultimo_ts > now() - interval '15 days' and coalesce((select not m.de_vendedor from meli_mensaje m
  where m.organizacion_id = ${c}.organizacion_id and m.pack_id = ${c}.pack_id order by m.fecha desc limit 1), false))`;
