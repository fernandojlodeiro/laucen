// Cuánto cancela una imputación de cuenta corriente de cada lado, cuando el
// débito y el crédito pueden estar en monedas distintas. Sin base: lo usan
// imputarAutomatico() e imputar() de lib/administracion/cc.ts y los tests.
//
// Criterio: cada renglón lleva su `pendiente` en SU moneda (una factura en
// dólares, en dólares; un recibo u orden de pago, en pesos). Si el débito y el
// crédito son de la misma moneda, se restan tal cual. Si no, el crédito (el
// pago o la nota de crédito) se pasa a la moneda del débito con el tipo de
// cambio del día del crédito: un pago en pesos cancela dólares a la cotización
// del día en que se pagó, y el pendiente de la factura en dólares baja en
// dólares. Ningún lado queda negativo por redondeo.

export type MonedaCc = "ARS" | "USD";

/** Lo que falta cancelar de un renglón, siempre en positivo y en su moneda. */
export type PendienteCc = { moneda: MonedaCc; p: number };

/** Cuánto baja el pendiente del débito y del crédito (cada uno en su moneda),
 *  y la cotización usada (null si eran de la misma moneda). */
export type Aplicacion = { debito: number; credito: number; cotizacion: number | null };

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Menos de medio centavo es cero (las columnas guardan dos decimales). */
const CERO = 0.005;

/** Pasa un importe de una moneda a la otra con `cot` pesos por dólar (sin redondear). */
export function equivalente(importe: number, de: MonedaCc, a: MonedaCc, cot: number): number {
  if (de === a) return importe;
  return de === "USD" ? importe * cot : importe / cot;
}

/** Cuánto se cancela de cada lado. `tope` = lo que se pide cancelar del débito,
 *  en la moneda del débito (imputación a mano); sin tope, lo máximo posible.
 *  Devuelve null si no hay nada que imputar (alguno ya está en cero, falta la
 *  cotización o lo que queda no llega a un centavo del otro lado). */
export function aplicar(deb: PendienteCc, cre: PendienteCc, cot: number | null, tope?: number): Aplicacion | null {
  if (deb.p < CERO || cre.p < CERO) return null;
  const maxDeb = Math.min(deb.p, tope ?? Infinity);
  if (deb.moneda === cre.moneda) {
    const m = r2(Math.min(maxDeb, cre.p));
    return m >= 0.01 ? { debito: m, credito: m, cotizacion: null } : null;
  }
  if (!cot || !(cot > 0)) return null;
  const creEnDeb = equivalente(cre.p, cre.moneda, deb.moneda, cot);
  let d: number, c: number;
  if (creEnDeb <= maxDeb) {
    // El crédito alcanza para menos (o justo): se usa entero.
    c = r2(cre.p);
    d = r2(Math.min(creEnDeb, deb.p));
  } else {
    // El débito (o el tope) es lo que manda: el crédito cancela su equivalente.
    d = r2(maxDeb);
    c = r2(Math.min(equivalente(d, deb.moneda, cre.moneda, cot), cre.p));
    // Si lo que sobra del crédito no llega a un centavo en la moneda del
    // débito, no sirve para cancelar nada más: se usa entero.
    if (equivalente(cre.p - c, cre.moneda, deb.moneda, cot) < CERO) c = r2(cre.p);
  }
  if (d < 0.01 || c < 0.01) return null;
  return { debito: d, credito: c, cotizacion: cot };
}

/** Un renglón para el reparto automático: id, pendiente y (los créditos) su cotización. */
export type RenglonCc = PendienteCc & { id: number; cot?: number | null };
export type Imputacion = Aplicacion & { debitoId: number; creditoId: number };

/** Reparte los créditos contra los débitos, cada lista ya ordenada (de lo más
 *  viejo a lo más nuevo). Un débito que un crédito no puede tocar (moneda
 *  distinta sin cotización) queda para el siguiente. Modifica los `p`. */
export function repartir(debitos: RenglonCc[], creditos: RenglonCc[]): Imputacion[] {
  const out: Imputacion[] = [];
  for (const cr of creditos) {
    for (const d of debitos) {
      if (cr.p < CERO) break;
      const a = aplicar(d, cr, cr.cot ?? null);
      if (!a) continue;
      out.push({ ...a, debitoId: d.id, creditoId: cr.id });
      d.p = r2(d.p - a.debito); cr.p = r2(cr.p - a.credito);
    }
  }
  return out;
}
