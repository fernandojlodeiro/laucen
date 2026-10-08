// El color de cada canal (Fer, 8/10): uno suave, de los de fondo de pantalla,
// distinto en cada canal. Toda pantalla que muestra datos de un canal pinta su
// fila —o su columna— con ese color: marca el elemento con data-canal="<id>"
// y el marco (app/componentes/marco/Marco.tsx) pone una sola regla de estilo
// por canal. Se elige en Configuración › Canales.

import { consulta } from "@/lib/erp/base";

/** Colores suaves, bien distintos entre sí, para fondo. */
export const PALETA_CANALES = [
  "#E3EEFF", "#FFF3CC", "#E2F5E7", "#F1E6FF", "#FFE6DC", "#DDF4F4",
  "#EEF0DA", "#FCE4EF", "#E8EAF6", "#FFF0E0", "#E0F2F1", "#F5F5DC",
] as const;

export const NOMBRE_COLOR: Record<string, string> = {
  "#E3EEFF": "Celeste", "#FFF3CC": "Amarillo", "#E2F5E7": "Verde", "#F1E6FF": "Lila", "#FFE6DC": "Durazno", "#DDF4F4": "Agua",
  "#EEF0DA": "Oliva", "#FCE4EF": "Rosa", "#E8EAF6": "Lavanda", "#FFF0E0": "Naranja", "#E0F2F1": "Menta", "#F5F5DC": "Beige",
};

/** El primer color de la paleta que no usa ningún otro canal (para un canal nuevo). */
export function colorLibre(usados: (string | null)[]): string {
  const u = new Set(usados.filter(Boolean).map((c) => c!.toUpperCase()));
  return PALETA_CANALES.find((c) => !u.has(c)) ?? PALETA_CANALES[usados.length % PALETA_CANALES.length];
}

/** La regla de estilo de los canales de la organización. Un canal sin color no pinta nada. */
export async function estilosCanales(org: string): Promise<string> {
  const filas = await consulta<{ id: number; color: string | null }>("select id::int, color from canal where organizacion_id = $1 and color is not null", [org]);
  return filas.filter((f) => /^#[0-9A-Fa-f]{6}$/.test(f.color ?? "")).map((f) => `[data-canal="${f.id}"]{background-color:${f.color}}`).join("");
}
