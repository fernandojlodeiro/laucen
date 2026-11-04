// Los audios de WhatsApp de la IA de la tienda (Fer, 4/11: «escuchar y enviar audios tal cual como en CadaMes,
// con el mismo modelo y la misma manera de configurarlo», sin la voz personalizada: mujer u hombre).
//
// Copiado de CadaMes (src/lib/transcripcion.ts, src/lib/voz.ts, src/lib/respuesta.ts):
//  - Escuchar: OpenAI `gpt-4o-transcribe` (el que ganó el bench de Fer con audios reales: voseo, montos, ruido),
//    con una frase de contexto de la tienda. Tope 200 KB (uno o dos minutos de nota de voz): un audio más largo
//    casi nunca es una pregunta, lo lee una persona.
//  - Hablar: ElevenLabs `eleven_flash_v2_5` con el ajuste de entonación de CadaMes (Fer, 4/11: lo eligió en CadaMes
//    porque, además de más barato, entonaba mejor las preguntas), con la voz elegida (Sofía, mujer; MaxiAraya,
//    hombre: las de CadaMes); si ElevenLabs falla o tarda, OpenAI `gpt-4o-mini-tts` (voz onyx); si
//    también falla, sale sólo el texto (nunca queda muda). Se pide ya en OGG/Opus: es lo único que WhatsApp
//    muestra como nota de voz.
//  - Cuándo: si la voz está prendida, a quien mandó un audio (espejo) o a todos si se tildó «Contestar siempre con
//    audio»; nunca un texto de más de 600 caracteres ni uno que es sólo un link, un número o emojis. La nota de voz
//    sale ANTES del texto, nunca en su lugar.
// Las llaves son de cada organización (lib/mensajes/llaves.ts): van siempre en el header, nunca en la URL, y ningún
// error del proveedor llega a una pantalla: va al log.

import { textoParaVoz } from "./texto-para-voz";

// ── Las voces (las mismas de CadaMes; voice_id de ElevenLabs) ─────────
export type VozElegida = "apagado" | "mujer" | "hombre";
export const VOCES: Record<Exclude<VozElegida, "apagado">, { nombre: string; descripcion: string; voiceId: string }> = {
  mujer: { nombre: "Sofía", descripcion: "cálida y clara", voiceId: "h60rOzgfLmYsntfqgGu2" },
  hombre: { nombre: "MaxiAraya", descripcion: "cercano y directo", voiceId: "s4W8kh4jMEsHFHA7NqXQ" },
};
export const esVoz = (v: unknown): v is VozElegida => v === "apagado" || v === "mujer" || v === "hombre";

export const MODELO_VOZ = "eleven_flash_v2_5";
/** Ajuste de CadaMes (su bitácora #208): de fábrica Flash entona poco y una pregunta sonaba afirmativa. */
const AJUSTE_VOZ = { stability: 0.4, style: 0.4 };
const TIMEOUT_ELEVENLABS_MS = 6_000;
const TIMEOUT_OPENAI_MS = 4_000;

/** Lo que cuesta, aproximado, para el tope de gasto de la IA (US$). Transcribir: US$ 0,006 por minuto. Hablar con
 *  Flash: unos US$ 0,15 por minuto. El audio de WhatsApp (Opus, 16 a 24 kbps) son unos 2,5 KB por segundo. */
export const USD_TRANSCRIBIR_MIN = 0.006;
export const USD_HABLAR_MIN = 0.15;
export const segundosDeAudio = (bytes: number) => Math.max(1, Math.round(bytes / 2500));

/** Las llaves de la organización (lib/mensajes/llaves.ts). */
export type LlavesAudio = { openai: string | null; elevenlabs: string | null };

// ── Escuchar ────────────────────────────────────────────────────────
export const TOPE_AUDIO_KB = 200;

export type Transcripcion = { que: "listo"; texto: string } | { que: "muy_largo" } | { que: "no_se_pudo" };

/** La frase de contexto: es lo que más mejora los audios cortos («sí, la de 3 metros» suelto se transcribe mal). */
export function contextoTienda(tienda: string): string {
  return `Conversación por WhatsApp entre la tienda ${tienda} y un cliente, en Argentina. Se habla de productos, precios, stock, `
    + "envíos, retiros, pedidos, pagos, transferencias y facturas. Español rioplatense con voseo. Los montos se dicen en pesos y a veces en lucas.";
}

/** El nombre del archivo es lo que mira el transcriptor para saber el formato. */
export function extension(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "ogg";
}

/** Convierte el audio en texto. Nunca tira: devuelve por qué no se pudo. */
export async function transcribir(p: { datos: Buffer; tipo: string; contexto?: string; llave: string | null }): Promise<Transcripcion> {
  if (p.datos.length > TOPE_AUDIO_KB * 1024) return { que: "muy_largo" };
  const clave = p.llave;
  if (!clave) { console.error("[transcripcion] falta la llave de OpenAI"); return { que: "no_se_pudo" }; }
  // WhatsApp manda «audio/ogg; codecs=opus»: con el parámetro pegado, del otro lado no reconocen el formato.
  const mime = (p.tipo || "audio/ogg").split(";")[0].trim().toLowerCase();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(p.datos)], { type: mime }), `audio.${extension(mime)}`);
  form.append("model", "gpt-4o-transcribe");
  form.append("language", "es");
  if (p.contexto) form.append("prompt", p.contexto);
  try {
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${clave}` }, body: form, signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) { console.error("[transcripcion]", r.status, (await r.text()).slice(0, 300)); return { que: "no_se_pudo" }; }
    const texto = (((await r.json()) as { text?: string }).text ?? "").trim();
    if (!texto) { console.error("[transcripcion] volvió vacía", p.datos.length, mime); return { que: "no_se_pudo" }; }
    return { que: "listo", texto };
  } catch (e) {
    console.error("[transcripcion]", e);
    return { que: "no_se_pudo" };
  }
}

/** Cómo entra el audio en la charla de la IA: marcado, para que sepa que lo dijo hablando (puede venir una palabra
 *  mal y conviene repetir el dato para que se pueda corregir). */
export const marcaDeAudio = (texto: string) => `[audio transcripto]: "${texto}"`;

/** Lo que se le contesta cuando no se pudo escuchar. */
export const acuseDeAudio = (que: "muy_largo" | "no_se_pudo") => que === "muy_largo"
  ? "Me llegó tu audio pero es largo para escucharlo bien. ¿Me lo contás en un mensaje escrito? Si preferís, lo ve una persona del equipo."
  : "Perdón, no te escuché bien. ¿Me lo repetís o me lo escribís?";

// ── Hablar ──────────────────────────────────────────────────────────
export type Hablado = { ok: true; audio: Buffer; duracionSeg: number } | { ok: false };

async function conTimeout<T>(ms: number, hacer: (s: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController();
  const reloj = setTimeout(() => c.abort(), ms);
  try { return await hacer(c.signal); } finally { clearTimeout(reloj); }
}

/** Con marcas de tiempo: es la forma de que ElevenLabs diga cuánto dura sin abrir el Opus acá. */
async function conElevenLabs(texto: string, voiceId: string, clave: string | null): Promise<Hablado | null> {
  if (!clave) return null;
  try {
    const r = await conTimeout(TIMEOUT_ELEVENLABS_MS, (signal) => fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=opus_48000_32`, {
        method: "POST", headers: { "xi-api-key": clave, "Content-Type": "application/json" },
        body: JSON.stringify({ text: texto, model_id: MODELO_VOZ, voice_settings: AJUSTE_VOZ }), signal,
      }));
    if (!r.ok) { console.error("[voz-elevenlabs]", r.status, (await r.text()).slice(0, 300)); return null; }
    const d = (await r.json()) as { audio_base64?: string; alignment?: { character_end_times_seconds?: number[] } };
    if (!d.audio_base64) return null;
    const marcas = d.alignment?.character_end_times_seconds ?? [];
    return { ok: true, audio: Buffer.from(d.audio_base64, "base64"), duracionSeg: marcas.length ? marcas[marcas.length - 1] : 0 };
  } catch (e) {
    console.error("[voz-elevenlabs]", e);
    return null;
  }
}

async function conOpenAi(texto: string, clave: string | null): Promise<Hablado | null> {
  if (!clave) return null;
  try {
    const r = await conTimeout(TIMEOUT_OPENAI_MS, (signal) => fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "onyx", input: texto, response_format: "opus" }), signal,
    }));
    if (!r.ok) { console.error("[voz-openai]", r.status, (await r.text()).slice(0, 300)); return null; }
    // Sin marcas de tiempo: se estima (de más, a 13 caracteres por segundo).
    return { ok: true, audio: Buffer.from(await r.arrayBuffer()), duracionSeg: Math.ceil(texto.length / 13) + 1 };
  } catch (e) {
    console.error("[voz-openai]", e);
    return null;
  }
}

/** Sintetiza el texto (pasado a «texto para escuchar»: montos, fechas y horas en palabras). Nunca tira. */
export async function hablar(texto: string, voz: Exclude<VozElegida, "apagado">, llaves: LlavesAudio): Promise<Hablado> {
  const t = textoParaVoz(texto.trim());
  if (!t) return { ok: false };
  const principal = await conElevenLabs(t, VOCES[voz].voiceId, llaves.elevenlabs);
  if (principal) return principal;
  // Respaldo: perder la voz elegida es mejor que perder el audio.
  const respaldo = await conOpenAi(t, llaves.openai);
  if (respaldo) return respaldo;
  console.error("[voz] los dos proveedores fallaron, sigue sólo el texto");
  return { ok: false };
}

// ── Cuándo corresponde ──────────────────────────────────────────────
/** ~600 caracteres son unos 45 segundos: más largo, sólo texto. */
export const LARGO_MAXIMO_PARA_HABLAR = 600;

/** Sólo un link, un número o emojis: no se sintetiza. Pura. */
export function esSoloLinkNumeroOEmoji(texto: string): boolean {
  const sinUrls = texto.replace(/https?:\/\/\S+/gi, "");
  const sinEmoji = sinUrls.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu, "");
  return sinEmoji.replace(/[\d.,\-+()/%$\s]/g, "").trim().length === 0;
}

/** El renglón que separa lo que se dice de lo que va escrito (la IA lo pone cuando contesta en audio). */
export const SEPARADOR_ESCRITO = "---";

/** Lo que se dice y lo que va escrito (Fer, 4/11: «los links en la voz quedan horribles» y «que no detalle los
 *  productos hablando»): lo que sigue al renglón «---» va sólo escrito (la lista de productos con sus links); antes,
 *  lo que se dice. Un renglón con link que quedó arriba también pasa a lo escrito. Pura. */
export function partirParaVoz(texto: string): { hablado: string; escrito: string | null } {
  const conLink = /https?:\/\/\S+|\b[\w-]+(\.[\w-]+)+\/\S*/i;
  const todos = texto.split("\n");
  const corte = todos.findIndex((r) => r.trim() === SEPARADOR_ESCRITO);
  const renglones = corte >= 0 ? todos.slice(0, corte) : todos;
  const abajo = corte >= 0 ? todos.slice(corte + 1).map((r) => r.trimEnd()) : [];
  const arriba = renglones.filter((r) => conLink.test(r)).map((r) => r.trim()).filter(Boolean);
  const escritoTodo = [...arriba, ...abajo].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const hablado = renglones.filter((r) => !conLink.test(r)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { hablado, escrito: escritoTodo || null };
}

/** Lo mismo para cuando sale todo escrito (la voz falló o es muy largo): sin el renglón «---». Pura. */
export const sinSeparador = (texto: string) => texto.split("\n").filter((r) => r.trim() !== SEPARADOR_ESCRITO).join("\n").trim();

/** Lo que se le avisa a la IA antes de escribir cuando su respuesta va a salir como nota de voz. */
export const AVISO_VA_EN_AUDIO = "[Tu respuesta va a salir como nota de voz. Escribila en dos partes separadas por un renglón que diga sólo ---. "
  + "Arriba, lo que se escucha: corto y conversado, sin nombres de productos, modelos, características técnicas, precios, links ni números largos. "
  + "Si le ofrecés productos, decí sólo cuántas opciones hay y que le pasás la lista por escrito (ej. «Tengo tres opciones, te paso la lista con los links para que las veas»). "
  + "Abajo del ---, lo que le llega escrito: la lista prolija, un producto por renglón con su nombre y precio, y el link en el renglón siguiente. "
  + "Si no hay nada para escribir (un horario, una dirección, una pregunta), no pongas el --- y contestá todo hablado.]";

/** ¿Va nota de voz con esta respuesta? Pura. */
export function correspondeAudio(p: { voz: VozElegida; siempre: boolean; entradaFueAudio: boolean; texto: string }): boolean {
  if (p.voz === "apagado") return false;
  if (!p.siempre && !p.entradaFueAudio) return false;
  const t = p.texto.trim();
  if (!t || t.length > LARGO_MAXIMO_PARA_HABLAR) return false;
  return !esSoloLinkNumeroOEmoji(t);
}

/** La frase de la muestra que se escucha en Configuración. */
export const fraseDeMuestra = (nombreIa: string) =>
  `Hola, soy ${nombreIa}. Te ayudo con los productos, los precios, tus pedidos y tus consultas. ¿En qué te puedo dar una mano?`;
