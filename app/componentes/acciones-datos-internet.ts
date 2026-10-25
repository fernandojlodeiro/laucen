"use server";

// Revisar lo que la IA buscó en internet (lib/datos-internet.ts): pasarlo a los datos técnicos del producto o borrarlo.
// Se usa desde Preguntas y mensajes › Datos de internet y desde la ficha del producto.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { aprobarDatoWeb, borrarDatoWeb } from "@/lib/datos-internet";

/** Vuelve a la pantalla desde la que se mandó (sólo direcciones de Laucen). */
const volver = (fd: FormData) => {
  const v = texto(fd, "volver") ?? "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/ventas/preguntas?ver=internet";
};

export async function accionAprobarDatoWeb(fd: FormData) {
  const s = await entrarErp("productos_ver");
  await intentar(volver(fd), async () => {
    await aprobarDatoWeb(s.org.id, id(fd, "id"), texto(fd, "dato") ?? undefined);
    revalidatePath("/ventas/preguntas");
    return "Listo: quedó en los datos técnicos del producto.";
  });
}

export async function accionBorrarDatoWeb(fd: FormData) {
  const s = await entrarErp("productos_ver");
  await intentar(volver(fd), async () => {
    await borrarDatoWeb(s.org.id, id(fd, "id"));
    revalidatePath("/ventas/preguntas");
    return "Borrado: la IA ya no lo usa.";
  });
}
