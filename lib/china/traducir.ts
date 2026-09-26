// Traduce un título de producto (español) al inglés (para Alibaba) y al chino
// simplificado (para 1688), con Claude. Necesita ANTHROPIC_API_KEY en Vercel;
// sin ella devuelve null y la pantalla pide escribir la traducción a mano.

import Anthropic from "@anthropic-ai/sdk";

export function hayClaude() {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export type Traduccion = { en: string; zh: string };

export async function traducir(texto: string): Promise<Traduccion | null> {
  if (!hayClaude() || !texto.trim()) return null;
  const client = new Anthropic();
  try {
    const r = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      output_config: { effort: "low" },
      system:
        "Traducís títulos de productos para buscarlos en sitios mayoristas de China. " +
        "Respondé exactamente dos líneas, sin nada más:\n" +
        "EN: <búsqueda corta en inglés, como la escribiría un comprador en Alibaba>\n" +
        "ZH: <búsqueda corta en chino simplificado, como se busca en 1688>\n" +
        "Quitá marcas, medidas de envío y palabras de venta (oferta, envío gratis). Dejá medidas y materiales del producto.",
      messages: [{ role: "user", content: texto.trim() }],
    });
    if (r.stop_reason === "refusal") return null;
    const salida = r.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    const en = salida.match(/^\s*EN:\s*(.+)$/m)?.[1]?.trim();
    const zh = salida.match(/^\s*ZH:\s*(.+)$/m)?.[1]?.trim();
    return en && zh ? { en, zh } : null;
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`[china] Claude ${e.status}:`, e.message);
    else console.error("[china] Claude:", e);
    return null;
  }
}
