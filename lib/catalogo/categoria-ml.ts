// El predictor de categorías de Mercado Libre (pedido de Fer, 10/10): con el
// título del producto, ML dice en qué categoría cae (domain_discovery). Las
// familias de Laucen son el árbol de categorías de ML (familia.ml_categoria),
// así que la sugerencia es una familia: si todavía no está en el árbol, se
// crea con su camino al elegirla. Sirve al crear un producto (si no se eligió
// familia, toma la sugerida) y en la ficha (la lupa al lado de Familia).

import { consulta, una, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";
import { ml, cuentasDe, type CuentaMl } from "@/lib/mercadolibre/api";
import { caminoDeFamilia } from "@/lib/erp/familias";

export type CategoriaSugerida = { categoria: string; nombre: string; camino: string; familiaId: number | null };

async function cuentaParaLeer(org: string): Promise<CuentaMl> {
  const c = (await cuentasDe(org)).find((x) => x.estado === "activa" && x.canalId);
  if (!c) throw new ErrorErp("No hay ninguna cuenta de Mercado Libre conectada para consultar la categoría.");
  return c;
}

/** El camino de una categoría de ML (de la raíz a ella). */
async function caminoMl(cuenta: CuentaMl, categoria: string): Promise<{ id: string; nombre: string }[]> {
  const r = await ml<{ path_from_root?: { id: string; name: string }[] }>(cuenta, "GET", `/categories/${categoria}`);
  if (r.status !== 200) throw new ErrorErp(`Mercado Libre no encuentra la categoría ${categoria}.`);
  return (r.datos.path_from_root ?? []).map((x) => ({ id: x.id, nombre: x.name }));
}

/** Lo que sugiere ML para ese título (hasta 3, la primera es la más probable), con su familia si ya existe. */
export async function sugerirCategoriasMl(org: string, titulo: string): Promise<CategoriaSugerida[]> {
  const t = titulo.trim();
  if (t.length < 3) throw new ErrorErp("Escribí primero el título del producto: la sugerencia sale de ahí.");
  const cuenta = await cuentaParaLeer(org);
  const r = await ml<{ category_id?: string; category_name?: string }[]>(cuenta, "GET", `/sites/MLA/domain_discovery/search?limit=3&q=${encodeURIComponent(t)}`);
  if (r.status !== 200 || !Array.isArray(r.datos)) throw new ErrorErp("Mercado Libre no contestó: probá de nuevo en un rato.");
  const vistas = new Set<string>();
  const salida: CategoriaSugerida[] = [];
  for (const x of r.datos) {
    if (!x.category_id || vistas.has(x.category_id)) continue;
    vistas.add(x.category_id);
    const f = await una<{ id: number }>("select id::int from familia where organizacion_id = $1 and ml_categoria = $2", [org, x.category_id]);
    const camino = f ? await caminoDeFamilia(org, f.id) : (await caminoMl(cuenta, x.category_id).catch(() => [])).map((n) => n.nombre).join(" › ");
    salida.push({ categoria: x.category_id, nombre: x.category_name ?? x.category_id, camino: camino || (x.category_name ?? x.category_id), familiaId: f?.id ?? null });
  }
  return salida;
}

/** La familia de una categoría de ML; si no está en el árbol, la crea con todo su camino. */
export async function familiaDeCategoriaMl(org: string, categoria: string): Promise<{ id: number; camino: string }> {
  if (!/^MLA\d+$/.test(categoria)) throw new ErrorErp("Esa no es una categoría de Mercado Libre.");
  const ya = await una<{ id: number }>("select id::int from familia where organizacion_id = $1 and ml_categoria = $2", [org, categoria]);
  if (ya) return { id: ya.id, camino: (await caminoDeFamilia(org, ya.id)) ?? "" };
  const camino = await caminoMl(await cuentaParaLeer(org), categoria);
  if (!camino.length) throw new ErrorErp(`Mercado Libre no da el camino de la categoría ${categoria}.`);
  const id = await enTransaccion(async (c: Consultor) => {
    let padre: number | null = null;
    for (const n of camino) {
      const f = (await c.query<{ id: string }>("select id from familia where organizacion_id = $1 and ml_categoria = $2", [org, n.id])).rows[0];
      if (f) { padre = Number(f.id); continue; }
      const nuevo: { id: string } | undefined = (await c.query<{ id: string }>(
        "insert into familia (organizacion_id, padre_id, nombre, ml_categoria) values ($1, $2, $3, $4) on conflict do nothing returning id", [org, padre, n.nombre, n.id])).rows[0];
      padre = nuevo ? Number(nuevo.id) : Number((await c.query<{ id: string }>("select id from familia where organizacion_id = $1 and ml_categoria = $2", [org, n.id])).rows[0].id);
    }
    return padre!;
  });
  return { id, camino: (await caminoDeFamilia(org, id)) ?? "" };
}

/** La categoría de ML de una familia (null si es una familia propia). */
export async function categoriaDeFamilia(org: string, familia: number | null): Promise<string | null> {
  if (!familia) return null;
  const r = await consulta<{ c: string | null }>("select ml_categoria c from familia where id = $1 and organizacion_id = $2", [familia, org]);
  return r[0]?.c ?? null;
}
