"use server";

import { sesionRequerida } from "@/lib/tenancy";
import { anotarVisto, borrarHistorial, type Visto } from "@/lib/historial";

export async function accionAnotarVisto(v: Visto): Promise<Visto[]> {
  const s = await sesionRequerida();
  return anotarVisto(s.usuario.id, s.org.id, v);
}

export async function accionBorrarHistorial(): Promise<void> {
  const s = await sesionRequerida();
  await borrarHistorial(s.usuario.id, s.org.id);
}
