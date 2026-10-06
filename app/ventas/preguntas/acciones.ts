"use server";

import { deFondo } from "@/lib/tareas-fondo";
import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { una, consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { cuentasDe, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { barrerPreguntas, sugerirRespuesta, responder } from "@/lib/mercadolibre/preguntas";
import { importarConversacion, sugerirMensaje, enviarMensaje } from "@/lib/mercadolibre/mensajes";
import { guardarRespuestaAuto } from "@/lib/mercadolibre/respuesta-auto";

const VOLVER = "/ventas/preguntas";
const volverMensajes = (pack: string) => `${VOLVER}?ver=mensajes&pack=${encodeURIComponent(pack)}`;
/** El pack llega del formulario: sólo dígitos (los ids de ML). */
const pack = (fd: FormData) => {
  const p = texto(fd, "pack") ?? "";
  if (!/^\d{1,30}$/.test(p)) throw new ErrorErp("No se sabe de qué conversación es.");
  return p;
};

/** Trae ahora las preguntas sin responder de todas las cuentas con canal. */
export async function accionTraerPreguntas() {
  const s = await entrarErp("preguntas_ver");
  return deFondo(s, "preguntas-ml", "Preguntas de Mercado Libre", async () => {
    const cuentas = (await cuentasDe(s.org.id)).filter((c) => c.canalId && c.estado === "activa");
    if (cuentas.length === 0) throw new ErrorErp("No hay ninguna cuenta de Mercado Libre conectada a un canal.");
    let pendientes = 0;
    const fallaron: string[] = [];
    for (const c of cuentas) {
      try { pendientes += await barrerPreguntas(c); }
      catch (e) { console.error("[preguntas] barrido", c.id, e); fallaron.push(c.nickname ?? `cuenta ${c.id}`); }
    }
    revalidatePath(VOLVER);
    if (fallaron.length === cuentas.length) throw new ErrorErp("Mercado Libre no devolvió las preguntas. Probá de nuevo en un momento.");
    const n = `${pendientes} pregunta${pendientes === 1 ? "" : "s"} sin responder.`;
    return fallaron.length ? `${n} No se pudo traer de: ${fallaron.join(", ")}.` : n;
  });
}

export async function accionProponerRespuesta(fd: FormData) {
  const s = await entrarErp("preguntas_ver");
  await intentar(VOLVER, async () => {
    const p = await sugerirRespuesta(s.org.id, id(fd));
    revalidatePath(VOLVER);
    return p.estado === "persona" ? "La IA propuso una respuesta, pero el comprador pide hablar con una persona: revisala vos."
      : "La IA propuso una respuesta: revisala antes de mandarla.";
  });
}

export async function accionResponder(fd: FormData) {
  const s = await entrarErp("preguntas_ver");
  await intentar(VOLVER, async () => {
    await responder(s.org.id, id(fd), texto(fd, "texto") ?? "", s.usuario.id);
    revalidatePath(VOLVER);
    return "Respuesta enviada.";
  });
}

export async function accionActualizarConversacion(fd: FormData) {
  const s = await entrarErp("preguntas_ver");
  const p = texto(fd, "pack") ?? "";
  return deFondo(s, `conversacion:${p}`, "Conversación de Mercado Libre", async () => {
    const conv = await una<{ canal_id: string | null }>(
      "select canal_id from meli_conversacion where organizacion_id = $1 and pack_id = $2", [s.org.id, pack(fd)]);
    if (!conv?.canal_id) throw new ErrorErp("La conversación no existe.");
    const cuenta = await cuentaDelCanal(s.org.id, Number(conv.canal_id));
    if (!cuenta) throw new ErrorErp("La cuenta de Mercado Libre ya no está conectada.");
    try { await importarConversacion(cuenta, p, true); }
    catch (e) { console.error("[mensajes] actualizar", p, e); throw new ErrorErp("Mercado Libre no devolvió la conversación. Probá de nuevo en un momento."); }
    revalidatePath(VOLVER);
    return "Conversación actualizada.";
  });
}

export async function accionProponerMensaje(fd: FormData) {
  const s = await entrarErp("preguntas_ver");
  const p = texto(fd, "pack") ?? "";
  await intentar(volverMensajes(p), async () => {
    const r = await sugerirMensaje(s.org.id, pack(fd));
    revalidatePath(VOLVER);
    return r.estado === "persona" ? "La IA propuso una respuesta, pero el comprador pidió hablar con una persona: revisala vos."
      : "La IA propuso una respuesta: revisala antes de mandarla.";
  });
}

export async function accionEnviarMensaje(fd: FormData) {
  const s = await entrarErp("preguntas_ver");
  const p = texto(fd, "pack") ?? "";
  await intentar(volverMensajes(p), async () => {
    await enviarMensaje(s.org.id, pack(fd), texto(fd, "texto") ?? "", s.usuario.id);
    revalidatePath(VOLVER);
    return "Mensaje enviado.";
  });
}

/** Los interruptores "Responde sola la IA" (Fer, 5/10): uno para Preguntas y otro para Mensajes, generales de la
 *  organización. Al prenderlo, lo pendiente se vuelve a proponer para que la IA lo pueda mandar sola (en el próximo
 *  barrido, a los pocos minutos, o cuando entra algo nuevo). */
export async function accionRespuestaAuto(fd: FormData) {
  const s = await entrarErp("preguntas_ver");
  const cual = texto(fd, "cual") === "mensajes" ? "mensajes" : "preguntas";
  const prendido = fd.get("valor") === "1";
  await intentar(cual === "mensajes" ? `${VOLVER}?ver=mensajes` : VOLVER, async () => {
    await guardarRespuestaAuto(s.org.id, cual, prendido);
    if (prendido && cual === "preguntas") {
      await consulta("update meli_pregunta set sugerencia = null, sugerencia_intento_ts = null where organizacion_id = $1 and estado = 'UNANSWERED'", [s.org.id]);
    }
    if (prendido && cual === "mensajes") {
      await consulta(`update meli_conversacion set sugerencia = null, sugerencia_intento_ts = null
                       where organizacion_id = $1 and sin_leer > 0 and pidio_persona_ts is null`, [s.org.id]);
    }
    revalidatePath(VOLVER);
    const que = cual === "mensajes" ? "los mensajes" : "las preguntas";
    return prendido ? `Prendido: la IA contesta sola ${que} (lo que no sabe, o si piden una persona, queda para vos).`
      : `Apagado: la IA sólo propone la respuesta de ${que}; la mandás vos.`;
  });
}
