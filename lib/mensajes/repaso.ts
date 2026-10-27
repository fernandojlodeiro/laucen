// El repaso de lo que quedó sin contestar (Fer, 27/10: a Kari la IA no le contestó más y nadie se enteró). La IA espera
// unos segundos antes de contestar por si el cliente sigue escribiendo; si en esa espera se corta el servidor, el
// mensaje queda en el aire. Cada minuto, pg_cron (job 'mensajes-repaso', db/mensajes.sql) llama a este repaso si hay un
// chat con la IA prendida cuyo último mensaje es del cliente y lleva más de 90 segundos sin respuesta: la IA contesta
// ahora y, si tampoco puede, el chat queda «En espera» para una persona. Cada chat se repasa una vez por mensaje (repaso_ts).

import { consulta } from "@/lib/erp/base";
import { configMensajes } from "./config";
import { abrirCaso } from "./chats";
import { contestar } from "./estela";

/** Lo que la IA decidió no contestar a propósito (un «gracias», un emoji) o no le tocaba: no es una falla. */
/** Las fallas que ya dejan su propio caso «En espera» (el cupo, el límite por hora, el servicio caído). */
const YA_ABRE_CASO = ["Se llegó al tope de gasto del mes.", "Se llegó al límite de respuestas por hora de este chat.", "El servicio de IA no respondió."];
const SIN_FALLA = ["No había nada para decir.", "No hay nada nuevo del cliente.", "Este chat lo atiende una persona.", "Mientras pensaba, lo tomó una persona.", "La IA de los mensajes está apagada."];

export async function repasarSinContestar(hasta: number): Promise<{ repasados: number; derivados: number }> {
  // Se marcan antes de contestar: si este repaso también se corta, el próximo no lo vuelve a intentar sin fin.
  const chats = await consulta<{ id: number; org: string }>(`
    update chat ch set repaso_ts = now()
     where ch.canal in ('whatsapp', 'instagram') and ch.atiende_persona_desde is null
       and ch.ultimo_entrante_ts between now() - interval '1 hour' and now() - interval '90 seconds'
       and (ch.repaso_ts is null or ch.repaso_ts < ch.ultimo_entrante_ts)
       and not exists (select 1 from chat_mensaje m where m.chat_id = ch.id and m.clase <> 'entrante' and m.ts > ch.ultimo_entrante_ts)
    returning ch.id::int, ch.organizacion_id org`);
  let derivados = 0;
  for (const ch of chats) {
    if (Date.now() > hasta) break;
    if (!(await configMensajes(ch.org)).iaActiva) continue;
    await consulta("delete from chat_espera where chat_id = $1", [ch.id]);
    const r = await contestar(ch.org, ch.id).catch((e) => { console.error("[mensajes-repaso]", ch.org, ch.id, e); return { texto: null, motivo: "falla" }; });
    if (r.texto || SIN_FALLA.includes(r.motivo ?? "") || YA_ABRE_CASO.includes(r.motivo ?? "")) continue;
    await abrirCaso(ch.org, ch.id, "La IA no contestó el último mensaje", "El cliente escribió y la IA no pudo contestarle. Hace falta que le responda una persona.");
    derivados++;
  }
  return { repasados: chats.length, derivados };
}
