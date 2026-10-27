// Días de la semana de las reglas comerciales y los banners de la tienda (Fer, 27/10: «miércoles y
// sábados −10 % en 3 cuotas», con su banner sólo esos días). Se guardan como números ISO: 1 = lunes …
// 7 = domingo; sin días (null o vacío) = todos. Siempre en hora argentina.

// Sin imports de servidor: lo usan también las casillas del formulario (navegador).

export const DIAS_SEMANA = [
  { n: 1, letra: "L", nombre: "lunes" }, { n: 2, letra: "M", nombre: "martes" }, { n: 3, letra: "M", nombre: "miércoles" },
  { n: 4, letra: "J", nombre: "jueves" }, { n: 5, letra: "V", nombre: "viernes" }, { n: 6, letra: "S", nombre: "sábado" },
  { n: 7, letra: "D", nombre: "domingo" },
] as const;

const HORA_AR = -3; // Argentina no cambia la hora en verano

/** El día de la semana en la Argentina (1 = lunes … 7 = domingo). */
export function diaSemanaAR(ahora = new Date()): number {
  const d = new Date(ahora.getTime() + HORA_AR * 3_600_000).getUTCDay();
  return d === 0 ? 7 : d;
}

/** La fecha de hoy en la Argentina, "AAAA-MM-DD". */
export function fechaAR(ahora = new Date()): string {
  return new Date(ahora.getTime() + HORA_AR * 3_600_000).toISOString().slice(0, 10);
}

/** Los días válidos, sin repetir y en orden; todos o ninguno = null (vale cualquier día). */
export function normalizarDias(x: unknown): number[] | null {
  const lista = (Array.isArray(x) ? x : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  const unicos = [...new Set(lista)].sort((a, b) => a - b);
  return unicos.length === 0 || unicos.length === 7 ? null : unicos;
}

/** ¿Vale hoy? Sin días, siempre. */
export function valeElDia(dias: number[] | null | undefined, ahora = new Date()): boolean {
  return !dias?.length || dias.includes(diaSemanaAR(ahora));
}

/** "Miércoles y sábados", "Lunes a viernes", "Todos los días". */
export function textoDias(dias: number[] | null | undefined): string {
  const d = normalizarDias(dias);
  if (!d) return "Todos los días";
  const corrido = d.length > 2 && d.every((n, i) => i === 0 || n === d[i - 1] + 1);
  const plural = (n: number) => { const x = DIAS_SEMANA[n - 1].nombre; return x.endsWith("s") ? x : `${x}s`; };
  if (corrido) return cap(`${DIAS_SEMANA[d[0] - 1].nombre} a ${DIAS_SEMANA[d[d.length - 1] - 1].nombre}`);
  const nombres = d.map(plural);
  return cap(nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`);
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
