"use client";

// Filtros con botón OK (Fer, 28/10, en pantallas pesadas como Sugerencia de compra): adentro de <FiltrosConOk>, tocar un
// filtro no relee la pantalla; los cambios quedan pendientes acá hasta apretar OK. Los filtros de siempre
// (usarCambiarParametro de BuscadorVivo) lo detectan solos; los que muestran el valor de la dirección leen el pendiente
// con usarParametro().

import { createContext, useContext } from "react";

export type Pendientes = { cambios: Record<string, string | null>; cambiar: (c: Record<string, string | null>) => void };

export const FiltrosPendientes = createContext<Pendientes | null>(null);

/** El valor de un parámetro: el pendiente (si se tocó y falta el OK) o el de la dirección. */
export function usarParametro(nombre: string, valor: string): string {
  const p = useContext(FiltrosPendientes);
  return p && nombre in p.cambios ? p.cambios[nombre] ?? "" : valor;
}
