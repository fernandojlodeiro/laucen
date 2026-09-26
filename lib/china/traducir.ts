// Traduce un título de producto (español) al inglés (para Alibaba) y al chino
// simplificado (para 1688), con Claude. Necesita ANTHROPIC_API_KEY en Vercel;
// sin ella devuelve null y la pantalla pide escribir la traducción a mano.

import Anthropic from "@anthropic-ai/sdk";

export function hayClaude() {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export type Traduccion = { en: string; zh: string };
/** Por qué no tradujo, en criollo, y el detalle técnico para guardar. */
export type Falla = { motivo: string; tecnico: string };
export const esFalla = (x: Traduccion | Falla | null): x is Falla => !!x && "motivo" in x;

function motivoDe(status: number | undefined, mensaje: string): string {
  if (/workspace/i.test(mensaje)) return "la llave de Claude no está asignada a un workspace: hay que crear una llave nueva adentro de un workspace de la consola de Anthropic";
  if (status === 401) return "la llave de Claude (ANTHROPIC_API_KEY) no es válida";
  if (status === 403) return "la llave de Claude no tiene permiso para usar este modelo";
  if (/credit|balance|billing/i.test(mensaje)) return "la cuenta de Claude no tiene saldo cargado";
  if (status === 404) return "el modelo de Claude no está disponible para esta cuenta";
  if (status === 429) return "se pasó el límite de pedidos a Claude; probá en un minuto";
  if (status && status >= 500) return "Claude está con problemas ahora; probá en un rato";
  return "Claude no respondió bien";
}

/** Traduce; si no puede, devuelve por qué (sin llave o sin texto: null). */
export async function traducir(texto: string): Promise<Traduccion | Falla | null> {
  if (!hayClaude() || !texto.trim()) return null;
  // Una llave de cuenta (no de un workspace) necesita decir a qué workspace va.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
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
    if (r.stop_reason === "refusal") {
      return { motivo: "Claude no quiso traducir ese texto", tecnico: "refusal" };
    }
    const salida = r.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    const en = salida.match(/^\s*EN:\s*(.+)$/m)?.[1]?.trim();
    const zh = salida.match(/^\s*ZH:\s*(.+)$/m)?.[1]?.trim();
    if (en && zh) return { en, zh };
    return { motivo: "Claude contestó en otro formato", tecnico: salida.slice(0, 500) };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : undefined;
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[china] Claude ${status ?? ""}:`, mensaje);
    return { motivo: motivoDe(status, mensaje), tecnico: `${status ?? ""} ${mensaje}`.trim().slice(0, 1000) };
  }
}
