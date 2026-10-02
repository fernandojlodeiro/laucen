// CUIT: se guarda como 11 dígitos sin guiones y se muestra 30-12345678-9.
// Se acepta escrito con guiones, puntos o espacios.

import { ErrorErp } from "@/lib/erp/base";

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** ¿Cierra el dígito verificador? (módulo 11 de ARCA). */
export function cuitCierra(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false;
  const suma = PESOS.reduce((s, p, i) => s + p * Number(d[i]), 0);
  const r = 11 - (suma % 11);
  const dv = r === 11 ? 0 : r;
  return dv !== 10 && dv === Number(d[10]);
}

/** El CUIT del formulario, normalizado a 11 dígitos; si no cierra, un error en criollo. */
export function cuitDelFormulario(v: string | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) throw new ErrorErp("Falta el CUIT.");
  if (d.length !== 11) throw new ErrorErp(`El CUIT tiene que tener 11 números (tiene ${d.length}).`);
  if (!cuitCierra(d)) throw new ErrorErp("Ese CUIT no cierra: el último número (el verificador) no corresponde a los anteriores. Revisá que no haya un número cambiado.");
  return d;
}

export function cuitLegible(v: string | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (v ?? "");
}
