// Fechas de una planilla importada (sin dependencias de la base: la usan también los tests).

import type { Valor } from "@/lib/importar/leer";

/** Fecha de la planilla → "2026-03-15" o "2026-03-15T14:30:00" (hora argentina). */
export function leerFecha(v: Valor): string | null {
  if (v == null || v === "") return null;
  const dos = (x: number) => String(x).padStart(2, "0");
  const armar = (a: number, m: number, d: number, h = 0, mi = 0, s = 0) => {
    const f = new Date(Date.UTC(a, m - 1, d, h, mi, s));
    if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || a < 1990 || a > 2100) return null;
    const dia = `${a}-${dos(m)}-${dos(d)}`;
    return h || mi || s ? `${dia}T${dos(h)}:${dos(mi)}:${dos(s)}` : dia;
  };
  if (typeof v === "number") {
    // Número de serie de Excel (días desde el 30/12/1899).
    if (v < 20000 || v > 80000) return null;
    const f = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400) * 1000);
    return armar(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), f.getUTCSeconds());
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return armar(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return armar(a, +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  return null;
}
