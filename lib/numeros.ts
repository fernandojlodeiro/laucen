// Números en pantalla, a la argentina: punto de miles, coma decimal. Sirve
// del lado del navegador (formatear al salir del campo) y del servidor (leer
// lo que llegó en el formulario).

export type TipoNumero = "pesos" | "usd" | "pct" | "entero" | "decimal";

/** Lee un número escrito a mano: "70.000" = 70000, "7,1" = 7.1 y también
 *  "7.1" = 7.1 (un punto que no separa miles es la coma decimal). */
export function leerNumero(v: unknown): number | null {
  let t = String(v ?? "").replace(/[$%\s]|US/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Cómo se muestra según el tipo: precios con punto de miles (y hasta 2
 *  decimales), porcentajes con 1 decimal, enteros sin decimales. */
export function formatearNumero(n: number | null | undefined, tipo: TipoNumero): string {
  if (n == null || !Number.isFinite(n)) return "";
  const opciones: Intl.NumberFormatOptions =
    tipo === "pct" ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
    : tipo === "entero" ? { maximumFractionDigits: 0 }
    : { maximumFractionDigits: 2 };
  return n.toLocaleString("es-AR", opciones);
}
