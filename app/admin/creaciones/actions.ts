"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sosVos } from "@/lib/admin";
import { orgRequerida, sesionRequerida } from "@/lib/tenancy";
import { deFondo } from "@/lib/tareas-fondo";
import { prepararPrueba, textoResultadoPrueba } from "@/lib/mercadolibre/prueba-planes";

/** Prepara (sin mandar) los lotes de la prueba de planes de cuotas: lee de ML y comprueba cada alta. De fondo. */
export async function accionPrepararPruebaPlanes() {
  if (!(await sosVos())) redirect("/panel");
  await orgRequerida();
  const s = await sesionRequerida();
  return deFondo(s, "prueba-planes-ml", "Prueba de planes de cuotas en ML", async () => {
    const r = await prepararPrueba(s.org.id, s.usuario.id);
    revalidatePath("/admin/creaciones");
    return textoResultadoPrueba(r);
  });
}
