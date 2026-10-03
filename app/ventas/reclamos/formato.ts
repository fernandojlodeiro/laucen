// Cómo se cuentan los reclamos en pantalla: el tiempo que queda para
// responder y los tonos de cada estado.

import type { EstadoReclamo } from "@/lib/reclamos";

type Tono = "verde" | "gris" | "amarillo" | "rojo" | "azul";

/** "Quedan 5 h" (rojo si quedan menos de 24 h), "Venció hace 2 h", "Quedan 3 días". */
export function tiempoParaResponder(vence: Date | string | null | undefined, ahora = Date.now()): { texto: string; tono: Tono } | null {
  if (!vence) return null;
  const min = Math.round((new Date(vence).getTime() - ahora) / 60_000);
  const cuanto = (m: number) => {
    const a = Math.abs(m);
    if (a < 60) return `${a} min`;
    const h = Math.round(a / 60);
    if (h < 48) return `${h} h`;
    const d = Math.round(h / 24);
    return `${d} días`;
  };
  if (min < 0) return { texto: `Venció hace ${cuanto(min)}`, tono: "rojo" };
  return { texto: `Quedan ${cuanto(min)}`, tono: min < 24 * 60 ? "rojo" : min < 72 * 60 ? "amarillo" : "gris" };
}

export const TONO_RECLAMO: Record<EstadoReclamo, Tono> = { abierto: "amarillo", en_proceso: "azul", resuelto: "verde" };
