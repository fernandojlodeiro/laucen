"use server";

import { redirect } from "next/navigation";
import { entrarErp } from "@/app/componentes/erp";
import { leerNumero } from "@/lib/numeros";
import { guardarConfigSeguimiento } from "@/lib/seguimiento";
import { motivoErp } from "@/lib/erp/base";

export async function accionGuardarConfigSeguimiento(fd: FormData) {
  const s = await entrarErp("empresa_config");
  try {
    await guardarConfigSeguimiento(s.org.id, { frecuenciaDias: leerNumero(fd.get("frecuencia_dias")) ?? 0, topeUsd: leerNumero(fd.get("tope_usd")) ?? -1, demoraDias: leerNumero(fd.get("demora_dias")) ?? 0 });
  } catch (e) {
    redirect(`/config/seguimiento?editar=ficha&error=${encodeURIComponent(motivoErp(e))}`);
  }
  redirect(`/config/seguimiento?ok=${encodeURIComponent("Grabado.")}`);
}
