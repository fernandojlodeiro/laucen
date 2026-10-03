// Piezas que comparten el listado y la ficha de productos (y Familias).

import { Estado } from "@/app/componentes/erp";

export const TIPOS_PRODUCTO: Record<string, string> = { simple: "Simple", con_variaciones: "Con variaciones", kit: "Kit" };
export const ESTADOS_PRODUCTO: Record<string, string> = { activo: "Activo", pausado: "Pausado", archivado: "Inactivo" };
export const ESTADOS_VARIACION: Record<string, string> = { activa: "Activa", pausada: "Pausada", archivada: "Inactiva" };

export function EstadoProducto({ estado }: { estado: string }) {
  const tono = estado === "activo" || estado === "activa" ? "verde" : estado === "pausado" || estado === "pausada" ? "amarillo" : "gris";
  return <Estado texto={ESTADOS_PRODUCTO[estado] ?? ESTADOS_VARIACION[estado] ?? estado} tono={tono} />;
}

/** Condición del producto (la que trae Mercado Libre). */
export const CONDICIONES: Record<string, string> = { nuevo: "Nuevo", usado: "Usado", reacondicionado: "Reacondicionado" };
/** La condición guardada → clave de CONDICIONES (acepta también las de ML:
 *  new, used, refurbished). Vacío si no hay o no se reconoce. */
export function condicionDe(c: string | null | undefined): string {
  const k = (c ?? "").trim().toLowerCase();
  return ({ new: "nuevo", used: "usado", refurbished: "reacondicionado" } as Record<string, string>)[k] ?? (Object.hasOwn(CONDICIONES, k) ? k : "");
}


/** Ordena las familias como árbol (cada una debajo de su padre) y les pone
 *  nivel y etiqueta ("Padre › Hija"). Una familia cuyo padre no aparece
 *  queda arriba de todo; si hubiera un círculo, sus familias van al final. */
export function ordenarArbol<T extends { id: number; padre_id: number | null; nombre: string }>(familias: T[]): (T & { nivel: number; etiqueta: string })[] {
  const ids = new Set(familias.map((f) => f.id));
  const hijos = new Map<number | null, T[]>();
  for (const f of familias) {
    const p = f.padre_id != null && ids.has(f.padre_id) ? f.padre_id : null;
    hijos.set(p, [...(hijos.get(p) ?? []), f]);
  }
  const salida: (T & { nivel: number; etiqueta: string })[] = [];
  const vistos = new Set<number>();
  const recorrer = (padre: number | null, nivel: number, camino: string) => {
    for (const f of (hijos.get(padre) ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))) {
      if (vistos.has(f.id)) continue;
      vistos.add(f.id);
      const etiqueta = camino ? `${camino} › ${f.nombre}` : f.nombre;
      salida.push({ ...f, nivel, etiqueta });
      recorrer(f.id, nivel + 1, etiqueta);
    }
  };
  recorrer(null, 0, "");
  for (const f of familias) if (!vistos.has(f.id)) salida.push({ ...f, nivel: 0, etiqueta: f.nombre });
  return salida;
}
