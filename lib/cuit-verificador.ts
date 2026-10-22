// El dígito verificador del CUIT (módulo 11 de ARCA), sin nada del servidor: lo usan
// también las pantallas para avisar mientras se escribe. lib/cuit.ts lo reexporta.

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** ¿Cierra el dígito verificador? (módulo 11 de ARCA). Sólo la cuenta: no consulta ARCA. */
export function cuitCierra(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false;
  const suma = PESOS.reduce((s, p, i) => s + p * Number(d[i]), 0);
  const r = 11 - (suma % 11);
  const dv = r === 11 ? 0 : r;
  return dv !== 10 && dv === Number(d[10]);
}

export const CUIT_NO_CIERRA = "Ese CUIT no es válido: el último número (el verificador) no corresponde a los anteriores. Revisá que no haya un número cambiado.";
