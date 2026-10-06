"use server";

// "Actualizar" de Mercado Pago: lee todas las cuentas de fondo (tarea de
// fondo: el botón dice "Trabajando…" y al terminar aparece el cartel y la
// pantalla se actualiza sola).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { lanzarTarea } from "@/lib/tareas-fondo";
import { leerTodas } from "@/lib/mercadopago/saldos";

export async function accionLeerMercadoPago(_fd: FormData): Promise<{ ok: boolean; mensaje?: string }> {
  const s = await entrarErp("mercadopago_ver");
  await lanzarTarea(s.org.id, s.usuario.id, "mercadopago", "Mercado Pago", async () => {
    const { conexiones, lecturas } = await leerTodas(s.org.id);
    revalidatePath("/administracion/mercadopago");
    const conProblemas = [...lecturas.values()].filter((l) => l.intentos.some((x) => x.status >= 300)).length;
    return `Se leyeron ${lecturas.size} de ${conexiones.length} cuenta${conexiones.length === 1 ? "" : "s"}${conProblemas ? ` (${conProblemas} con problemas: mirá «Qué contestó Mercado Pago»)` : " correctamente"}.`;
  });
  return { ok: true };
}
