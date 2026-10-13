"use server";

// Lo que pide CajaConPublicaciones mientras se escribe después de un "#": las publicaciones activas de los productos que coinciden.

import { sesionActual } from "@/lib/tenancy";
import { buscarPublicaciones, type PublicacionEncontrada } from "@/lib/mercadolibre/buscar-publicaciones";

export async function accionBuscarPublicaciones(texto: string, opciones: { canalId?: number | null; plan?: string | null } = {}): Promise<PublicacionEncontrada[]> {
  const s = await sesionActual();
  if (!s) return [];
  return buscarPublicaciones(s.org.id, String(texto ?? "").slice(0, 120), { canalId: Number(opciones.canalId) || null, plan: opciones.plan ? String(opciones.plan).slice(0, 30) : null });
}
