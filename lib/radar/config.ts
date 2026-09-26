// Configuración del Radar por organización (pestaña Configuración). Ante la
// duda, un parámetro acá en vez de un valor fijo en el código.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { radarConfig } from "@/db/radar";

export type ConfigRadar = typeof radarConfig.$inferSelect;

export const FUENTES_APIFY = {
  karamelo: { actor: "karamelo~mercado-libre-listings-scraper", label: "karamelo (vendidos, posición)", costoPorPalabra: 0.1 },
  devcake: { actor: "devcake~mercadolibre-scraper", label: "devcake (vendidos, stock, ficha)", costoPorPalabra: 0.19 },
} as const;
export type FuenteApify = keyof typeof FUENTES_APIFY;

export async function configDe(organizacionId: string): Promise<ConfigRadar> {
  const [c] = await db.select().from(radarConfig).where(eq(radarConfig.organizacionId, organizacionId));
  if (c) return c;
  const [nueva] = await db.insert(radarConfig).values({ organizacionId }).onConflictDoNothing().returning();
  if (nueva) return nueva;
  const [otra] = await db.select().from(radarConfig).where(eq(radarConfig.organizacionId, organizacionId));
  return otra;
}

/** ¿Toca correr un proceso? Cada `cada` días/meses desde `desde`, contando
 *  desde la última corrida completa (o desde `desde` si nunca corrió). */
export function toca(cada: number, unidad: string, desde: string, ultimaOk: Date | null, hoy: string): boolean {
  if (hoy < desde) return false;
  if (!ultimaOk) return true;
  const proxima = new Date(ultimaOk);
  if (unidad === "meses") proxima.setMonth(proxima.getMonth() + cada);
  else proxima.setDate(proxima.getDate() + cada);
  // Se compara por día (el cron corre una vez por día): margen de 2 h.
  return Date.now() >= proxima.getTime() - 2 * 3600 * 1000;
}

/** Cuánto sale por semana "profundizar" en una categoría. */
export function costoProfundizar(c: ConfigRadar) {
  return c.palabrasAProfundizar * 2 * FUENTES_APIFY[c.fuenteApify as FuenteApify].costoPorPalabra;
}
