"use server";

// El árbol de categorías entero, para el explorador de categorías
// (componente ExploradorCategorias). Se baja una sola vez por pantalla y
// después navegar y buscar es instantáneo, sin ir al servidor.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sesionRequerida } from "@/lib/tenancy";

/** Una categoría en forma compacta: [id, nombre, padre, nivel, publicaciones, esHoja]. */
export type Fila = [string, string, string | null, number, number | null, boolean];

export async function accionArbol(): Promise<{ filas: Fila[]; error: string | null }> {
  await sesionRequerida();
  try {
    const r = await db.execute(sql`select id, nombre, padre_id, nivel, publicaciones, es_hoja from meli_categorias`);
    const filas = (r.rows as { id: string; nombre: string; padre_id: string | null; nivel: number; publicaciones: number | null; es_hoja: boolean }[])
      .map((c): Fila => [c.id, c.nombre, c.padre_id, c.nivel, c.publicaciones, c.es_hoja]);
    return { filas, error: filas.length ? null : "El árbol de categorías todavía no está cargado (se carga desde el Radar)." };
  } catch (e) {
    console.error("[categorías] árbol:", e);
    return { filas: [], error: "No se pudieron leer las categorías." };
  }
}
