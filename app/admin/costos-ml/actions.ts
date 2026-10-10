"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sosVos } from "@/lib/admin";
import { asegurarEsquema } from "@/lib/costos-ml/esquema";
import { pool } from "@/db";
import { avanzar, iniciarHoy } from "@/lib/costos-ml/proceso";

/** Crea la corrida de hoy (si no existe; si ya terminó, rehace las comisiones) y la
 *  avanza un poco; lo que falte lo sigue pg_cron cada 5 minutos. */
export async function accionCorrerAhora() {
  if (!(await sosVos())) redirect("/panel");
  await asegurarEsquema();
  const id = await iniciarHoy();
  // Si la de hoy ya terminó, se vuelven a relevar las comisiones (Fer, 10/10: «Correr ahora» no hacía nada).
  await pool.query("update ml_costos_corridas set terminada = null, fases = array_remove(fases, 'comisiones') where id = $1 and terminada is not null", [id]);
  await avanzar(Date.now() + 50_000);
  revalidatePath("/admin/costos-ml");
}
