// Los audios del WhatsApp de la tienda (Fer, 4/11), con la base y Meta: escuchar el que manda el cliente y
// mandarle la nota de voz de la IA. Las reglas y los proveedores, en lib/mensajes/voz.ts (copiados de CadaMes).

import { consulta, una } from "@/lib/erp/base";
import { bajarDeWhatsapp } from "@/lib/pagos/comprobante-whatsapp";
import { nombreTienda, tiendaDeOrg } from "@/lib/tienda/tienda";
import { abrirCaso, credencialDeOrg, guardarMensaje, type Chat } from "./chats";
import { enviarAudio, subirMedia } from "./meta";
import { llavesDe } from "./llaves";
import { acuseDeAudio, contextoTienda, hablar, segundosDeAudio, transcribir, USD_HABLAR_MIN, USD_TRANSCRIBIR_MIN, type VozElegida } from "./voz";

/** Lo gastado fuera de una respuesta (transcribir) cuenta para el tope igual: queda en un mensaje vacío que no se ve. */
async function anotarGasto(org: string, chatId: number, usd: number, que: string) {
  if (usd <= 0) return;
  await consulta(`insert into chat_mensaje (organizacion_id, chat_id, direccion, clase, texto, herramientas, usd, estado_entrega)
                  values ($1, $2, 'saliente', 'ia', '', $3::jsonb, $4, 'fallido')`, [org, chatId, JSON.stringify([{ nombre: que }]), usd]).catch(() => {});
}

/** Escucha la nota de voz de un mensaje del cliente: la baja de Meta, la transcribe y deja el texto en el mensaje
 *  («🎤 …»), así la IA y quien atiende lo leen sin auriculares. Si no se pudo (muy largo, no se entendió), abre un
 *  caso para una persona y devuelve el acuse para el cliente. */
export async function escucharAudio(org: string, chatId: number, mensajeId: number, mediaId: string):
  Promise<{ ok: true } | { ok: false; acuse: string }> {
  const cred = await credencialDeOrg(org);
  const archivo = cred ? await bajarDeWhatsapp(cred.token, mediaId) : null;
  const llave = (await llavesDe(org)).openai;
  const t = archivo
    ? await transcribir({ datos: archivo.datos, tipo: archivo.tipo, llave, contexto: contextoTienda(await tiendaDeOrg(org).then((x) => (x ? nombreTienda(x) : "")).catch(() => "")) })
    : ({ que: "no_se_pudo" } as const);
  if (archivo && t.que !== "muy_largo") await anotarGasto(org, chatId, (segundosDeAudio(archivo.datos.length) / 60) * USD_TRANSCRIBIR_MIN, "transcribir_audio");
  if (t.que !== "listo") {
    if (!archivo) console.error("[audio] no se pudo bajar", org, mediaId);
    await abrirCaso(org, chatId, t.que === "muy_largo" ? "Mandó un audio largo" : "Mandó un audio que no se entendió",
      t.que === "muy_largo" ? "El audio es muy largo para escucharlo solo (más de uno o dos minutos): escuchalo en el chat." : "No se pudo pasar el audio a texto: escuchalo en el chat.");
    return { ok: false, acuse: acuseDeAudio(t.que) };
  }
  await consulta("update chat_mensaje set texto = $2, adjunto = coalesce(adjunto, '{}'::jsonb) || '{\"transcripto\": true}'::jsonb where id = $1", [mensajeId, `🎤 ${t.texto}`]);
  return { ok: true };
}

/** Manda la respuesta como nota de voz (antes del texto, nunca en su lugar). Nunca tira y nunca corta: si no sale,
 *  sigue el texto solo. Queda en el chat como «🎤 …» con el audio para escucharlo. */
export async function hablarPorWhatsapp(org: string, chat: Chat, texto: string, voz: Exclude<VozElegida, "apagado">): Promise<boolean> {
  try {
    if (chat.canal !== "whatsapp") return false;
    const cred = await credencialDeOrg(org);
    if (!cred) return false;
    const h = await hablar(texto, voz, await llavesDe(org));
    if (!h.ok) return false;
    const cuenta = { token: cred.token, phoneNumberId: cred.phoneNumberId };
    const mediaId = await subirMedia(cuenta, h.audio, "audio/ogg", "respuesta.ogg");
    if (!mediaId) return false;
    const r = await enviarAudio(cuenta, chat.externo, mediaId);
    const usd = (Math.max(1, h.duracionSeg) / 60) * USD_HABLAR_MIN;
    await guardarMensaje({
      org, chatId: chat.id, clase: "ia", texto: `🎤 ${texto}`, wamid: r.ok ? r.wamid : null, estado: r.ok ? "enviado" : "fallido",
      motivo: r.ok ? null : r.motivo, usd, herramientas: [{ nombre: "nota_de_voz" }],
      adjunto: { media_id: mediaId, tipo: "audio/ogg", nombre: "Nota de voz" },
    });
    return r.ok;
  } catch (e) {
    console.error("[voz-responder]", org, chat.id, e);
    return false;
  }
}

/** ¿El último mensaje del cliente fue una nota de voz? (para contestar en espejo). */
export async function ultimoFueAudio(chatId: number): Promise<boolean> {
  const r = await una<{ audio: boolean }>(`select coalesce(adjunto ->> 'tipo' like 'audio%', false) audio from chat_mensaje
     where chat_id = $1 and clase = 'entrante' order by id desc limit 1`, [chatId]);
  return !!r?.audio;
}
