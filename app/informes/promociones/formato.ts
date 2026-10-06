// Cómo se cuentan las promociones de Mercado Libre (ml_promo_*, db/precios_ml.sql) en criollo.
// Sin JSX: lo usan la pantalla y el Excel.

export const QUE_PROMO: Record<string, string> = {
  campana_alta: "Campaña nueva",
  campana_estado: "Campaña: cambió de estado",
  campana_fechas: "Campaña: cambió de fechas",
  item_alta: "Publicación: apareció en la campaña",
  item_estado: "Publicación: cambió de estado",
  item_precio: "Publicación: cambió el precio",
  item_baja: "Publicación: salió de la campaña",
};

export const ESTADOS_PROMO: Record<string, string> = {
  candidate: "Puede entrar", pending: "Por empezar", started: "En curso", finished: "Terminada", programmed: "Programada", paused: "Pausada",
  active: "Activa", rejected: "Rechazada", cancelled: "Cancelada",
};

export const TIPOS_PROMO: Record<string, string> = {
  DEAL: "Campaña tradicional", LIGHTNING: "Oferta relámpago", SMART: "Campaña automatizada", SELLER_CAMPAIGN: "Campaña del vendedor",
  MARKETPLACE_CAMPAIGN: "Campaña de Mercado Libre", PRICE_DISCOUNT: "Descuento del vendedor", DOD: "Oferta del día", VOLUME: "Descuento por volumen",
  PRE_NEGOTIATED: "Pre-acordada", UNHEALTHY_STOCK: "Stock con poca salida", PRICE_MATCHING: "Igualar precio",
};

/** Un estado en criollo (el de la campaña o de la publicación en ella). */
export const textoEstadoPromo = (e: string | null | undefined) => (e == null || e === "" ? "—" : ESTADOS_PROMO[e] ?? e);

/** Lo que se muestra de un "antes" o "después": estados traducidos, fechas y textos tal cual. */
export function textoValorPromo(que: string, v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  return que === "campana_fechas" ? v.replace(/T\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)?/g, "") : textoEstadoPromo(v);
}

/** Descuento en % de un precio en campaña respecto del de lista; null si no se puede. */
export function descuentoPct(original: number | null | undefined, enCampana: number | null | undefined): number | null {
  if (original == null || enCampana == null || !(original > 0)) return null;
  return Math.round((1 - enCampana / original) * 1000) / 10;
}
