"use server";

import { redirect } from "next/navigation";
import { sesionRequerida } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { guardarAccesos, opcionesDeAcceso, MAX_ACCESOS } from "@/lib/accesos";

export async function accionGuardarAccesos(fd: FormData) {
  const s = await sesionRequerida();
  const validas = new Set(opcionesDeAcceso((p) => tienePermiso(s.permisos, p)).map((o) => o.href));
  const elegidos = [...new Set(fd.getAll("acceso").map(String))].filter((h) => validas.has(h));
  if (elegidos.length > MAX_ACCESOS) redirect(`/config/accesos?error=${encodeURIComponent(`Elegí hasta ${MAX_ACCESOS}.`)}`);
  await guardarAccesos(s.usuario.id, s.org.id, elegidos);
  redirect(`/config/accesos?ok=${encodeURIComponent(elegidos.length ? "Listo: ya están en la barra de abajo del celular." : "Listo: vuelven los accesos de siempre.")}`);
}
