"use server";

import { redirect } from "next/navigation";
import { sesionRequerida } from "@/lib/tenancy";
import { fijarPrefsAvisos } from "@/lib/avisos";

export async function accionGuardarAvisos(fd: FormData) {
  const s = await sesionRequerida();
  try {
    await fijarPrefsAvisos(s.usuario.id, s.org.id, { sonido: fd.get("sonido") === "1", ventana: fd.get("ventana") === "1" });
  } catch {
    redirect(`/config/avisos?editar=ficha&error=${encodeURIComponent("No se pudo grabar: probá de nuevo en un rato.")}`);
  }
  redirect(`/config/avisos?ok=${encodeURIComponent("Listo: grabado.")}`);
}
