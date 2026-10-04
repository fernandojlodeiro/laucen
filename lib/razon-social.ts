// Qué razón social (CUIT) mira una pantalla: la que viene en la dirección
// (?rs=<id>) o, sin elegir, "todas" (los libros contables y los listados) o la
// principal (lo que tiene que ser de una sola, como el libro de IVA). Con una
// sola razón social no hay nada que elegir: el selector no aparece.

import { emisoresDe, type Emisor } from "@/lib/arca/facturar";

export type EleccionRs = {
  razones: Emisor[];
  /** Hay más de una: se muestra el selector. */
  multi: boolean;
  /** El id elegido; null = todas (sólo si la pantalla admite "todas"). */
  id: number | null;
  actual: Emisor | null;
};

export async function elegirRazonSocial(org: string, param: string | undefined, { todas = true }: { todas?: boolean } = {}): Promise<EleccionRs> {
  const razones = await emisoresDe(org);
  const multi = razones.length > 1;
  let id: number | null = null;
  if (multi) {
    const pedido = Number(param) || null;
    if (pedido && razones.some((r) => r.id === pedido)) id = pedido;
    else if (!todas) id = (razones.find((r) => r.es_principal) ?? razones[0]).id;
  } else if (!todas) {
    id = razones[0]?.id ?? null;
  }
  return { razones, multi, id, actual: razones.find((r) => r.id === id) ?? null };
}

export const nombreRs = (e: { nombre: string | null; razon_social: string }) => e.nombre ?? e.razon_social;
