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

// Grupos de tendencias. La API devuelve una sola lista (hasta 50 palabras,
// en general 40) y la página de cada categoría de Mercado Libre la muestra en
// dos carruseles: "Las búsquedas más deseadas" = posiciones 1 a 20 y "Las
// tendencias más populares" = 21 en adelante. Verificado por Fer el 27/9 en
// Jardín y Aire Libre (el 20º más deseado es la palabra 20 de la API y el 20º
// más popular, la 40). La documentación decía otra cosa (bitácora #9: 1-10
// crecimiento, 11-30 deseadas, 31-50 populares) y no coincide con la página.
export const GRUPOS = {
  // Orden de las pestañas: Populares, Más deseadas.
  populares: {
    label: "Más populares", ayuda: "“Las tendencias más populares” de la página de la categoría: las que más subieron en búsquedas.",
    regla: ["Posiciones 21 en adelante de la lista de Mercado Libre (en la página: “Las tendencias más populares”).", "Según la documentación de Mercado Libre, mide el AUMENTO de búsquedas contra dos semanas atrás.", "Sirve para detectar lo que está empezando a pegar (temporada, moda, un evento)."],
  },
  buscadas: {
    label: "Más deseadas", ayuda: "“Las búsquedas más deseadas” de la página de la categoría: lo más buscado de la semana.",
    regla: ["Posiciones 1 a 20 de la lista de Mercado Libre (en la página: “Las búsquedas más deseadas”).", "Mide BÚSQUEDAS: lo que más gente buscó en la última semana.", "Son los clásicos: mucho volumen y, en general, mucha competencia."],
  },
} as const;
export type Grupo = keyof typeof GRUPOS;
export const GRUPOS_CONFIRMADOS = true;
export const FUENTE_GRUPOS = "Mismos grupos que muestra Mercado Libre en la página de cada categoría (verificado el 27/9). La lista se actualiza una vez por semana.";

export function grupoDe(posicion: number): Grupo {
  return posicion <= 20 ? "buscadas" : "populares";
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
