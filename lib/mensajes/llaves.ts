// Las llaves de los audios de cada organización (Fer, 4/11): OpenAI (escuchar las notas de voz) y ElevenLabs (hablar).
// Las carga cada organización en Ventas › Mensajes › Configuración › Audios (tabla ia_llave): nunca se muestran, sólo
// si hay o no. Si una organización no cargó la suya, se usa la de Laucen (OPENAI_API_KEY, ELEVENLABS_API_KEY en
// Vercel), si la hay.

import { consulta } from "@/lib/erp/base";

export type Proveedor = "openai" | "elevenlabs";
export type Llaves = { openai: string | null; elevenlabs: string | null };
export type EstadoLlave = { de: "propia" | "laucen" | "falta"; cargada: string | null };

const delSistema = (p: Proveedor) => (p === "openai" ? process.env.OPENAI_API_KEY : process.env.ELEVENLABS_API_KEY)?.trim() || null;

/** Las llaves con que trabaja la organización: la suya o, si no cargó, la de Laucen. */
export async function llavesDe(org: string): Promise<Llaves> {
  const filas = await consulta<{ proveedor: Proveedor; llave: string }>("select proveedor, llave from ia_llave where organizacion_id = $1", [org]).catch(() => []);
  const propia = (p: Proveedor) => filas.find((f) => f.proveedor === p)?.llave || null;
  return { openai: propia("openai") ?? delSistema("openai"), elevenlabs: propia("elevenlabs") ?? delSistema("elevenlabs") };
}

/** Para la pantalla: de quién es cada llave y desde cuándo (nunca la llave). */
export async function estadoLlaves(org: string): Promise<Record<Proveedor, EstadoLlave>> {
  const filas = await consulta<{ proveedor: Proveedor; cargada: string }>(
    "select proveedor, to_char(cargada_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY') cargada from ia_llave where organizacion_id = $1", [org]).catch(() => []);
  const de = (p: Proveedor): EstadoLlave => {
    const f = filas.find((x) => x.proveedor === p);
    return f ? { de: "propia", cargada: f.cargada } : { de: delSistema(p) ? "laucen" : "falta", cargada: null };
  };
  return { openai: de("openai"), elevenlabs: de("elevenlabs") };
}

/** Prueba la llave con una palabra («Hola») antes de grabarla: así no queda cargada una que no anda. Devuelve el
 *  motivo en criollo si no sirve (el detalle del proveedor va al log, nunca a la pantalla). */
export async function probarLlave(p: Proveedor, llave: string): Promise<string | null> {
  try {
    const r = p === "openai"
      ? await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST", headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "onyx", input: "Hola", response_format: "opus" }), signal: AbortSignal.timeout(15_000),
        })
      : await fetch("https://api.elevenlabs.io/v1/text-to-speech/h60rOzgfLmYsntfqgGu2?output_format=opus_48000_32", {
          method: "POST", headers: { "xi-api-key": llave, "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Hola", model_id: "eleven_multilingual_v2" }), signal: AbortSignal.timeout(15_000),
        });
    if (r.ok) return null;
    console.error("[llave-audio]", p, r.status, (await r.text()).slice(0, 300));
    if (r.status === 401) return `${p === "openai" ? "OpenAI" : "ElevenLabs"} dice que esa llave no es válida. Revisá que la hayas copiado entera.`;
    if (r.status === 403) return `Esa llave no tiene permiso para ${p === "openai" ? "audio" : "«Text to Speech»"}: dáselo en ${p === "openai" ? "OpenAI" : "ElevenLabs"} y probá de nuevo.`;
    if (r.status === 429 || r.status === 402) return `La cuenta de ${p === "openai" ? "OpenAI" : "ElevenLabs"} no tiene saldo o llegó a su límite.`;
    return `${p === "openai" ? "OpenAI" : "ElevenLabs"} no respondió bien. Probá de nuevo en un momento.`;
  } catch (e) {
    console.error("[llave-audio]", p, e);
    return `${p === "openai" ? "OpenAI" : "ElevenLabs"} no responde. Probá de nuevo en un momento.`;
  }
}

export async function guardarLlave(org: string, p: Proveedor, llave: string, usuarioId: string): Promise<void> {
  await consulta(`insert into ia_llave (organizacion_id, proveedor, llave, usuario_id) values ($1, $2, $3, $4)
                  on conflict (organizacion_id, proveedor) do update set llave = excluded.llave, cargada_ts = now(), usuario_id = excluded.usuario_id`,
    [org, p, llave, usuarioId]);
}

export async function borrarLlave(org: string, p: Proveedor): Promise<void> {
  await consulta("delete from ia_llave where organizacion_id = $1 and proveedor = $2", [org, p]);
}

export const hayLlave = async (org: string, p: Proveedor) => !!(await llavesDe(org))[p];
