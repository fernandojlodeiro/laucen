"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sosVos } from "@/lib/admin";
import { asegurarEsquema } from "@/lib/costos-ml/esquema";
import { avanzar, iniciarHoy } from "@/lib/costos-ml/proceso";

/** Crea la corrida de hoy (si no existe) y la avanza un poco; lo que falte lo
 *  sigue pg_cron cada 5 minutos. */
export async function accionCorrerAhora() {
  if (!(await sosVos())) redirect("/panel");
  await asegurarEsquema();
  await iniciarHoy();
  await avanzar(Date.now() + 50_000);
  revalidatePath("/admin/costos-ml");
}
