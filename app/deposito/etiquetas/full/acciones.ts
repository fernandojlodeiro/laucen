"use server";

// Etiquetas de Full: buscar publicaciones de ML y, al agregar una, traer su
// Código ML (si Laucen no lo tiene, se lo pide a ML: sólo lectura).

import { entrarErp } from "@/app/componentes/erp";
import { motivoErp } from "@/lib/erp/base";
import { buscarPublicacionesFull, completarCodigoFull, type PublicacionFull } from "@/lib/deposito/etiquetas-full";

export async function accionBuscarFull(canalId: number, q: string, comienza: boolean): Promise<{ ok: true; filas: PublicacionFull[] } | { ok: false; mensaje: string }> {
  const s = await entrarErp("etiquetas_ver");
  try {
    return { ok: true, filas: await buscarPublicacionesFull(s.org.id, Number(canalId), String(q ?? ""), !!comienza) };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}

export async function accionCodigoFull(canalId: number, item: string, variacion: string): Promise<{ ok: true; fila: PublicacionFull } | { ok: false; mensaje: string }> {
  const s = await entrarErp("etiquetas_ver");
  try {
    return { ok: true, fila: await completarCodigoFull(s.org.id, Number(canalId), String(item), String(variacion ?? "")) };
  } catch (e) {
    return { ok: false, mensaje: motivoErp(e) };
  }
}
