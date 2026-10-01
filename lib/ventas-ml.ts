// Ventas de Fer en Mercado Libre por categoría (Fer, 1/10): las órdenes
// pagadas de los últimos N días, leídas en vivo de la API de ML con la cuenta
// conectada (/orders/search), agrupadas por la rama de categorías de cada
// artículo vendido (/categories/{id} → path_from_root).

import { llamar } from "@/lib/meli";

export type Vendido = {
  itemId: string; titulo: string; categoriaId: string; unidades: number; monto: number;
  ruta: { id: string; nombre: string }[];
};

type Orden = {
  order_items?: { item?: { id?: string; title?: string; category_id?: string }; quantity?: number; unit_price?: number }[];
};

const rutas = new Map<string, { id: string; nombre: string }[]>();

async function rutaDe(categoriaId: string, token: string) {
  const ya = rutas.get(categoriaId);
  if (ya) return ya;
  const r = await llamar(`/categories/${categoriaId}`, token);
  const camino = ((r.datos as { path_from_root?: { id: string; name: string }[] } | null)?.path_from_root ?? [])
    .map((c) => ({ id: c.id, nombre: c.name }));
  const ruta = camino.length ? camino : [{ id: categoriaId, nombre: categoriaId }];
  if (r.status === 200) rutas.set(categoriaId, ruta);
  return ruta;
}

/** Lo vendido (órdenes pagadas) en los últimos `dias` días, una fila por
 *  publicación, con la rama de categorías. Tira si ML no contesta. */
export async function ventasPorPublicacion(token: string, dias: number): Promise<{ vendidos: Vendido[]; ordenes: number }> {
  const yo = await llamar("/users/me", token);
  const userId = (yo.datos as { id?: number } | null)?.id;
  if (!userId) throw new Error(`Mercado Libre no devolvió la cuenta (${yo.status})`);
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const base = `/orders/search?seller=${userId}&order.status=paid&order.date_created.from=${desde}T00:00:00.000-03:00&sort=date_desc&limit=50`;

  const primera = await llamar(`${base}&offset=0`, token);
  if (primera.status !== 200) throw new Error(`Mercado Libre no devolvió las ventas (${primera.status})`);
  const p = primera.datos as { results?: Orden[]; paging?: { total?: number } };
  const total = p.paging?.total ?? 0;
  const ordenes: Orden[] = [...(p.results ?? [])];
  const offsets: number[] = [];
  for (let o = 50; o < total && o < 10_000; o += 50) offsets.push(o);
  for (let i = 0; i < offsets.length; i += 5) {
    const tanda = await Promise.all(offsets.slice(i, i + 5).map((o) => llamar(`${base}&offset=${o}`, token)));
    for (const r of tanda) {
      if (r.status !== 200) throw new Error(`Mercado Libre cortó la lista de ventas (${r.status})`);
      ordenes.push(...((r.datos as { results?: Orden[] }).results ?? []));
    }
  }

  const porItem = new Map<string, Omit<Vendido, "ruta">>();
  for (const o of ordenes) for (const it of o.order_items ?? []) {
    const id = it.item?.id;
    if (!id) continue;
    const v = porItem.get(id) ?? { itemId: id, titulo: it.item?.title ?? id, categoriaId: it.item?.category_id ?? "", unidades: 0, monto: 0 };
    v.unidades += it.quantity ?? 0;
    v.monto += (it.quantity ?? 0) * (it.unit_price ?? 0);
    porItem.set(id, v);
  }
  const cats = [...new Set([...porItem.values()].map((v) => v.categoriaId).filter(Boolean))];
  for (let i = 0; i < cats.length; i += 10) await Promise.all(cats.slice(i, i + 10).map((c) => rutaDe(c, token)));
  const vendidos = [...porItem.values()].map((v) => ({ ...v, ruta: rutas.get(v.categoriaId) ?? [{ id: v.categoriaId, nombre: v.categoriaId }] }));
  return { vendidos, ordenes: ordenes.length };
}

export type Fila = { id: string; nombre: string; publicaciones: number; unidades: number; monto: number; tieneHijos: boolean };

/** Agrupa lo vendido en el nivel que sigue a `categoriaId` (o en el primer
 *  nivel si no viene). `camino` = la rama hasta `categoriaId`, para las migas. */
export function agrupar(vendidos: Vendido[], categoriaId: string | null) {
  const dentro = categoriaId ? vendidos.filter((v) => v.ruta.some((c) => c.id === categoriaId)) : vendidos;
  const camino = categoriaId ? (dentro[0]?.ruta ?? []).slice(0, (dentro[0]?.ruta ?? []).findIndex((c) => c.id === categoriaId) + 1) : [];
  const nivel = camino.length;
  const grupos = new Map<string, Fila & { items: Set<string> }>();
  const sueltas: Vendido[] = [];
  for (const v of dentro) {
    const c = v.ruta[nivel];
    if (!c) { sueltas.push(v); continue; }
    const g = grupos.get(c.id) ?? { id: c.id, nombre: c.nombre, publicaciones: 0, unidades: 0, monto: 0, tieneHijos: false, items: new Set<string>() };
    g.items.add(v.itemId);
    g.unidades += v.unidades;
    g.monto += v.monto;
    if (v.ruta.length > nivel + 1) g.tieneHijos = true;
    grupos.set(c.id, g);
  }
  const filas: Fila[] = [...grupos.values()].map(({ items, ...g }) => ({ ...g, publicaciones: items.size }))
    .sort((a, b) => b.monto - a.monto);
  return { camino, filas, publicaciones: sueltas.sort((a, b) => b.monto - a.monto) };
}
