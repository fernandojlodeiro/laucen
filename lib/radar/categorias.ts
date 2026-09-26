// El árbol de categorías de Mercado Libre: se lee entero (en tandas, porque
// son miles) y se refresca cada tanto según la configuración. Además, si
// alguien entra a una categoría cuyas hijas todavía no se leyeron, se leen en
// el momento (así navegar anda aunque la carga completa no haya terminado).

import { asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { meliCategorias } from "@/db/radar";
import { SITIO, ml, tokenML, enTandas } from "./base";

export type Categoria = typeof meliCategorias.$inferSelect;

type HijaML = { id: string; name: string; total_items_in_this_category?: number };
type CategoriaML = {
  id: string; name: string; total_items_in_this_category?: number;
  path_from_root?: { id: string; name: string }[];
  children_categories?: HijaML[];
};

/** Siembra el primer nivel (los rubros grandes) si todavía no está. */
export async function sembrarPrimerNivel(token: string | null) {
  const [ya] = await db.select({ id: meliCategorias.id }).from(meliCategorias).where(eq(meliCategorias.nivel, 1)).limit(1);
  if (ya) return;
  const r = await ml(`/sites/${SITIO}/categories`, token);
  if (r.status !== 200 || !Array.isArray(r.datos)) throw new Error(`No se pudo leer el primer nivel (${r.status})`);
  const filas = (r.datos as HijaML[]).map((c) => ({ id: c.id, nombre: c.name, padreId: null, nivel: 1, ruta: c.name }));
  if (filas.length) await db.insert(meliCategorias).values(filas).onConflictDoNothing();
}

/** Lee de ML una categoría y sus hijas, y las guarda. Devuelve false si ML no respondió. */
export async function leerCategoria(id: string, token: string | null): Promise<boolean> {
  const r = await ml(`/categories/${id}`, token);
  if (r.status === 404) {
    // Ya no existe en ML: se marca leída para no reintentarla en cada tanda.
    await db.update(meliCategorias).set({ hijosLeidosEl: new Date(), esHoja: true }).where(eq(meliCategorias.id, id));
    return true;
  }
  if (r.status !== 200 || !r.datos || typeof r.datos !== "object") return false;
  const c = r.datos as CategoriaML;
  const camino = c.path_from_root ?? [{ id: c.id, name: c.name }];
  const ruta = camino.map((p) => p.name).join(" › ");
  const hijas = c.children_categories ?? [];
  const ahora = new Date();

  await db.insert(meliCategorias).values({
    id: c.id, nombre: c.name, padreId: camino.length > 1 ? camino[camino.length - 2].id : null,
    nivel: camino.length, ruta, publicaciones: c.total_items_in_this_category ?? null,
    esHoja: hijas.length === 0, leidaEl: ahora, hijosLeidosEl: ahora,
  }).onConflictDoUpdate({
    target: meliCategorias.id,
    set: {
      nombre: c.name, nivel: camino.length, ruta, publicaciones: c.total_items_in_this_category ?? null,
      esHoja: hijas.length === 0, leidaEl: ahora, hijosLeidosEl: ahora,
      padreId: camino.length > 1 ? camino[camino.length - 2].id : null,
    },
  });

  if (hijas.length) {
    await db.insert(meliCategorias).values(hijas.map((h) => ({
      id: h.id, nombre: h.name, padreId: c.id, nivel: camino.length + 1,
      ruta: `${ruta} › ${h.name}`, publicaciones: h.total_items_in_this_category ?? null, leidaEl: ahora,
    }))).onConflictDoUpdate({
      target: meliCategorias.id,
      set: {
        nombre: sql`excluded.nombre`, padreId: sql`excluded.padre_id`, nivel: sql`excluded.nivel`,
        ruta: sql`excluded.ruta`, publicaciones: sql`excluded.publicaciones`, leidaEl: sql`excluded.leida_el`,
      },
    });
  }
  return true;
}

/** Las hijas de una categoría ('MLA' = el primer nivel), leyéndolas de ML si
 *  todavía no están. */
export async function hijasDe(id: string): Promise<Categoria[]> {
  if (id === SITIO) {
    const token = await tokenML();
    await sembrarPrimerNivel(token);
    return db.select().from(meliCategorias).where(eq(meliCategorias.nivel, 1))
      .orderBy(desc(sql`coalesce(${meliCategorias.publicaciones}, 0)`), asc(meliCategorias.nombre));
  }
  const [yo] = await db.select().from(meliCategorias).where(eq(meliCategorias.id, id));
  if (!yo || !yo.hijosLeidosEl) await leerCategoria(id, await tokenML());
  return db.select().from(meliCategorias).where(eq(meliCategorias.padreId, id))
    .orderBy(desc(sql`coalesce(${meliCategorias.publicaciones}, 0)`), asc(meliCategorias.nombre));
}

export async function categoria(id: string): Promise<Categoria | null> {
  if (id === SITIO) return null;
  let [c] = await db.select().from(meliCategorias).where(eq(meliCategorias.id, id));
  if (!c) {
    await leerCategoria(id, await tokenML());
    [c] = await db.select().from(meliCategorias).where(eq(meliCategorias.id, id));
  }
  return c ?? null;
}

/** El camino desde la raíz hasta la categoría (para las migas). */
export async function caminoDe(id: string): Promise<Categoria[]> {
  const camino: Categoria[] = [];
  let actual = id === SITIO ? null : await categoria(id);
  while (actual && camino.length < 12) {
    camino.unshift(actual);
    if (!actual.padreId) break;
    [actual] = await db.select().from(meliCategorias).where(eq(meliCategorias.id, actual.padreId));
  }
  return camino;
}

export async function estadoDelArbol(corte?: Date) {
  const [r] = await db.select({
    total: sql<number>`count(*)::int`,
    pendientes: corte
      ? sql<number>`count(*) filter (where ${meliCategorias.hijosLeidosEl} is null or ${meliCategorias.hijosLeidosEl} < ${corte.toISOString()})::int`
      : sql<number>`count(*) filter (where ${meliCategorias.hijosLeidosEl} is null)::int`,
  }).from(meliCategorias);
  return r;
}

/** Una tanda de la carga del árbol: lee categorías pendientes (sin hijas
 *  leídas, o leídas antes de `corte` si es un refresco) hasta `hasta` (ms).
 *  Devuelve cuántas leyó y cuántas quedan. */
export async function cargarArbol({ corte, hasta }: { corte?: Date; hasta: number }) {
  const token = await tokenML();
  await sembrarPrimerNivel(token);
  let leidas = 0, fallidas = 0;
  const intentadas = new Set<string>();
  while (Date.now() < hasta) {
    const candidatas = await db.select({ id: meliCategorias.id }).from(meliCategorias)
      .where(corte ? or(isNull(meliCategorias.hijosLeidosEl), lt(meliCategorias.hijosLeidosEl, corte)) : isNull(meliCategorias.hijosLeidosEl))
      .orderBy(asc(meliCategorias.nivel)).limit(40 + intentadas.size);
    // Las que fallaron en esta corrida no se reintentan hasta la próxima.
    const pendientes = candidatas.filter((c) => !intentadas.has(c.id)).slice(0, 40);
    if (!pendientes.length) break;
    pendientes.forEach((p) => intentadas.add(p.id));
    let fallasTanda = 0;
    await enTandas(pendientes, 8, hasta, async (p) => {
      if (await leerCategoria(p.id, token)) leidas++;
      else { fallidas++; fallasTanda++; }
    });
    if (fallasTanda === pendientes.length) break; // ML no responde: no insistir en esta corrida
  }
  const estado = await estadoDelArbol(corte);
  return { leidas, fallidas, ...estado };
}

