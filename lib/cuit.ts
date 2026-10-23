// CUIT: se guarda como 11 dígitos sin guiones y se muestra 30-12345678-9.
// Se acepta escrito con guiones, puntos o espacios.

import { ErrorErp } from "@/lib/erp/base";

import { cuitCierra, CUIT_NO_CIERRA } from "@/lib/cuit-verificador";

export { cuitCierra };

/** El CUIT del formulario, normalizado a 11 dígitos; si no cierra, un error en criollo. */
export function cuitDelFormulario(v: string | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) throw new ErrorErp("Falta el CUIT.");
  if (d.length !== 11) throw new ErrorErp(`El CUIT tiene que tener 11 números (tiene ${d.length}).`);
  if (!cuitCierra(d)) throw new ErrorErp(CUIT_NO_CIERRA);
  return d;
}

export function cuitLegible(v: string | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (v ?? "");
}
