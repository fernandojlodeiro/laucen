// Los archivos que se le mandan al asistente (Fer, 4/11): fotos, PDF, Excel y CSV. La pantalla los sube a Storage
// (bucket «importaciones», <org>/asistente/…) y manda sus datos con la pregunta; acá se anotan (asistente_adjunto), se
// arman para que la IA los vea en esa pregunta (imagen, documento o texto) y se nombran por su número (#id) en la
// historia, para que una herramienta los use después (cargar facturas de gasto, el reporte de ARCA).

import type Anthropic from "@anthropic-ai/sdk";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { supabaseServer } from "@/lib/supabase";

export const MAX_ADJUNTOS = 20;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_IMAGEN = 5 * 1024 * 1024;
const MAX_TEXTO = 60_000;

export type AdjuntoNuevo = { ruta: string; nombre: string; tipo: string; tamano: number };
export type Adjunto = { id: number; ruta: string; nombre: string; tipo: string; tamano: number };

/** El tipo por el contenido (hay fotos guardadas como PDF y PDF sin extensión) o por la extensión. */
export function tipoDe(datos: ArrayBuffer | null, nombre: string, declarado: string): string {
  if (datos) {
    const b = new Uint8Array(datos.slice(0, 8));
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
    if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "image/webp";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  }
  if (/\.xlsx$/i.test(nombre)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (/\.(csv|txt)$/i.test(nombre)) return "text/csv";
  return declarado || "application/octet-stream";
}

/** Anota los archivos de una pregunta (sólo los de esta organización, en su carpeta del asistente). */
export async function anotarAdjuntos(org: string, conversacionId: number, mensajeId: number, usuarioId: string, lista: AdjuntoNuevo[]): Promise<Adjunto[]> {
  const buenos = lista.slice(0, MAX_ADJUNTOS).filter((a) => typeof a?.ruta === "string" && a.ruta.startsWith(`${org}/asistente/`) && !a.ruta.includes(".."));
  const out: Adjunto[] = [];
  for (const a of buenos) {
    const r = await una<{ id: number }>(`insert into asistente_adjunto (organizacion_id, conversacion_id, mensaje_id, usuario_id, ruta, nombre, tipo, tamano)
      values ($1, $2, $3, $4, $5, $6, $7, $8) returning id::int`,
    [org, conversacionId, mensajeId, usuarioId, a.ruta, String(a.nombre ?? "archivo").slice(0, 200), String(a.tipo ?? "").slice(0, 120), Math.max(0, Number(a.tamano) || 0)]);
    out.push({ id: r!.id, ruta: a.ruta, nombre: String(a.nombre ?? "archivo").slice(0, 200), tipo: String(a.tipo ?? ""), tamano: Number(a.tamano) || 0 });
  }
  return out;
}

/** Los archivos de una conversación, por número (sólo de esta organización). */
export async function adjuntosPorId(org: string, ids: number[]): Promise<(Adjunto & { lectura: unknown; conversacion_id: number })[]> {
  if (!ids.length) return [];
  return consulta(`select id::int, ruta, nombre, tipo, tamano, lectura, conversacion_id::int from asistente_adjunto where organizacion_id = $1 and id = any($2::bigint[]) order by id`,
    [org, ids]);
}

/** Baja un archivo del asistente. */
export async function bajarAdjunto(ruta: string): Promise<ArrayBuffer> {
  const { data, error } = await (await supabaseServer()).storage.from("importaciones").download(ruta);
  if (error || !data) throw new ErrorErp("No se pudo bajar el archivo que mandaste. Probá de nuevo.");
  return data.arrayBuffer();
}

/** Un Excel o un CSV, como texto (para que la IA lo lea). */
async function comoTexto(datos: ArrayBuffer, tipo: string): Promise<string> {
  if (tipo.includes("spreadsheetml")) {
    const { tablaDeExcel } = await import("@/lib/administracion/arca-mc-archivo");
    const tabla = await tablaDeExcel(datos);
    return tabla.map((f) => f.map((c) => (c == null ? "" : String(c))).join("\t")).join("\n");
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(datos); } catch { return new TextDecoder("windows-1252").decode(datos); }
}

/** Lo que ve la IA de los archivos de esta pregunta: cada uno con su número y, si se puede, su contenido. */
export async function bloquesDeAdjuntos(adjuntos: Adjunto[]): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const bloques: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const a of adjuntos) {
    const titulo = `[Archivo #${a.id}: «${a.nombre}»]`;
    try {
      if (a.tamano > MAX_BYTES) { bloques.push({ type: "text", text: `${titulo} (muy grande para verlo: más de 20 MB)` }); continue; }
      const datos = await bajarAdjunto(a.ruta);
      const tipo = tipoDe(datos, a.nombre, a.tipo);
      const b64 = () => Buffer.from(datos).toString("base64");
      if (/^image\/(png|jpeg|webp|gif)$/.test(tipo) && datos.byteLength <= MAX_IMAGEN) {
        bloques.push({ type: "text", text: titulo }, { type: "image", source: { type: "base64", media_type: tipo as "image/png", data: b64() } });
      } else if (tipo === "application/pdf") {
        bloques.push({ type: "text", text: titulo }, { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64() } });
      } else if (tipo.includes("spreadsheetml") || tipo.startsWith("text/")) {
        const t = await comoTexto(datos, tipo);
        bloques.push({ type: "text", text: `${titulo} (contenido como texto${t.length > MAX_TEXTO ? ", recortado" : ""}):\n${t.slice(0, MAX_TEXTO)}` });
      } else {
        bloques.push({ type: "text", text: `${titulo} (de un tipo que no puedo ver: ${tipo})` });
      }
    } catch (e) {
      console.error("[asistente-adjunto]", a.id, e);
      bloques.push({ type: "text", text: `${titulo} (no se pudo abrir)` });
    }
  }
  return bloques;
}

/** Cómo quedan en la historia (texto): «(mandó: #12 factura.pdf, #13 foto.jpg)». */
export const notaDeAdjuntos = (lista: { id: number; nombre: string }[]) =>
  lista.length ? `\n(Mandó ${lista.length === 1 ? "el archivo" : "los archivos"}: ${lista.map((a) => `#${a.id} «${a.nombre}»`).join(", ")})` : "";

/** Los archivos de los mensajes de una conversación, para la pantalla y para la historia. */
export async function adjuntosDeMensajes(org: string, mensajes: number[]): Promise<Map<number, { id: number; nombre: string; tipo: string }[]>> {
  const m = new Map<number, { id: number; nombre: string; tipo: string }[]>();
  if (!mensajes.length) return m;
  const filas = await consulta<{ id: number; mensaje_id: number; nombre: string; tipo: string }>(
    "select id::int, mensaje_id::int, nombre, tipo from asistente_adjunto where organizacion_id = $1 and mensaje_id = any($2::bigint[]) order by id", [org, mensajes]);
  for (const f of filas) m.set(f.mensaje_id, [...(m.get(f.mensaje_id) ?? []), { id: f.id, nombre: f.nombre, tipo: f.tipo }]);
  return m;
}
