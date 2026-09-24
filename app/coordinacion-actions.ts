"use server";

// Las acciones de servidor de la bitácora y "para probar". Portado del
// admin-actions.ts de CadaMes (sólo la parte de coordinación).
//
// AJUSTAR: `soloAdmin()` usa `sosVos()` de lib/admin.ts, que tenés que
// conectar con el login real de este proyecto (ver el comentario en ese
// archivo).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { pendientes } from "@/db/coordinacion";
import { eq } from "drizzle-orm";
import { sosVos } from "@/lib/admin";
import {
  anotar, alCambiarEstado, marcarVisto, confirmarLectura, esTipo, esEstado, esPrioridad, limpiar,
} from "@/lib/coordinacion";
import {
  cargar as cargarParaProbar, marcar as marcarPrueba, editarVuelta, borrarVuelta, borrarHilo,
  areasDe, esMarca,
} from "@/lib/para-probar";

async function soloAdmin() {
  if (!(await sosVos())) redirect("/");
}

// ── Bitácora ───────────────────────────────────────────

/** Fer escribe siempre como "fer": el autor no es un campo del formulario.
 *  Quién escribe se sabe por quién está logueado. */
export async function accionAnotarEnBitacora(formData: FormData) {
  await soloAdmin();
  const tipo = String(formData.get("tipo") ?? "");
  const titulo = limpiar(formData.get("titulo"));
  if (!titulo || !esTipo(tipo)) {
    redirect("/admin/bitacora?error=falta");
  }

  const respondeA = Number(formData.get("respondeA"));
  await anotar({
    autor: "fer",
    tipo,
    titulo,
    detalle: limpiar(formData.get("detalle")),
    motivo: limpiar(formData.get("motivo")),
    pendientes: limpiar(formData.get("pendientes")),
    refDoc: limpiar(formData.get("refDoc")),
    respondeA: Number.isInteger(respondeA) && respondeA > 0 ? respondeA : null,
  });
  revalidatePath("/admin/bitacora");
  redirect("/admin/bitacora?ok=anotado");
}

export async function accionEstadoDePendiente(formData: FormData) {
  await soloAdmin();
  const id = Number(formData.get("pendienteId"));
  const estado = String(formData.get("estado") ?? "");
  if (!Number.isInteger(id) || !esEstado(estado)) {
    redirect("/admin/bitacora?error=falta");
  }
  await db.update(pendientes)
    .set({
      ...alCambiarEstado(estado, "fer"),
      notaResolucion: limpiar(formData.get("notaResolucion")),
    })
    .where(eq(pendientes.id, id));
  revalidatePath("/admin/bitacora");
  redirect(`/admin/bitacora?ok=pendiente#p${id}`);
}

export async function accionMarcarVisto(formData: FormData) {
  await soloAdmin();
  const id = Number(formData.get("entradaId"));
  if (Number.isInteger(id) && id > 0) await marcarVisto(id);
  revalidatePath("/admin/bitacora");
  redirect(`${String(formData.get("volverA") || "/admin/bitacora")}#e${id}`);
}

export async function accionResponderEntrada(formData: FormData) {
  await soloAdmin();
  const respondeA = Number(formData.get("respondeA"));
  const tipo = String(formData.get("tipo") ?? "");
  const titulo = limpiar(formData.get("titulo"));
  const volverA = String(formData.get("volverA") || "/admin/bitacora");
  if (!titulo || !esTipo(tipo) || !Number.isInteger(respondeA) || respondeA <= 0) {
    redirect(`${volverA}#e${respondeA}`);
  }

  await anotar({
    autor: "fer", tipo, titulo,
    detalle: limpiar(formData.get("detalle")),
    respondeA,
  });
  await marcarVisto(respondeA);
  revalidatePath("/admin/bitacora");
  redirect(`${volverA}#e${respondeA}`);
}

export async function accionConfirmarLectura(formData: FormData) {
  await soloAdmin();
  const id = Number(formData.get("entradaId"));
  const volverA = String(formData.get("volverA") ?? "/admin/bitacora");
  if (Number.isFinite(id)) await confirmarLectura(id, "fer");
  revalidatePath("/admin/bitacora");
  redirect(volverA);
}

// ── Para probar ────────────────────────────────────────

export async function accionCargarParaProbar(formData: FormData) {
  await soloAdmin();
  const titulo = limpiar(formData.get("titulo"));
  const prioridad = String(formData.get("prioridad") ?? "media");
  const volverA = String(formData.get("volverA") || "/admin/para-probar");
  if (!titulo || !esPrioridad(prioridad)) redirect(`${volverA}?error=falta`);
  const pedidoPor = limpiar(formData.get("pedidoPor"));
  const id = await cargarParaProbar({
    autor: "fer",
    pedidoPor,
    sesion: limpiar(formData.get("sesion")),
    titulo,
    detalle: limpiar(formData.get("detalle")),
    areas: areasDe(formData.getAll("areas")),
    prioridad,
  });
  revalidatePath("/admin/para-probar");
  redirect(`${volverA}${volverA.includes("?") ? "&" : "?"}ok=${id}#p${id}`);
}

export async function accionMarcarPrueba(formData: FormData) {
  await soloAdmin();
  const id = Number(formData.get("id"));
  const marca = String(formData.get("marca") ?? "");
  const volverA = String(formData.get("volverA") || "/admin/para-probar");
  if (!Number.isInteger(id) || id <= 0 || !esMarca(marca)) redirect(volverA);
  const hecho = await marcarPrueba(id, marca, limpiar(formData.get("texto")), "fer");
  revalidatePath("/admin/para-probar");
  const sep = volverA.includes("?") ? "&" : "?";
  redirect(`${volverA}${sep}${hecho ? "ok" : "error"}=${id}#p${id}`);
}

export async function accionEditarVuelta(formData: FormData) {
  await soloAdmin();
  const id = Number(formData.get("vueltaId"));
  const hilo = Number(formData.get("id"));
  const volverA = String(formData.get("volverA") || "/admin/para-probar");
  if (!Number.isInteger(id) || id <= 0) redirect(volverA);
  const hecho = await editarVuelta(id, limpiar(formData.get("texto")), "fer");
  revalidatePath("/admin/para-probar");
  const sep = volverA.includes("?") ? "&" : "?";
  redirect(`${volverA}${sep}${hecho ? "ok" : "error"}=${hilo}#p${hilo}`);
}

export async function accionBorrarVuelta(formData: FormData) {
  await soloAdmin();
  const id = Number(formData.get("vueltaId"));
  const hilo = Number(formData.get("id"));
  const volverA = String(formData.get("volverA") || "/admin/para-probar");
  if (Number.isInteger(id) && id > 0) await borrarVuelta(id, "fer");
  revalidatePath("/admin/para-probar");
  redirect(`${volverA}#p${hilo}`);
}

export async function accionBorrarHilo(formData: FormData) {
  await soloAdmin();
  const id = Number(formData.get("id"));
  const volverA = String(formData.get("volverA") || "/admin/para-probar");
  if (Number.isInteger(id) && id > 0) await borrarHilo(id, "fer");
  revalidatePath("/admin/para-probar");
  redirect(volverA);
}
