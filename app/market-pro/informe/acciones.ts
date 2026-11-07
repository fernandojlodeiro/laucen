"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { deFondo } from "@/lib/tareas-fondo";
import { borrarExtra } from "@/lib/marketpro/informe";
import { generarInforme } from "@/lib/marketpro/informe-ia";

/** «Volver a analizar»: la IA explora los datos y reescribe el informe de la categoría (de fondo, unos minutos). */
export async function accionAnalizar(fd: FormData) {
  const s = await entrarErp("market_pro_ver");
  const cat = Number(fd.get("cat")) || 0;
  return deFondo(s, `marketpro-informe-${cat}`, "Market Pro: escribir el informe", async () => {
    const msj = await generarInforme(s.org.id, cat, { authId: s.usuario.authId ?? "", permisos: s.permisos, superadmin: s.superadmin, usuarioId: s.usuario.id });
    revalidatePath("/market-pro/informe");
    return msj;
  });
}

export async function accionBorrarExtra(id: number) {
  const s = await entrarErp("market_pro_ver");
  await borrarExtra(s.org.id, id);
  revalidatePath("/market-pro/informe");
}
