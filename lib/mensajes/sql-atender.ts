// «Para atender» (Fer, 27/10): lo que espera a una persona, en todos los canales. Lo comparten la bandeja de Mensajes
// (su pestaña) y la barra de estado (su contador), así los dos números son siempre el mismo.
//   - WhatsApp e Instagram: un caso abierto (la IA lo derivó, o no pudo contestar), o el cliente escribió y nadie le
//     contestó —con la IA apagada en ese chat, o hace más de 90 segundos—, salvo que la IA haya visto que no hacía falta
//     (un «gracias», un emoji) o alguien haya tocado «Terminado» (chat.no_responder_ts) después de ese mensaje.
//   - Mensajes de Mercado Libre: sin responder o derivados a una persona (SQL_SIN_RESPONDER, con su «Terminado»).
//   - Preguntas: las que a la IA le faltó un dato, o llevan media hora sin respuesta (la IA las contesta todas).
//   - Reclamos: los que Mercado Libre espera que respondas, y los de la web o el local sin tocar.

import { SQL_SIN_RESPONDER } from "@/lib/mercadolibre/sql-mensajes";

export const SQL_CHAT_ATENDER = (ch: string) => `(exists (select 1 from chat_caso k where k.chat_id = ${ch}.id and k.resuelto_ts is null)
  or (${ch}.canal <> 'prueba' and ${ch}.ultimo_entrante_ts > now() - interval '15 days'
      and ${ch}.ultimo_entrante_ts > coalesce(${ch}.no_responder_ts, '-infinity'::timestamptz)
      and (${ch}.atiende_persona_desde is not null or ${ch}.ultimo_entrante_ts < now() - interval '90 seconds')
      and (select m.clase from chat_mensaje m where m.chat_id = ${ch}.id and m.texto <> '' order by m.id desc limit 1) = 'entrante'))`;

export const SQL_ML_ATENDER = SQL_SIN_RESPONDER;

export const SQL_PREGUNTA_ATENDER = (q: string) => `(${q}.estado = 'UNANSWERED' and (${q}.ia_estado = 'falta_dato' or ${q}.fecha < now() - interval '30 minutes'))`;

/** Un reclamo para atender (alias `r`): lo que Mercado Libre espera que respondas, y los de la web o el local sin tocar. */
export const SQL_RECLAMO_A_ATENDER = "r.estado <> 'resuelto' and (r.espera_respuesta or (r.origen <> 'mercadolibre' and r.estado = 'abierto'))";
