// Fechas de las pantallas del depósito, siempre en hora de Argentina.

const ZONA = "America/Argentina/Buenos_Aires";

/** "AAAA-MM-DD" del día en Argentina (para comparar con hoyAR()). */
export function diaAR(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

/** "dd/mm hh:mm". */
export function fechaHoraAR(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
}

/** Las clases de los botones grandes del depósito (se aprietan con el dedo). */
export const GRANDE = "text-base px-4 py-3";

export const TIPO_RECEPCION: Record<string, string> = { compra: "Compra a proveedor", devolucion: "Devolución de un pedido", otro: "Otra entrada" };
