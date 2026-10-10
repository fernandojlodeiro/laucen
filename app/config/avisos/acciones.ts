"use server";

import { redirect } from "next/navigation";
import { sesionRequerida } from "@/lib/tenancy";
import { fijarPrefsAvisos } from "@/lib/avisos";
import { leerNumero } from "@/lib/numeros";
import { CADA_MIN_MAX, TIPOS_AVISO, type ClaveContador } from "@/lib/avisos-tipos";

export async function accionGuardarAvisos(fd: FormData) {
  const s = await sesionRequerida();
  const cadaMin = leerNumero(fd.get("cada_min"));
  if (cadaMin == null || !Number.isInteger(cadaMin) || cadaMin < 1 || cadaMin > CADA_MIN_MAX) {
    redirect(`/config/avisos?editar=ficha&error=${encodeURIComponent(`Los minutos van de 1 a ${CADA_MIN_MAX}, sin decimales.`)}`);
  }
  try {
    await fijarPrefsAvisos(s.usuario.id, s.org.id, { sonido: fd.get("sonido") === "1", ventana: Object.fromEntries(TIPOS_AVISO.map((t) => [t, fd.get(`ventana_${t}`) === "1"])) as Record<ClaveContador, boolean>, cadaMin });
  } catch {
    redirect(`/config/avisos?editar=ficha&error=${encodeURIComponent("No se pudo grabar: probá de nuevo en un rato.")}`);
  }
  redirect(`/config/avisos?ok=${encodeURIComponent("Listo: grabado.")}`);
}
