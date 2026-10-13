// La garantía de una publicación de Mercado Libre, como texto (puro: se prueba sin base ni red).
// ML la guarda en dos condiciones de venta (sale_terms): WARRANTY_TYPE y WARRANTY_TIME.

export type TerminoVenta = { id: string; value_name?: string | null };

/** "Garantía del vendedor · 12 meses". Sin garantía, "Sin garantía". Si ML no dice nada, null. */
export function garantiaDeTerminos(terminos: TerminoVenta[] | null | undefined): string | null {
  const t = (id: string) => (terminos ?? []).find((x) => x.id === id)?.value_name?.trim() || "";
  const tipo = t("WARRANTY_TYPE");
  const tiempo = t("WARRANTY_TIME");
  if (!tipo && !tiempo) return null;
  if (/^sin garant/i.test(tipo)) return "Sin garantía";
  return [tipo, tiempo].filter(Boolean).join(" · ");
}

/** La garantía que Laucen les puso a las notebooks vendidas antes de que se pasaran a 1 año (13/10). */
export const GARANTIA_NOTEBOOK_ANTERIOR = "Garantía del vendedor · 3 meses";
