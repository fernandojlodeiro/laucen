"use server";
// El embudo de publicidad: leer los anuncios de Meta en el momento y desconectar la cuenta (lib/publicidad/meta-ads.ts).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar } from "@/lib/erp/acciones";
import { deFondo } from "@/lib/tareas-fondo";
import { ErrorErp } from "@/lib/erp/base";
import { desconectarAnunciosMeta, leerAnunciosMeta } from "@/lib/publicidad/meta-ads";

const VOLVER = "/informes/embudo-publicidad";

export async function accionLeerMeta() {
  const s = await entrarErp("publicidad_ver");
  return deFondo(s, "meta-ads", "Anuncios de Meta", async () => {
    const r = await leerAnunciosMeta(s.org.id);
    revalidatePath(VOLVER);
    if (r.estado === "rechazo") throw new ErrorErp("Meta no dejó leer los anuncios: volvé a conectar la cuenta.");
    return `Listo: se leyeron ${r.filas} días de anuncios de Meta.`;
  });
}

export async function accionDesconectarMeta() {
  const s = await entrarErp("publicidad_ver");
  await intentar(VOLVER, async () => {
    await desconectarAnunciosMeta(s.org.id);
    revalidatePath(VOLVER);
    return "Listo: la cuenta de anuncios de Meta quedó desconectada.";
  });
}
