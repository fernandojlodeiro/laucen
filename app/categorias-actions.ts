"use server";

// Acciones del buscador de categorías (componente ExploradorCategorias):
// navegar el árbol y buscar dentro de una rama. Para cualquier pantalla que
// elija categorías (Radar, piloto…).

import { sesionRequerida } from "@/lib/tenancy";
import { buscarCategoriasEn, caminoDe, hijasDe } from "@/lib/radar/categorias";
import { SITIO } from "@/lib/radar/base";

export type CatLigera = { id: string; nombre: string; ruta: string; nivel: number; publicaciones: number | null; esHoja: boolean };

const ligera = (c: { id: string; nombre: string; ruta: string; nivel: number; publicaciones: number | null; esHoja: boolean }): CatLigera =>
  ({ id: c.id, nombre: c.nombre, ruta: c.ruta, nivel: c.nivel, publicaciones: c.publicaciones, esHoja: c.esHoja });

/** Una rama del árbol: el camino hasta ella y sus hijas. */
export async function accionRama(id: string) {
  await sesionRequerida();
  try {
    const [camino, hijas] = await Promise.all([id === SITIO ? Promise.resolve([]) : caminoDe(id), hijasDe(id)]);
    return { camino: camino.map(ligera), hijas: hijas.map(ligera), error: null };
  } catch (e) {
    console.error("[categorías] rama:", e);
    return { camino: [], hijas: [], error: "No se pudieron leer las categorías de Mercado Libre." };
  }
}

/** Categorías cuyo nombre contiene el texto, dentro de la rama (o en todo el árbol). */
export async function accionBuscarEnRama(texto: string, dentroDe: string | null) {
  await sesionRequerida();
  if (texto.trim().length < 2) return [];
  return (await buscarCategoriasEn(texto.trim(), dentroDe)).map(ligera);
}
