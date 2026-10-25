"use server";
// «Traer preguntas ahora» de Mensajes: barre las preguntas sin responder de todas las cuentas de Mercado Libre.

import { deFondo } from "@/lib/tareas-fondo";
import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { cuentasDe } from "@/lib/mercadolibre/api";
import { barrerPreguntas } from "@/lib/mercadolibre/preguntas";

/** Trae ahora las preguntas sin responder de todas las cuentas con canal. */
export async function accionTraerPreguntas() {
  const s = await entrarErp("preguntas_ver");
  return deFondo(s, "preguntas-ml", "Preguntas de Mercado Libre", async () => {
    const cuentas = (await cuentasDe(s.org.id)).filter((c) => c.canalId && c.estado === "activa");
    if (cuentas.length === 0) throw new ErrorErp("No hay ninguna cuenta de Mercado Libre conectada a un canal.");
    let pendientes = 0;
    const fallaron: string[] = [];
    for (const c of cuentas) {
      try { pendientes += await barrerPreguntas(c); }
      catch (e) { console.error("[preguntas] barrido", c.id, e); fallaron.push(c.nickname ?? `cuenta ${c.id}`); }
    }
    revalidatePath("/ventas/mensajes");
    if (fallaron.length === cuentas.length) throw new ErrorErp("Mercado Libre no devolvió las preguntas. Probá de nuevo en un momento.");
    const n = `${pendientes} pregunta${pendientes === 1 ? "" : "s"} sin responder.`;
    return fallaron.length ? `${n} No se pudo traer de: ${fallaron.join(", ")}.` : n;
  });
}
