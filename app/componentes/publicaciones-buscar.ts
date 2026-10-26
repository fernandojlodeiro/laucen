"use server";

// Lo que pide CajaConPublicaciones mientras se escribe después de un "#": en Mercado Libre, las publicaciones activas de
// los productos que coinciden; en todo lo demás (WhatsApp, Instagram, un reclamo de la web o del local), los productos de
// nuestra tienda web, con su link (Fer, 26/10).

import { sesionActual } from "@/lib/tenancy";
import { buscarPublicaciones, type PublicacionEncontrada } from "@/lib/mercadolibre/buscar-publicaciones";
import { buscarEnTienda } from "@/lib/tienda/buscar-para-citar";

export async function accionBuscarPublicaciones(texto: string, opciones: { canalId?: number | null; plan?: string | null; web?: boolean } = {}): Promise<PublicacionEncontrada[]> {
  const s = await sesionActual();
  if (!s) return [];
  const q = String(texto ?? "").slice(0, 120);
  if (opciones.web) return buscarEnTienda(s.org.id, q);
  return buscarPublicaciones(s.org.id, q, { canalId: Number(opciones.canalId) || null, plan: opciones.plan ? String(opciones.plan).slice(0, 30) : null });
}
