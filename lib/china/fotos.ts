// Fotos propias para la búsqueda por foto: se guardan en la base y se sirven
// con un link público de Laucen (los buscadores de Apify van a buscarla ahí).

import { headers } from "next/headers";
import { pool } from "@/db";
import { asegurarEsquema } from "./esquema";

export const MAX_BYTES = 4 * 1024 * 1024; // lo que acepta Vercel en un envío

/** Guarda la foto y devuelve su link público, o un motivo en criollo. */
export async function guardarFoto(organizacionId: string, archivo: File): Promise<{ link: string } | { motivo: string }> {
  if (!archivo.type.startsWith("image/")) return { motivo: "el archivo no es una imagen" };
  if (archivo.size > MAX_BYTES) return { motivo: "la foto pesa más de 4 MB" };
  await asegurarEsquema();
  const datos = Buffer.from(await archivo.arrayBuffer());
  const r = await pool.query<{ id: string }>(
    "insert into china_fotos (organizacion_id, tipo, datos, bytes) values ($1, $2, $3, $4) returning id",
    [organizacionId, archivo.type, datos, datos.length],
  );
  return { link: `${await baseUrl()}/api/china/foto/${r.rows[0].id}.jpg` };
}

/** La dirección desde la que se está usando Laucen (laucen.vercel.app, etc.). */
async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "");
}

export async function leerFoto(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await asegurarEsquema();
  const r = await pool.query<{ tipo: string; datos: Buffer }>("select tipo, datos from china_fotos where id = $1", [id]);
  return r.rows[0] ?? null;
}

/** Prueba desde el servidor que el link se puede bajar (como lo haría Apify). */
export async function probarLink(link: string): Promise<{ ok: boolean; detalle: string }> {
  try {
    const r = await fetch(link, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const tipo = r.headers.get("content-type") ?? "?";
    const kb = Math.round((await r.arrayBuffer()).byteLength / 1024);
    if (!r.ok) return { ok: false, detalle: `el sitio respondió ${r.status}` };
    if (!tipo.startsWith("image/")) return { ok: false, detalle: `el link no es una imagen (${tipo})` };
    return { ok: true, detalle: `${tipo.replace("image/", "").toUpperCase()}, ${kb} KB` };
  } catch {
    return { ok: false, detalle: "no se pudo bajar (no responde o tardó demasiado)" };
  }
}
