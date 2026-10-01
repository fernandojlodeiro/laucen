"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero, id } from "@/lib/erp/acciones";

const VOLVER = "/catalogo/cucardas";

export async function accionCrearCucarda(fd: FormData) {
  const s = await entrarErp("cucardas_ver");
  await intentar(VOLVER, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La cucarda necesita un nombre.");
    await consulta("insert into cucarda (organizacion_id, nombre, color, orden) values ($1, $2, $3, $4)",
      [s.org.id, nombre, texto(fd, "color") ?? "#16577F", entero(fd, "orden") ?? 0]);
    revalidatePath(VOLVER);
    return "Cucarda creada.";
  });
}

export async function accionGuardarCucarda(fd: FormData) {
  const s = await entrarErp("cucardas_ver");
  await intentar(VOLVER, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La cucarda necesita un nombre.");
    await consulta(`update cucarda set nombre = $3, color = $4, orden = $5, estado = $6 where id = $2 and organizacion_id = $1`,
      [s.org.id, id(fd), nombre, texto(fd, "color") ?? "#16577F", entero(fd, "orden") ?? 0, fd.get("estado") === "archivada" ? "archivada" : "activa"]);
    revalidatePath(VOLVER);
    return "Guardado.";
  });
}

export async function accionBorrarCucarda(fd: FormData) {
  const s = await entrarErp("cucardas_ver");
  await intentar(VOLVER, async () => {
    await consulta("delete from cucarda where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(VOLVER);
    return "Borrada.";
  });
}
