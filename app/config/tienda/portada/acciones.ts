"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { parametroBusqueda } from "@/lib/busqueda";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, id } from "@/lib/erp/acciones";
import { agregar, quitar, mover, buscarParaPortada, esLista, type ProductoHallado } from "@/lib/tienda/portada";

const volver = (canal: number) => `/config/tienda/portada?canal=${canal}`;
const listaDe = (fd: FormData) => { const l = fd.get("lista"); if (!esLista(l)) throw new ErrorErp("Esa fila no existe."); return l; };

/** Lo que pide el buscador de la portada mientras se tipea. */
export async function accionBuscarParaPortada(canalId: number, lista: string, q: string, comienza: boolean): Promise<ProductoHallado[]> {
  const s = await entrarErp("tienda_config");
  const t = String(q ?? "").trim();
  if (t.length < 2 || !esLista(lista)) return [];
  return buscarParaPortada(s.org.id, Number(canalId) || 0, lista, parametroBusqueda(t, comienza));
}

export async function accionAgregarPortada(canalId: number, lista: string, productoId: number): Promise<{ error?: string }> {
  const s = await entrarErp("tienda_config");
  try {
    if (!esLista(lista)) throw new ErrorErp("Esa fila no existe.");
    await agregar(s.org.id, Number(canalId), lista, Number(productoId));
    revalidatePath("/config/tienda/portada");
    return {};
  } catch (e) {
    return { error: e instanceof ErrorErp ? e.message : "No se pudo agregar." };
  }
}

export async function accionQuitarPortada(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(volver(canal), async () => { await quitar(s.org.id, canal, listaDe(fd), id(fd, "producto_id")); });
}

export async function accionMoverPortada(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const canal = id(fd, "canal_id");
  await intentar(volver(canal), async () => { await mover(s.org.id, canal, listaDe(fd), id(fd, "producto_id"), fd.get("paso") === "-1" ? -1 : 1); });
}
