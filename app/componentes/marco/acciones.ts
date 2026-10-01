"use server";

// Acciones del marco: el interruptor "ver en pesos / ver en dólares".

import { revalidatePath } from "next/cache";
import { sesionRequerida } from "@/lib/tenancy";
import { esMoneda, fijarMonedaVista } from "@/lib/moneda";

export async function accionMonedaVista(formData: FormData) {
  const sesion = await sesionRequerida();
  const moneda = formData.get("moneda");
  if (!esMoneda(moneda)) return;
  await fijarMonedaVista(sesion.usuario.id, sesion.org.id, moneda);
  revalidatePath("/", "layout");
}
