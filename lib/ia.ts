// Un mismo pedido a cualquiera de los cuatro proveedores de IA, para comparar
// pilotos (Fer, 28/9). Llave y modelo de cada uno en Vercel:
//   ANTHROPIC_API_KEY + VISIBILIDAD_MODELO_ANTHROPIC
//   OPENAI_API_KEY + VISIBILIDAD_MODELO_OPENAI
//   GEMINI_API_KEY + VISIBILIDAD_MODELO_GEMINI
//   PERPLEXITY_API_KEY + VISIBILIDAD_MODELO_PERPLEXITY
// Anthropic va por su SDK (lib/claude.ts); los otros tres, por su API HTTP.
// El contenido se arma como para Claude (texto e imágenes en base64) y acá se
// traduce al formato de cada uno.

import { clienteClaude, costoUsd, pedirClaude, type Contenido, type Respuesta, MODELOS } from "@/lib/claude";

export const PROVEEDORES = ["anthropic", "openai", "gemini", "perplexity"] as const;
export type Proveedor = (typeof PROVEEDORES)[number];
export const NOMBRE_PROVEEDOR: Record<Proveedor, string> = { anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini", perplexity: "Perplexity" };

const env = (k: string) => process.env[k]?.trim() || "";
// La llave: la primera palabra (piloto #16: la variable tenía la llave repetida en
// tres renglones y el pedido falló).
const llaveDe = (k: string) => env(k).split(/\s+/)[0] ?? "";
// Nunca guardar ni mostrar una llave: se tapa en cualquier mensaje de error.
const sinLlaves = (s: string) => s.replace(/(Bearer\s+)?\b(pplx-|sk-|AIza|sk-ant-)[\w-]{8,}/g, "[llave]");
export function modeloDe(p: Proveedor) {
  return env(`VISIBILIDAD_MODELO_${p.toUpperCase()}`) || (p === "anthropic" ? MODELOS.grande.id : "");
}

// Precio aproximado por millón de tokens (entrada / salida), por prefijo del
// nombre del modelo. Sin dato: 0 (la pantalla lo aclara).
const PRECIOS: [RegExp, number, number][] = [
  [/^gpt-5(\.\d+)?-nano/, 0.05, 0.4], [/^gpt-5(\.\d+)?-mini/, 0.25, 2], [/^gpt-5/, 1.25, 10], [/^gpt-4\.1-mini/, 0.4, 1.6], [/^gpt-4\.1/, 2, 8],
  [/^gpt-4o-mini/, 0.15, 0.6], [/^gpt-4o/, 2.5, 10], [/^o[34]-mini/, 1.1, 4.4], [/^o3/, 2, 8],
  [/^gemini-[\d.]+-flash-lite/, 0.1, 0.4], [/^gemini-[\d.]+-flash/, 0.3, 2.5], [/^gemini-[\d.]+-pro/, 1.25, 10],
  [/^sonar-reasoning-pro/, 2, 8], [/^sonar-reasoning/, 1, 5], [/^sonar-pro/, 3, 15], [/^sonar-deep/, 2, 8], [/^sonar/, 1, 1],
];
function usdDe(modelo: string, tin: number, tout: number) {
  const f = PRECIOS.find(([r]) => r.test(modelo));
  return f ? (tin * f[1] + tout * f[2]) / 1_000_000 : 0;
}

type Parte = { tipo: "texto"; texto: string } | { tipo: "imagen"; mime: string; datos: string };
function partes(c: Contenido): Parte[] {
  if (typeof c === "string") return [{ tipo: "texto", texto: c }];
  return c.flatMap((b): Parte[] => {
    if (b.type === "text") return [{ tipo: "texto", texto: b.text }];
    if (b.type === "image" && b.source.type === "base64") return [{ tipo: "imagen", mime: b.source.media_type, datos: b.source.data }];
    return [];
  });
}

async function postJson(url: string, cuerpo: unknown, headers: Record<string, string>) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(cuerpo), cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j?.error ?? j ?? "").slice(0, 300)}`);
  return j;
}

/** El pedido, al proveedor que toque. Nunca tira: texto o error, y los tokens. */
export async function pedirIA(proveedor: Proveedor | undefined, pedido: {
  system: string; contenido: Contenido; maxTokens?: number; effort?: "low" | "medium" | "high";
}): Promise<Respuesta & { modelo: string }> {
  const prov = proveedor ?? "anthropic";
  const modelo = modeloDe(prov);
  const maxTokens = pedido.maxTokens ?? 4000;
  const sinUso = { tokensIn: 0, tokensOut: 0, usd: 0, modelo };
  if (prov === "anthropic") {
    // Con el modelo de la tabla, por pedirClaude (sabe su precio y si acepta effort).
    const deTabla = (Object.keys(MODELOS) as (keyof typeof MODELOS)[]).find((k) => MODELOS[k].id === modelo);
    if (deTabla) return { ...(await pedirClaude({ ...pedido, modelo: deTabla })), modelo };
    try {
      const r = await clienteClaude().messages.create({ model: modelo, max_tokens: maxTokens, system: pedido.system, messages: [{ role: "user", content: pedido.contenido }] });
      const uso = { tokensIn: r.usage.input_tokens, tokensOut: r.usage.output_tokens, usd: costoUsd("grande", r.usage.input_tokens, r.usage.output_tokens), modelo };
      return { texto: r.content.map((b) => (b.type === "text" ? b.text : "")).join("\n"), ...uso };
    } catch (e) {
      return { error: sinLlaves(String(e)).slice(0, 500), ...sinUso };
    }
  }
  const llave = llaveDe(`${prov.toUpperCase()}_API_KEY`);
  if (!llave) return { error: `Falta ${prov.toUpperCase()}_API_KEY`, ...sinUso };
  if (!modelo) return { error: `Falta VISIBILIDAD_MODELO_${prov.toUpperCase()}`, ...sinUso };
  const ps = partes(pedido.contenido);
  try {
    if (prov === "gemini") {
      const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        systemInstruction: { parts: [{ text: pedido.system }] },
        contents: [{ role: "user", parts: ps.map((x) => (x.tipo === "texto" ? { text: x.texto } : { inline_data: { mime_type: x.mime, data: x.datos } })) }],
        generationConfig: { maxOutputTokens: maxTokens + 8000 }, // los modelos que piensan gastan de acá
      }, { "x-goog-api-key": llave });
      const texto = (j?.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("\n");
      const tin = j?.usageMetadata?.promptTokenCount ?? 0, tout = (j?.usageMetadata?.candidatesTokenCount ?? 0) + (j?.usageMetadata?.thoughtsTokenCount ?? 0);
      const uso = { tokensIn: tin, tokensOut: tout, usd: usdDe(modelo, tin, tout), modelo };
      return texto ? { texto, ...uso } : { error: `Gemini no devolvió texto (${j?.candidates?.[0]?.finishReason ?? "?"})`, ...uso };
    }
    // OpenAI y Perplexity: formato de chat de OpenAI.
    const url = prov === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://api.perplexity.ai/chat/completions";
    const content = ps.map((x) => (x.tipo === "texto" ? { type: "text", text: x.texto } : { type: "image_url", image_url: { url: `data:${x.mime};base64,${x.datos}` } }));
    const j = await postJson(url, {
      model: modelo,
      messages: [{ role: "system", content: pedido.system }, { role: "user", content }],
      ...(prov === "openai" ? { max_completion_tokens: maxTokens + 8000 } : { max_tokens: maxTokens }),
    }, { authorization: `Bearer ${llave}` });
    // Los modelos que razonan (sonar-reasoning) mandan lo que piensan entre <think>.
    const texto = String(j?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const tin = j?.usage?.prompt_tokens ?? 0, tout = j?.usage?.completion_tokens ?? 0;
    const uso = { tokensIn: tin, tokensOut: tout, usd: usdDe(modelo, tin, tout), modelo };
    return texto ? { texto, ...uso } : { error: `${prov} no devolvió texto (${j?.choices?.[0]?.finish_reason ?? "?"})`, ...uso };
  } catch (e) {
    return { error: sinLlaves(`${prov}: ${e instanceof Error ? e.message : String(e)}`).slice(0, 500), ...sinUso };
  }
}
