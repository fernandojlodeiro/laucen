// Buscador de publicaciones propias para citar en una respuesta (Fer, 13/10): al escribir "#" y el nombre de un
// producto, se buscan sobre los productos de Laucen y se muestran sus publicaciones activas de Mercado Libre, la del
// mismo plan que la publicación de la pregunta primero y, después, las demás. Lo que se elige entra como link.

import { consulta } from "@/lib/erp/base";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { planDe } from "@/lib/mercadolibre/prueba-planes";

/** Los planes como los ve Fer, del más barato al más caro (el mismo orden que Publicaciones). */
export const NOMBRE_PLAN: Record<string, string> = { clasica: "Clásica", "3x_campaign": "Premium 3x", premium: "Premium", "9x_campaign": "Premium 9x", "12x_campaign": "Premium 12x" };
const ORDEN = ["clasica", "3x_campaign", "premium", "9x_campaign", "12x_campaign"];
export const nombrePlan = (plan: string | null | undefined) => (plan ? NOMBRE_PLAN[plan] ?? plan : null);

export type PublicacionEncontrada = {
  item_id: string; titulo: string; permalink: string; foto: string | null; sku: string | null;
  canal_id: number; cuenta: string; plan: string | null; planTexto: string | null; mismoPlan: boolean;
};

/** Pura: primero las del plan pedido, después las demás de la más barata a la más cara; dentro, por título. */
export function ordenarPorPlan<T extends { plan: string | null; titulo: string }>(filas: T[], plan: string | null | undefined): (T & { mismoPlan: boolean })[] {
  const rango = (p: string | null) => { const i = ORDEN.indexOf(p ?? ""); return i < 0 ? ORDEN.length : i; };
  return filas.map((f) => ({ ...f, mismoPlan: !!plan && f.plan === plan }))
    .sort((a, b) => Number(b.mismoPlan) - Number(a.mismoPlan) || rango(a.plan) - rango(b.plan) || a.titulo.localeCompare(b.titulo));
}

export async function buscarPublicaciones(org: string, texto: string, o: { canalId?: number | null; plan?: string | null; limite?: number } = {}): Promise<PublicacionEncontrada[]> {
  const q = texto.trim();
  if (q.length < 2) return [];
  const filas = await consulta<{ item_id: string; titulo: string | null; permalink: string; foto: string | null; sku: string | null; canal_id: number; cuenta: string; tipo: string | null; tags: unknown; terms: unknown }>(`
    select distinct on (mi.canal_id, mi.item_id) mi.item_id, coalesce(mi.titulo, pu.titulo) titulo, mi.permalink, mi.foto, v.sku, mi.canal_id::int, c.nombre cuenta,
           mi.tipo, mi.datos_externos -> 'ml' -> 'tags' tags, mi.datos_externos -> 'ml' -> 'sale_terms' terms
      from meli_item mi
      join canal c on c.id = mi.canal_id
      left join publicacion pu on pu.id = mi.publicacion_id
      left join variacion v on v.id = pu.variacion_id
      left join producto p on p.id = v.producto_id
     where mi.organizacion_id = $1 and mi.estado = 'active' and mi.permalink is not null and ($2::bigint is null or mi.canal_id = $2)
       and ${sqlBusqueda("$3", ["p.titulo", "p.sku_base", "p.modelo", "p.marca", "v.sku", "v.titulo", "mi.titulo", "mi.item_id"])}
     order by mi.canal_id, mi.item_id limit 300`, [org, o.canalId ?? null, parametroBusqueda(q)]);
  const conPlan = filas.map((f) => {
    const plan = f.tipo ? planDe(f.tipo, f.tags, f.terms) : null;
    return { item_id: f.item_id, titulo: f.titulo ?? f.item_id, permalink: f.permalink, foto: f.foto, sku: f.sku, canal_id: f.canal_id, cuenta: f.cuenta, plan, planTexto: nombrePlan(plan) };
  });
  return ordenarPorPlan(conPlan, o.plan).slice(0, o.limite ?? 15);
}
