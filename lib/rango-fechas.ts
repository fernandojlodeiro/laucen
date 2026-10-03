// Los atajos de fechas de RangoFechas (app/componentes/RangoFechas.tsx):
// cada uno da su "desde" y "hasta" (AAAA-MM-DD) contando el día de hoy en la
// Argentina. Sin base ni nada del servidor: lo usa el navegador.

export const ATAJOS_FECHAS = [
  ["hoy", "Hoy"],
  ["ayer", "Ayer"],
  ["7dias", "Últimos 7 días"],
  ["mes", "Este mes"],
  ["mes_anterior", "Último mes"],
  ["trimestre_anterior", "Último trimestre"],
  ["anio_anterior", "Último año"],
] as const;
export type Atajo = (typeof ATAJOS_FECHAS)[number][0];

/** Hoy en la Argentina, AAAA-MM-DD. */
export function hoyArgentina(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Una fecha (año, mes 0-11, día) en UTC; el día 0 es el último del mes anterior. */
const dia = (a: number, m: number, d: number) => iso(new Date(Date.UTC(a, m, d)));

/** El "desde" y "hasta" de un atajo. Mes, trimestre y año "último" son el
 *  anterior entero (el mes pasado, el trimestre calendario pasado, el año pasado). */
export function rangoDeAtajo(atajo: Atajo, hoy: string = hoyArgentina()): { desde: string; hasta: string } {
  const [a, m, d] = hoy.split("-").map(Number);
  const m0 = m - 1;
  switch (atajo) {
    case "hoy": return { desde: hoy, hasta: hoy };
    case "ayer": { const x = dia(a, m0, d - 1); return { desde: x, hasta: x }; }
    case "7dias": return { desde: dia(a, m0, d - 6), hasta: hoy };
    case "mes": return { desde: dia(a, m0, 1), hasta: hoy };
    case "mes_anterior": return { desde: dia(a, m0 - 1, 1), hasta: dia(a, m0, 0) };
    case "trimestre_anterior": {
      const t = Math.floor(m0 / 3) * 3; // primer mes del trimestre actual
      return { desde: dia(a, t - 3, 1), hasta: dia(a, t, 0) };
    }
    case "anio_anterior": return { desde: dia(a - 1, 0, 1), hasta: dia(a - 1, 11, 31) };
  }
}

/** Qué atajo corresponde a un rango ("" si no hay fechas, "personalizado" si no es ninguno). */
export function atajoDeRango(desde: string, hasta: string, hoy: string = hoyArgentina()): Atajo | "" | "personalizado" {
  if (!desde && !hasta) return "";
  for (const [k] of ATAJOS_FECHAS) {
    const r = rangoDeAtajo(k, hoy);
    if (r.desde === desde && r.hasta === hasta) return k;
  }
  return "personalizado";
}
