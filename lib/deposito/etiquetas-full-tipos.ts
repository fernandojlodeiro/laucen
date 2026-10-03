// Lo de las etiquetas de Full que también usa la pantalla (sin base ni PDF).

export type ImpresoraFull = "termica" | "a4" | "zpl";
/** Las impresoras: clave, texto y si ya anda (ZPL, "próximamente"). */
export const IMPRESORAS_FULL: [ImpresoraFull, string, boolean][] = [
  ["termica", "Térmica 50×25", true], ["a4", "A4 (impresora común)", true], ["zpl", "Térmica ZPL (próximamente)", false],
];
export const esImpresoraFull = (x: unknown): x is "termica" | "a4" => x === "termica" || x === "a4";
/** La cookie donde queda la impresora elegida. */
export const COOKIE_IMPRESORA_FULL = "etq_full_imp";
/** Etiquetas por hoja A4 (3 columnas × 10 filas). */
export const POR_HOJA_FULL = 30;
/** Tope de etiquetas por PDF. */
export const MAXIMO_FULL = 1000;

/** Una publicación (o variante) de ML con lo que va en su etiqueta. */
export type PublicacionFull = {
  item_id: string; variation_id: string; titulo: string; atributos: string | null; sku: string | null;
  /** El inventory_id ("Código ML"); null si ML no lo dio. */
  codigo: string | null; logistica: string | null;
};
