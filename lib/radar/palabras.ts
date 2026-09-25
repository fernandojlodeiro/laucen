// Palabras propias: las que alguien escribe en "Buscar mis palabras" (no
// vienen de las tendencias). Se pueden seguir con ★: el proceso de los lunes
// las vuelve a buscar con Apify, dentro del tope de gasto.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { meliBusquedas, meliCategorias, radarPalabrasSeguidas } from "@/db/radar";

export const clave = (palabra: string) => palabra.trim().toLowerCase().replace(/\s+/g, " ");

export async function palabrasSeguidas(organizacionId: string) {
  return db.select({
    palabra: radarPalabrasSeguidas.palabra, clave: radarPalabrasSeguidas.clave,
    categoriaId: radarPalabrasSeguidas.categoriaId, desde: radarPalabrasSeguidas.desde, ruta: meliCategorias.ruta,
  }).from(radarPalabrasSeguidas)
    .leftJoin(meliCategorias, eq(meliCategorias.id, radarPalabrasSeguidas.categoriaId))
    .where(eq(radarPalabrasSeguidas.organizacionId, organizacionId))
    .orderBy(desc(radarPalabrasSeguidas.desde));
}

export async function sigoPalabra(organizacionId: string, palabra: string) {
  const [f] = await db.select({ c: radarPalabrasSeguidas.clave }).from(radarPalabrasSeguidas)
    .where(and(eq(radarPalabrasSeguidas.organizacionId, organizacionId), eq(radarPalabrasSeguidas.clave, clave(palabra))));
  return !!f;
}

export async function seguirPalabra(organizacionId: string, palabra: string, categoriaId: string | null, usuarioId: string, valor: boolean) {
  const k = clave(palabra);
  if (!k) return;
  if (valor) {
    await db.insert(radarPalabrasSeguidas).values({ organizacionId, clave: k, palabra: palabra.trim(), categoriaId, creadoPor: usuarioId })
      .onConflictDoNothing();
  } else {
    await db.delete(radarPalabrasSeguidas).where(and(eq(radarPalabrasSeguidas.organizacionId, organizacionId), eq(radarPalabrasSeguidas.clave, k)));
  }
}

/** La última búsqueda (cualquier semana) de cada palabra seguida, para
 *  mostrarla en "Mis categorías seguidas". */
export async function ultimasDe(organizacionId: string, claves: string[]) {
  if (!claves.length) return new Map<string, typeof meliBusquedas.$inferSelect>();
  const filas = await db.select().from(meliBusquedas).where(and(
    eq(meliBusquedas.organizacionId, organizacionId),
    sql`lower(regexp_replace(trim(${meliBusquedas.palabra}), '\\s+', ' ', 'g')) in (${sql.join(claves.map((k) => sql`${k}`), sql`, `)})`,
    eq(meliBusquedas.estado, "terminada"),
  )).orderBy(desc(meliBusquedas.pedidaEl));
  const mapa = new Map<string, typeof meliBusquedas.$inferSelect>();
  for (const f of filas) { const k = clave(f.palabra); if (!mapa.has(k)) mapa.set(k, f); }
  return mapa;
}
