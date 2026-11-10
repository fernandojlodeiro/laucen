// La IA que explora los datos con consultas SQL de sólo lectura (Fer, 7/11): la usan el informe de Market Pro
// (informe-ia.ts) y el costeo de importación (costeo.ts). Consulta como el usuario (lib/asistente/sql.ts: sus permisos y
// las políticas de fila), con tope de gasto, de vueltas y de tiempo; al acercarse al tope le pide que escriba ya.

import Anthropic from "@anthropic-ai/sdk";
import { clienteClaude, hayClaude } from "@/lib/claude";
import { MODELO_ASISTENTE } from "@/lib/asistente/motor";
import { consultarSql } from "@/lib/asistente/sql";
import type { Permisos } from "@/lib/permisos";

// Claude Opus 5.5, US$ por millón de tokens.
const PRECIO = { entrada: 4, salida: 20, escrituraCache: 5, lecturaCache: 0.4 };

const HERRAMIENTA: Anthropic.Beta.BetaToolUnion = {
  name: "consultar_sql",
  description: "Corre una consulta SELECT (o WITH … SELECT) de sólo lectura en la base de Laucen y devuelve hasta 100 filas en JSON. Una sola instrucción, sin comentarios. Tope de 45 segundos.",
  input_schema: { type: "object", properties: { sql: { type: "string", description: "La consulta." }, para: { type: "string", description: "Qué querés averiguar (corto)." } }, required: ["sql"] },
};

export type QuienIa = { authId: string; permisos: Permisos; superadmin: boolean; usuarioId: string | null };

export async function agenteSql({ sistema, mensaje, quien, topeUsd = 1.5, maxVueltas = 24, segundos = 240, maxTokens = 16000 }: {
  sistema: string; mensaje: string; quien: QuienIa; topeUsd?: number; maxVueltas?: number; segundos?: number; maxTokens?: number;
}): Promise<{ texto: string; usd: number; consultas: number }> {
  if (!hayClaude()) throw new Error("Falta la llave de Claude (ANTHROPIC_API_KEY).");
  const cliente = clienteClaude();
  const fin = Date.now() + segundos * 1000;
  let usd = 0, consultas = 0, cerrar = false;
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: mensaje }];
  for (let vuelta = 0; vuelta < maxVueltas; vuelta++) {
    const r = await cliente.beta.messages.create({
      model: MODELO_ASISTENTE, max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "medium" }, cache_control: { type: "ephemeral" },
      system: sistema, tools: [HERRAMIENTA], tool_choice: cerrar ? { type: "none" } : { type: "auto" },
      messages: mensajes,
    });
    const u = r.usage;
    usd += (u.input_tokens * PRECIO.entrada + (u.cache_creation_input_tokens ?? 0) * PRECIO.escrituraCache
      + (u.cache_read_input_tokens ?? 0) * PRECIO.lecturaCache + u.output_tokens * PRECIO.salida) / 1_000_000;
    if (r.stop_reason === "refusal") throw new Error("La IA no quiso hacerlo. Probá de nuevo más tarde.");
    if (r.stop_reason === "pause_turn") { mensajes.push({ role: "assistant", content: r.content }); continue; }
    const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !usos.length) {
      const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      if (!texto) throw new Error("La IA no devolvió nada. Probá de nuevo.");
      return { texto, usd, consultas };
    }
    mensajes.push({ role: "assistant", content: r.content });
    const resultados = await Promise.all(usos.map(async (t) => {
      consultas++;
      const sql = String((t.input as { sql?: unknown })?.sql ?? "");
      try {
        const res = await consultarSql(sql, quien.authId, quien.permisos, quien.superadmin, 100, 45);
        const json = JSON.stringify({ columnas: res.columnas, filas: res.filas, mas: res.mas });
        return { type: "tool_result" as const, tool_use_id: t.id, content: json.length > 20_000 ? `${json.slice(0, 20_000)}… (cortado: pedí menos filas o columnas)` : json };
      } catch (e) {
        return { type: "tool_result" as const, tool_use_id: t.id, content: `Error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 1500), is_error: true };
      }
    }));
    cerrar = usd > topeUsd * 0.7 || Date.now() > fin - 60_000 || vuelta >= maxVueltas - 2;
    mensajes.push({ role: "user", content: cerrar
      ? [...resultados, { type: "text" as const, text: "Se terminó el tiempo para consultar: escribí ya la respuesta completa con lo que tenés." }]
      : resultados });
  }
  throw new Error("La IA no terminó a tiempo. Probá de nuevo.");
}
