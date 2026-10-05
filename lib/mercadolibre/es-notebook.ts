// Qué es una notebook de ML y cuándo hay que eliminarla (reglas puras; las usan notebooks.ts y fantasmas.ts).

/** Notebook = categoría de ML "Notebooks" (MLA1652) o título que empieza con "Notebook"
 *  (la misma regla que Limpieza → "Notebooks sin stock"). */
export const esNotebook = (titulo: string | null | undefined, categoria: string | null | undefined): boolean =>
  categoria === "MLA1652" || /^notebook\b/i.test((titulo ?? "").trim());

/** ¿Hay que eliminarla? No activa, y que ML no la tenga ya eliminada. */
export const hayQueEliminar = (estado: string | null | undefined, subEstados: string[] | null | undefined): boolean =>
  !!estado && estado !== "active" && !(subEstados ?? []).includes("deleted");
