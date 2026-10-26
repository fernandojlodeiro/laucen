// El "#" de Mensajes fuera de Mercado Libre (Fer, 26/10): busca en el catálogo de nuestra tienda web —el mismo que ve el
// comprador— y devuelve cada producto con el link a su página, para citarlo en WhatsApp, Instagram o un reclamo.

import { urlTienda } from "@/lib/tienda/dominios-tienda";
import { nombreTienda, tiendaDeOrg } from "@/lib/tienda/tienda";
import { catalogoDe, filtrarPorTexto } from "@/app/tienda/[slug]/catalogo";
import type { PublicacionEncontrada } from "@/lib/mercadolibre/buscar-publicaciones";

export async function buscarEnTienda(org: string, texto: string, limite = 15): Promise<PublicacionEncontrada[]> {
  const q = texto.trim();
  if (q.length < 2) return [];
  const t = await tiendaDeOrg(org);
  if (!t) return [];
  const lista = filtrarPorTexto(await catalogoDe(t), q).sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || b.vendidos - a.vendidos).slice(0, limite);
  return Promise.all(lista.map(async (p) => ({
    item_id: `#${p.id}`, titulo: p.titulo, permalink: await urlTienda(t, `/producto/${p.id}`), foto: p.foto, sku: null,
    canal_id: t.canalId, cuenta: nombreTienda(t), plan: null, planTexto: p.stock > 0 ? "Hay stock" : "Sin stock", mismoPlan: false, disponible: p.stock,
  })));
}
