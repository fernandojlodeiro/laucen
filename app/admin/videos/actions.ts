"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sosVos } from "@/lib/admin";
import { orgRequerida, sesionRequerida } from "@/lib/tenancy";
import { consulta, motivoErp } from "@/lib/erp/base";
import { sondearClips } from "@/lib/mercadolibre/clips";

async function portero() {
  if (!(await sosVos())) redirect("/panel");
  return (await orgRequerida()).id;
}

function volver(mensaje: string, error = false): never {
  revalidatePath("/admin/videos");
  redirect(`/admin/videos?${error ? "error" : "ok"}=${encodeURIComponent(mensaje)}`);
}

/** Anota un video que el navegador ya subió a Storage (con su link firmado). */
export async function accionRegistrarVideo(v: { ruta: string; nombre: string; bytes: number; tipo: string; url: string; vence: string }) {
  const org = await portero();
  const s = await sesionRequerida();
  if (!v.ruta.startsWith(`${org}/`)) return { motivo: "Ese archivo no es de tu organización." };
  try {
    await consulta("insert into video_ml (organizacion_id, nombre, ruta, bytes, tipo, url_firmada, vence_ts, subido_por) values ($1, $2, $3, $4, $5, $6, $7, $8)",
      [org, v.nombre, v.ruta, v.bytes, v.tipo || null, v.url, v.vence, s.usuario.id]);
  } catch (e) { return { motivo: motivoErp(e) }; }
  revalidatePath("/admin/videos");
  return { ok: true as const };
}

/** Sólo lectura: qué contesta Mercado Libre sobre los clips de una publicación. */
export async function accionSondearClips(fd: FormData) {
  const org = await portero();
  const canal = Number(fd.get("canal"));
  const item = String(fd.get("item") ?? "").trim().toUpperCase();
  try { await sondearClips(org, canal, item); } catch (e) { volver(e instanceof Error ? e.message : motivoErp(e), true); }
  volver(`Sondeo de ${item} hecho: el resultado está más abajo. No se cambió nada en Mercado Libre.`);
}
