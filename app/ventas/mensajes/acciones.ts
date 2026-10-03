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
