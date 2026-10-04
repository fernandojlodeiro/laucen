"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar } from "@/lib/erp/acciones";
import { ErrorErp } from "@/lib/erp/base";
import { actualizarReputaciones } from "@/lib/mercadolibre/reputacion";

/** Vuelve a leer de ML la reputación de todas las cuentas conectadas (leer es siempre seguro). */
export async function accionActualizarReputacion() {
  const s = await entrarErp("tablero_ml_ver");
  await intentar("/mercadolibre", async () => {
    const n = await actualizarReputaciones(s.org.id, { forzar: true });
    if (!n) throw new ErrorErp("Mercado Libre no contestó o no hay cuentas conectadas. Probá de nuevo en un rato.");
    revalidatePath("/mercadolibre");
    return `Reputación actualizada (${n} cuenta${n === 1 ? "" : "s"}).`;
  });
}
