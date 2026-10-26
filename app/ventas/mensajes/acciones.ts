"use server";
// Lo que se hace desde la carpeta de mensajes: contestar, prender o apagar la
// IA de un chat, resolver un caso en espera, las notas del chat y el
// probador (escribirle a la IA como si fueras un cliente).

import { revalidatePath } from "next/cache";
import { sesionRequerida } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { consulta } from "@/lib/erp/base";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { chatDe, chatPorId, guardarMensaje, ponerIa, resolverCaso, tomarCasos } from "@/lib/mensajes/chats";
import { contestar, mandar } from "@/lib/mensajes/estela";
import { ventanaAbierta } from "@/lib/mensajes/reglas";
import { partirClave } from "@/lib/mensajes/bandeja-tipos";
import { motivoErp } from "@/lib/erp/base";
import { enviarMensaje, sugerirMensaje } from "@/lib/mercadolibre/mensajes";
import { responder, sugerirRespuesta } from "@/lib/mercadolibre/preguntas";
import { encolarAccionReclamo } from "@/lib/mercadolibre/reclamos";

type Resultado = { ok: true } | { ok: false; error: string };

async function sesion() {
  await asegurarEsquemaErp();
  const s = await sesionRequerida();
  if (!tienePermiso(s.permisos, "mensajes_ver")) throw new Error("Tu rol no tiene permiso para los mensajes.");
  return s;
}

const fallo = (e: unknown): Resultado => ({ ok: false, error: e instanceof Error ? e.message : "No se pudo." });

export async function accionEnviar(chatId: number, texto: string): Promise<Resultado> {
  try {
    const s = await sesion();
    const t = texto.trim();
    if (!t) return { ok: false, error: "Escribí algo." };
    const chat = await chatPorId(s.org.id, chatId);
    if (!chat) return { ok: false, error: "No existe ese chat." };
    if (chat.canal === "whatsapp" && !ventanaAbierta(chat.ultimoEntranteTs))
      return { ok: false, error: "Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribirle desde acá. Escribile desde el teléfono; cuando conteste, seguís desde acá." };
    const r = await mandar(s.org.id, chat, t, { clase: "operador", usuarioId: s.usuario.id });
    await tomarCasos(s.org.id, chatId, s.usuario.id);
    return r.ok ? { ok: true } : { ok: false, error: r.motivo ?? "No se pudo mandar." };
  } catch (e) { return fallo(e); }
}

// ── La bandeja unificada (Fer, 25/10): cada conversación sale por el camino de su canal ──────────

/** Quién puede qué: los chats (WhatsApp, Instagram), lo de Mercado Libre y los reclamos, cada uno con su permiso. */
async function sesionDe(tipo: "c" | "m" | "p" | "r") {
  await asegurarEsquemaErp();
  const s = await sesionRequerida();
  const permiso = tipo === "c" ? "mensajes_ver" : tipo === "r" ? "reclamos_ver" : "preguntas_ver";
  if (!s.superadmin && !tienePermiso(s.permisos, permiso)) throw new Error("Tu rol no tiene permiso para esta conversación.");
  return s;
}

function clave(c: string) {
  const k = partirClave(c);
  if (!k) throw new Error("No se sabe qué conversación es.");
  return k;
}

/** Contestar desde la bandeja, venga de donde venga la conversación. */
export async function accionEnviarBandeja(c: string, texto: string): Promise<Resultado & { aviso?: string }> {
  try {
    const k = clave(c);
    if (k.tipo === "c") return accionEnviar(Number(k.id), texto);
    const s = await sesionDe(k.tipo);
    const t = texto.trim();
    if (!t) return { ok: false, error: "Escribí algo." };
    if (k.tipo === "m") await enviarMensaje(s.org.id, k.id, t, s.usuario.id);
    else if (k.tipo === "p") await responder(s.org.id, Number(k.id), t, s.usuario.id);
    else {
      const d = await encolarAccionReclamo(s.org.id, Number(k.id), "send_message_to_complainant", { mensaje: t }, s.usuario.id);
      return { ok: true, aviso: `Sale en unos segundos: ${d}` };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: motivoErp(e) }; }
}

/** El interruptor de la IA de una conversación: un chat, o una conversación de Mercado Libre (apagada, la atiende una
 *  persona; prendida de nuevo, la IA vuelve a contestar sola lo que entre). */
export async function accionIaBandeja(c: string, prender: boolean): Promise<Resultado> {
  try {
    const k = clave(c);
    if (k.tipo === "c") return accionIa(Number(k.id), prender);
    if (k.tipo !== "m") return { ok: false, error: "Esta conversación no la contesta la IA." };
    const s = await sesionDe(k.tipo);
    await consulta(prender
      ? "update meli_conversacion set pidio_persona_ts = null, derivada_ts = null where organizacion_id = $1 and pack_id = $2"
      : "update meli_conversacion set derivada_ts = coalesce(derivada_ts, now()) where organizacion_id = $1 and pack_id = $2", [s.org.id, k.id]);
    return { ok: true };
  } catch (e) { return { ok: false, error: motivoErp(e) }; }
}

/** «Pedirle a Estela» (Fer, 26/10): lo escrito en la caja es una indicación para la IA (no va al cliente); ella
 *  escribe y manda su próximo mensaje siguiéndola. Si el chat lo atendía una persona, la IA vuelve a atenderlo. */
export async function accionPedirleIa(c: string, encargo: string): Promise<Resultado & { texto?: string }> {
  try {
    const k = clave(c);
    if (k.tipo !== "c") return { ok: false, error: "Acá la IA no recibe indicaciones." };
    const s = await sesion();
    const t = encargo.trim();
    if (!t) return { ok: false, error: "Escribí en la caja qué querés que haga." };
    const chat = await chatPorId(s.org.id, Number(k.id));
    if (!chat) return { ok: false, error: "No existe ese chat." };
    if (chat.canal === "whatsapp" && !ventanaAbierta(chat.ultimoEntranteTs))
      return { ok: false, error: "Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribirle desde acá." };
    if (chat.atiendePersonaDesde) await ponerIa(s.org.id, chat.id, true);
    const r = await contestar(s.org.id, chat.id, t);
    return r.texto ? { ok: true, texto: r.texto } : { ok: false, error: r.motivo ?? "La IA no mandó nada." };
  } catch (e) { return fallo(e); }
}

/** «Proponer con IA»: la IA escribe la respuesta en la caja (no la manda). */
export async function accionProponerBandeja(c: string): Promise<(Resultado & { texto?: string })> {
  try {
    const k = clave(c);
    if (k.tipo !== "m" && k.tipo !== "p") return { ok: false, error: "Acá la IA no propone respuestas." };
    const s = await sesionDe(k.tipo);
    const r = k.tipo === "m" ? await sugerirMensaje(s.org.id, k.id) : await sugerirRespuesta(s.org.id, Number(k.id));
    if (r.estado === "nada") return { ok: false, error: "La IA ve que el último mensaje no necesita respuesta: la conversación ya no figura sin responder." };
    return { ok: true, texto: r.texto };
  } catch (e) { return { ok: false, error: motivoErp(e) }; }
}

export async function accionIa(chatId: number, prender: boolean): Promise<Resultado> {
  try {
    const s = await sesion();
    await ponerIa(s.org.id, chatId, prender);
    // Al prenderla, si el cliente quedó esperando respuesta, contesta ya.
    if (prender) await contestar(s.org.id, chatId).catch((e) => console.error("[mensajes] contestar al prender", e));
    return { ok: true };
  } catch (e) { return fallo(e); }
}

export async function accionResolverCaso(chatId: number, casoId: number, resolucion: string): Promise<Resultado> {
  try {
    const s = await sesion();
    await resolverCaso(s.org.id, casoId, resolucion.trim() || `Resuelto por ${s.usuario.nombre}`, chatId);
    return { ok: true };
  } catch (e) { return fallo(e); }
}

export async function accionNotas(chatId: number, notas: string): Promise<Resultado> {
  try {
    const s = await sesion();
    await consulta("update chat set notas = $3 where organizacion_id = $1 and id = $2", [s.org.id, chatId, notas.slice(0, 4000)]);
    return { ok: true };
  } catch (e) { return fallo(e); }
}

// ── El probador: vos escribís como cliente y contesta la IA ──────────
const externoPrueba = (usuarioId: string) => `prueba:${usuarioId}`;

export async function accionProbar(texto: string): Promise<Resultado & { chatId?: number; motivo?: string }> {
  try {
    const s = await sesion();
    const t = texto.trim();
    if (!t) return { ok: false, error: "Escribí algo." };
    const chat = await chatDe(s.org.id, "prueba", externoPrueba(s.usuario.id), `Prueba de ${s.usuario.nombre}`);
    await guardarMensaje({ org: s.org.id, chatId: chat.id, clase: "entrante", texto: t });
    const r = await contestar(s.org.id, chat.id);
    revalidatePath("/ventas/mensajes/probar");
    return { ok: true, chatId: chat.id, motivo: r.texto ? undefined : r.motivo };
  } catch (e) { return fallo(e); }
}

export async function accionProbarDeNuevo(): Promise<Resultado> {
  try {
    const s = await sesion();
    await consulta("delete from chat where organizacion_id = $1 and canal = 'prueba' and externo = $2", [s.org.id, externoPrueba(s.usuario.id)]);
    revalidatePath("/ventas/mensajes/probar");
    return { ok: true };
  } catch (e) { return fallo(e); }
}
