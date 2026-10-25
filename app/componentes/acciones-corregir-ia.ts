"use server";

// «Corregir a la IA» (lib/correccion-ia.ts): proponer qué cambiar y grabarlo. Las llama el componente CorregirIa.

import { entrarErp } from "@/app/componentes/erp";
import { motivoErp } from "@/lib/erp/base";
import { grabarCorreccion, proponerCorreccion, ORIGENES, type OrigenCorreccion, type Propuesta } from "@/lib/correccion-ia";

const permiso = (o: OrigenCorreccion): "mensajes_ver" | "preguntas_ver" => (o === "whatsapp" ? "mensajes_ver" : "preguntas_ver");

export async function accionProponerCorreccion(origen: OrigenCorreccion, id: string, texto: string): Promise<{ ok: Propuesta } | { error: string }> {
  if (!ORIGENES.includes(origen) || !/^[\w-]{1,60}$/.test(id)) return { error: "No se sabe qué respuesta corregir." };
  const s = await entrarErp(permiso(origen));
  try { return { ok: await proponerCorreccion(s.org.id, s.usuario.id, origen, id, texto) }; } catch (e) { return { error: motivoErp(e) }; }
}

export async function accionGrabarCorreccion(origen: OrigenCorreccion, id: number): Promise<{ ok: string } | { error: string }> {
  if (!ORIGENES.includes(origen)) return { error: "No se sabe qué corregir." };
  const s = await entrarErp(permiso(origen));
  try { return { ok: await grabarCorreccion(s.org.id, id) }; } catch (e) { return { error: motivoErp(e) }; }
}
