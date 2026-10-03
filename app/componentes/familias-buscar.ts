"use server";

// Lo que pide ElegirFamilia mientras se tipea: hasta 50 familias de la
// organización de la sesión que coinciden por nombre o camino.

import { sesionActual } from "@/lib/tenancy";
import { buscarFamilias, type FamiliaEncontrada } from "@/lib/erp/familias";

export async function accionBuscarFamilias(texto: string, opciones: { propias?: boolean; excluir?: number } = {}): Promise<FamiliaEncontrada[]> {
  const s = await sesionActual();
  if (!s) return [];
  return buscarFamilias(s.org.id, String(texto ?? "").slice(0, 200), {
    propias: !!opciones.propias, excluir: Number(opciones.excluir) || undefined, limite: 50,
  });
}
