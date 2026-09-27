// Acceso común a Claude (API de Anthropic). Llave en ANTHROPIC_API_KEY; si la
// llave es de la cuenta y no de un workspace, hace falta ANTHROPIC_WORKSPACE_ID.

import Anthropic from "@anthropic-ai/sdk";

// Modelos y precio por millón de tokens (US$ entrada / salida), según la
// documentación de Anthropic (27/9). Lo mecánico (traducir, estimar cajas,
// cruzar títulos, prefiltrar) va con el chico; el juez, con el del medio.
export const MODELOS = {
  chico: { id: "claude-haiku-4-5", entrada: 1, salida: 5, conEffort: false },
  medio: { id: "claude-sonnet-5", entrada: 2, salida: 10, conEffort: true },
  grande: { id: "claude-opus-5", entrada: 5, salida: 25, conEffort: true },
} as const;
export type Modelo = keyof typeof MODELOS;
export const MODELO = MODELOS.grande.id;
/** Precio de Claude Opus 5 (lo que se usó hasta el piloto #4). */
export const USD_POR_MTOK = { entrada: MODELOS.grande.entrada, salida: MODELOS.grande.salida };

export function costoUsd(modelo: Modelo, tokensIn: number, tokensOut: number) {
  const m = MODELOS[modelo];
  return (tokensIn * m.entrada + tokensOut * m.salida) / 1_000_000;
}

export function hayClaude() {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export function clienteClaude() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
}

export type Contenido = Anthropic.MessageParam["content"];
type Uso = { tokensIn: number; tokensOut: number; usd: number };
export type Respuesta = ({ texto: string } | { error: string }) & Uso;

/** Un pedido a Claude. Nunca tira: devuelve el texto o el error, y siempre
 *  los tokens usados (para el costo). */
export async function pedirClaude({ system, contenido, maxTokens = 4000, effort = "low", modelo = "grande" }: {
  system: string; contenido: Contenido; maxTokens?: number; effort?: "low" | "medium" | "high"; modelo?: Modelo;
}): Promise<Respuesta> {
  const m = MODELOS[modelo];
  const sinUso = { tokensIn: 0, tokensOut: 0, usd: 0 };
  if (!hayClaude()) return { error: "Falta ANTHROPIC_API_KEY", ...sinUso };
  try {
    const r = await clienteClaude().messages.create({
      model: m.id, max_tokens: maxTokens, system,
      ...(m.conEffort ? { output_config: { effort } } : {}),
      messages: [{ role: "user", content: contenido }],
    });
    const uso = { tokensIn: r.usage.input_tokens, tokensOut: r.usage.output_tokens, usd: costoUsd(modelo, r.usage.input_tokens, r.usage.output_tokens) };
    if (r.stop_reason === "refusal") return { error: "Claude no quiso responder", ...uso };
    return { texto: r.content.map((b) => (b.type === "text" ? b.text : "")).join("\n"), ...uso };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "";
    return { error: `${status} ${e instanceof Error ? e.message : String(e)}`.trim().slice(0, 500), ...sinUso };
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
