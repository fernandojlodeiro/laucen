"use client";

// Cliente de Supabase para el navegador, con la sesión del usuario logueado.
// Sirve para subir archivos directo a Supabase Storage (fotos, Excel) sin
// pasar por el servidor (Vercel corta los envíos de más de ~4 MB). Las
// políticas de db/archivos.sql sólo dejan escribir bajo "<organizacion_id>/…".

import { createBrowserClient } from "@supabase/ssr";

export function supabaseNavegador() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

/** Sube un archivo a un bucket y devuelve su ruta (y su link público si el
 *  bucket es público), o un motivo en criollo. */
export async function subirArchivo(bucket: "productos" | "importaciones" | "videos" | "videos_tienda" | "comprobantes", organizacionId: string, archivo: File, carpeta = "") {
  const limpio = archivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
  const ruta = [organizacionId, carpeta, `${Date.now()}-${limpio}`].filter(Boolean).join("/");
  const sb = supabaseNavegador();
  const { error } = await sb.storage.from(bucket).upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false });
  if (error) return { motivo: "No se pudo subir el archivo. Probá de nuevo en un momento." } as const;
  const url = bucket === "productos" || bucket === "videos_tienda" ? sb.storage.from(bucket).getPublicUrl(ruta).data.publicUrl : null;
  return { ruta, url } as const;
}

/** Sube un video al bucket privado "videos" y devuelve su ruta y un link firmado por 30 días (con el que la cola lo baja). */
export async function subirVideo(organizacionId: string, archivo: File) {
  const limpio = archivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
  const ruta = [organizacionId, `${Date.now()}-${limpio}`].join("/");
  const sb = supabaseNavegador();
  const { error } = await sb.storage.from("videos").upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false });
  if (error) return { motivo: "No se pudo subir el video. Probá de nuevo en un momento." } as const;
  const dias = 30;
  const firmado = await sb.storage.from("videos").createSignedUrl(ruta, dias * 86400);
  if (firmado.error || !firmado.data?.signedUrl) return { motivo: "El video se subió pero no se pudo preparar el link. Probá de nuevo." } as const;
  return { ruta, url: firmado.data.signedUrl, vence: new Date(Date.now() + dias * 86400_000).toISOString() } as const;
}
