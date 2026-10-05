// ¿Lo que se mandó es EXACTAMENTE lo que propuso la IA? (Fer, 5/10): si el usuario manda la
// sugerencia sin tocarla, en el historial queda "Respondió <usuario> con la IA"; si la cambió,
// queda sólo el usuario. Sólo se ignoran los espacios de los extremos y el tipo de salto de línea.

const norm = (t: string) => t.replace(/\r\n?/g, "\n").trim();

export function igualALaSugerencia(texto: string | null | undefined, sugerencia: string | null | undefined): boolean {
  if (!texto || !sugerencia) return false;
  const a = norm(texto), b = norm(sugerencia);
  return a !== "" && a === b;
}

// ── Respuesta automática (Fer, 5/10) ──
// Dos interruptores generales de la organización, uno en Preguntas y otro en
// Mensajes (config_org, clave 'ml_respuesta_auto'). Prendido, lo que la IA
// propone se manda solo, salvo que ella diga que no corresponde: el comprador
// pide hablar con una persona (en un mensaje: la IA no contesta más esa
// conversación) o falta un dato para contestar. Eso queda para una persona.

/** Qué dice la IA de su propia respuesta: "ok" (se puede mandar sola),
 *  "persona" (el comprador pide hablar con una persona) o "falta_dato". */
export type EstadoIa = "ok" | "persona" | "falta_dato";

export const FORMATO_IA = `Devolvé SOLO un JSON, sin nada antes ni después: {"estado": "...", "texto": "..."}.
"texto" es la respuesta al comprador. "estado" es:
- "persona" si el comprador pide hablar con una persona, con un humano, con alguien de la tienda, o dice que no quiere que le conteste un robot o una IA;
- "falta_dato" si para contestar bien hace falta un dato que no está en lo que te paso (en "texto" igual dejá una respuesta para que una persona la complete);
- "ok" en cualquier otro caso.`;

const ESTADOS: EstadoIa[] = ["ok", "persona", "falta_dato"];

/** Lee lo que devolvió la IA. Si no vino en el formato pedido, se toma el
 *  texto entero como respuesta, pero no se manda sola ("falta_dato"). */
export function leerPropuesta(crudo: string): { estado: EstadoIa; texto: string } {
  const t = crudo.trim();
  const json = t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  try {
    const o = JSON.parse(json) as { estado?: unknown; texto?: unknown };
    const texto = typeof o.texto === "string" ? o.texto.trim() : "";
    const estado = ESTADOS.includes(o.estado as EstadoIa) ? o.estado as EstadoIa : "falta_dato";
    // Sin texto no hay nada que mandar solo (pero "pidió una persona" vale igual).
    return { estado: estado === "ok" && !texto ? "falta_dato" : estado, texto };
  } catch { /* no vino en JSON */ }
  return { estado: "falta_dato", texto: t.replace(/^"|"$/g, "") };
}
