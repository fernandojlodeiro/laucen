// Piezas comunes del Radar: la semana, la llave de Mercado Libre para los
// datos globales, y los grupos de tendencias.

import { asc } from "drizzle-orm";
import { db } from "@/db";
import { meliCuentas } from "@/db/meli";
import { llamar, tokenVigente, type Respuesta } from "@/lib/meli";

export const SITIO = "MLA";
export const ZONA = "America/Argentina/Buenos_Aires";

/** Fecha 'YYYY-MM-DD' en hora argentina. */
export function hoyAR(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: ZONA });
}

/** El lunes (hora argentina) de la semana de `d`, como 'YYYY-MM-DD'. */
export function semanaDe(d = new Date()): string {
  const [a, m, dia] = hoyAR(d).split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, dia));
  const desdeLunes = (f.getUTCDay() + 6) % 7;
  f.setUTCDate(f.getUTCDate() - desdeLunes);
  return f.toISOString().slice(0, 10);
}

export function fechaCorta(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(`${iso}T12:00:00Z`) : iso;
  return d.toLocaleDateString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit" });
}

// Grupos de tendencias. La API devuelve una sola lista, en tramos fijos
// según la documentación oficial (developers.mercadolibre.com.ar/es_ar/tendencias,
// confirmado por Cowork el 25/9, bitácora #9): 10 primeras = mayor crecimiento,
// 20 siguientes = más deseadas, 20 últimas = más populares. Puede venir menos
// de 50: los tramos se cuentan igual por posición.
export const GRUPOS = {
  // Orden de las pestañas (pedido de Fer): Populares, Más buscadas, Crecimiento.
  populares: {
    label: "Populares", ayuda: "Las tendencias más populares de la semana: las que más subieron en búsquedas contra dos semanas atrás.",
    regla: ["Posiciones 31 a 50.", "Mide el AUMENTO de búsquedas: lo que más subió en la última semana comparado con dos semanas atrás.", "Sirve para detectar lo que está empezando a pegar (temporada, moda, un evento)."],
  },
  buscadas: {
    label: "Más buscadas", ayuda: "Productos con mayor volumen de búsquedas de la última semana.",
    regla: ["Posiciones 11 a 30.", "Mide BÚSQUEDAS: lo que más gente buscó en la última semana, en cantidad absoluta.", "Son los clásicos de siempre: mucho volumen y, en general, mucha competencia."],
  },
  crecimiento: {
    label: "Crecimiento", ayuda: "Productos con el mayor aumento de ingresos (ventas en $) de la última semana.",
    regla: ["Posiciones 1 a 10 de la lista de Mercado Libre.", "Mide INGRESOS, no búsquedas: los productos cuya facturación (ventas en $) más creció en la última semana.", "Sirve para ver qué se está vendiendo cada vez más, aunque todavía no sea masivo."],
  },
} as const;
export type Grupo = keyof typeof GRUPOS;
export const GRUPOS_CONFIRMADOS = true;
export const FUENTE_GRUPOS = "Documentación oficial de Mercado Libre (developers → Tendencias). La lista trae hasta 50 palabras y se actualiza una vez por semana.";

export function grupoDe(posicion: number): Grupo {
  if (posicion <= 10) return "crecimiento";
  if (posicion <= 30) return "buscadas";
  return "populares";
}

/** Llave de Mercado Libre para leer datos globales: la de la organización
 *  pedida si la tiene; si no, la de cualquier organización conectada. */
export async function tokenML(organizacionId?: string): Promise<string | null> {
  if (organizacionId) {
    const t = await tokenVigente(organizacionId).catch(() => null);
    if (t) return t;
  }
  const cuentas = await db.select({ org: meliCuentas.organizacionId }).from(meliCuentas).orderBy(asc(meliCuentas.actualizadoEl));
  for (const c of cuentas) {
    const t = await tokenVigente(c.org).catch(() => null);
    if (t) return t;
  }
  return null;
}

/** GET a la API de ML con la llave global. */
export async function ml(ruta: string, token: string | null): Promise<Respuesta> {
  return llamar(ruta, token);
}

/** Corre `tareas` de a `n` en paralelo mientras quede tiempo (`hasta` = ms). */
export async function enTandas<T>(items: T[], n: number, hasta: number, tarea: (x: T) => Promise<void>): Promise<number> {
  let hechas = 0;
  for (let i = 0; i < items.length && Date.now() < hasta; i += n) {
    await Promise.all(items.slice(i, i + n).map(tarea));
    hechas += Math.min(n, items.length - i);
  }
  return hechas;
}
