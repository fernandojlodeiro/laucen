"use server";

import { redirect } from "next/navigation";
import { sesionRequerida } from "@/lib/tenancy";
import { fijarPrefsAvisos } from "@/lib/avisos";
import { cambiarEquipo } from "@/lib/avisos-push";
import { leerNumero } from "@/lib/numeros";
import { CADA_MIN_MAX, TIPOS_AVISO, type ClaveContador } from "@/lib/avisos-tipos";

export async function accionGuardarAvisos(fd: FormData) {
  const s = await sesionRequerida();
  const cadaMin = leerNumero(fd.get("cada_min"));
  if (cadaMin == null || !Number.isInteger(cadaMin) || cadaMin < 1 || cadaMin > CADA_MIN_MAX) {
    redirect(`/config/avisos?editar=ficha&error=${encodeURIComponent(`Los minutos van de 1 a ${CADA_MIN_MAX}, sin decimales.`)}`);
  }
  try {
    await fijarPrefsAvisos(s.usuario.id, s.org.id, { sonido: fd.get("sonido") === "1", ventana: Object.fromEntries(TIPOS_AVISO.map((t) => [t, fd.get(`ventana_${t}`) === "1"])) as Record<ClaveContador, boolean>,
      pedidoDetalle: fd.get("pedidos_detalle") === "1", cadaMin });
  } catch {
    redirect(`/config/avisos?editar=ficha&error=${encodeURIComponent("No se pudo grabar: probá de nuevo en un rato.")}`);
  }
  redirect(`/config/avisos?ok=${encodeURIComponent("Listo: grabado.")}`);
}

/** Un equipo de la lista «Tus equipos»: recibir todo o sólo lo derivado, silenciarlo un rato, apagarlo o prenderlo. */
export async function accionEquipo(fd: FormData) {
  const s = await sesionRequerida();
  const id = Number(fd.get("id"));
  const que = String(fd.get("que") ?? "");
  const manana8 = () => {
    // Mañana a las 8 de la mañana, hora argentina (UTC−3).
    const ar = new Date(Date.now() - 3 * 3_600_000);
    return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + 1, 11));
  };
  const cambios: Record<string, Parameters<typeof cambiarEquipo>[2]> = {
    solo: { solo: true }, todo: { solo: false },
    hora: { pausa: new Date(Date.now() + 3_600_000) }, manana: { pausa: manana8() },
    apagar: { pausa: "apagado" }, prender: { pausa: null },
    // El interruptor manda valor=1 para prender y 0 para apagar.
    interruptor: { pausa: fd.get("valor") === "1" ? null : "apagado" },
  };
  if (!Number.isInteger(id) || !cambios[que]) redirect(`/config/avisos?error=${encodeURIComponent("No se sabe qué cambiar.")}`);
  try {
    await cambiarEquipo(s.usuario.id, id, cambios[que]);
  } catch {
    redirect(`/config/avisos?error=${encodeURIComponent("No se pudo: probá de nuevo en un rato.")}`);
  }
  redirect(`/config/avisos?ok=${encodeURIComponent("Listo.")}`);
}
