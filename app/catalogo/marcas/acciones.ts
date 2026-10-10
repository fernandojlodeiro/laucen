"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { motivoErp } from "@/lib/erp/base";
import { crearMarca, renombrarMarca, borrarMarca } from "@/lib/catalogo/marcas";
import type { Opcion } from "@/app/componentes/ElegirDeLista";

const VOLVER = "/catalogo/marcas";

export async function accionCrearMarca(fd: FormData) {
  const s = await entrarErp("productos_ver");
  await intentar(VOLVER, async () => {
    const m = await crearMarca(s.org.id, texto(fd, "nombre") ?? "");
    revalidatePath(VOLVER);
    return `Marca «${m.nombre}» creada.`;
  });
}

export async function accionGuardarMarca(fd: FormData) {
  const s = await entrarErp("productos_ver");
  await intentar(VOLVER, async () => {
    const r = await renombrarMarca(s.org.id, id(fd), texto(fd, "nombre") ?? "");
    revalidatePath(VOLVER);
    return r.unida ? `Unida con «${r.unida}»: sus productos pasaron a esa marca.` : "Guardado.";
  });
}

export async function accionBorrarMarca(fd: FormData) {
  const s = await entrarErp("productos_ver");
  await intentar(VOLVER, async () => {
    await borrarMarca(s.org.id, id(fd));
    revalidatePath(VOLVER);
    return "Borrada.";
  });
}

/** «+ Crear «…»» desde el desplegable de la ficha del producto. */
export async function accionCrearMarcaDesdeFicha(nombre: string): Promise<Opcion | { error: string }> {
  const s = await entrarErp("productos_ver");
  try {
    const m = await crearMarca(s.org.id, nombre);
    return { id: m.id, texto: m.nombre };
  } catch (e) {
    return { error: motivoErp(e) };
  }
}
