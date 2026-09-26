// Acceso común a Claude (API de Anthropic). Llave en ANTHROPIC_API_KEY; si la
// llave es de la cuenta y no de un workspace, hace falta ANTHROPIC_WORKSPACE_ID.

import Anthropic from "@anthropic-ai/sdk";

export const MODELO = "claude-opus-5";
/** Precio de Claude Opus 5 por millón de tokens (US$): entrada / salida. */
export const USD_POR_MTOK = { entrada: 5, salida: 25 };

export function hayClaude() {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export function clienteClaude() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
}

export type Contenido = Anthropic.MessageParam["content"];
export type Respuesta = { texto: string; tokensIn: number; tokensOut: number } | { error: string; tokensIn: number; tokensOut: number };

/** Un pedido a Claude. Nunca tira: devuelve el texto o el error, y siempre
 *  los tokens usados (para el costo). */
export async function pedirClaude({ system, contenido, maxTokens = 4000, effort = "low" }: {
  system: string; contenido: Contenido; maxTokens?: number; effort?: "low" | "medium" | "high";
}): Promise<Respuesta> {
  if (!hayClaude()) return { error: "Falta ANTHROPIC_API_KEY", tokensIn: 0, tokensOut: 0 };
  try {
    const r = await clienteClaude().messages.create({
      model: MODELO, max_tokens: maxTokens, output_config: { effort }, system,
      messages: [{ role: "user", content: contenido }],
    });
    const uso = { tokensIn: r.usage.input_tokens, tokensOut: r.usage.output_tokens };
    if (r.stop_reason === "refusal") return { error: "Claude no quiso responder", ...uso };
    return { texto: r.content.map((b) => (b.type === "text" ? b.text : "")).join("\n"), ...uso };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "";
    return { error: `${status} ${e instanceof Error ? e.message : String(e)}`.trim().slice(0, 500), tokensIn: 0, tokensOut: 0 };
  }
}

/** Saca el primer objeto o lista JSON de un texto (Claude a veces agrega
 *  una frase antes o después). */
export function jsonDe<T>(texto: string): T | null {
  const a = texto.search(/[[{]/);
  if (a < 0) return null;
  const cierre = texto[a] === "[" ? "]" : "}";
  const b = texto.lastIndexOf(cierre);
  if (b <= a) return null;
  try {
    return JSON.parse(texto.slice(a, b + 1)) as T;
  } catch {
    return null;
  }
}
