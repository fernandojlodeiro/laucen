// Clips (videos) de las publicaciones de Mercado Libre (Fer, 13/10). El video se sube a Laucen desde
// /admin/videos (bucket "videos") y la cola lo manda a ML con un POST multipart. Como la ruta de subida
// para publicaciones comunes no está confirmada por ML, `sondearClips` lee (sólo GET) qué contesta ML.

import { consulta, una } from "@/lib/erp/base";
import { ml, mlArchivo, cuentaDelCanal, type CuentaMl, type RespuestaMl, type ArchivoMl } from "@/lib/mercadolibre/api";

export type SubirClip = (cuenta: CuentaMl, ruta: string, campo: string, archivo: ArchivoMl, extras: Record<string, string>) => Promise<RespuestaMl>;
export const subirClipDeVerdad: SubirClip = (c, ruta, campo, a, extras) => mlArchivo(c, ruta, campo, a, { extras, timeoutMs: 120_000 });

export type ResultadoClip = { tipo: "error"; mensaje: string } | { tipo: "respuesta"; r: RespuestaMl };

/** Un cambio de la cola con payload { marca: 'subir_clip', video_id, ruta, campo, extras }: baja el video y lo manda. */
export async function enviarClip(org: string, payload: Record<string, unknown>, cuenta: CuentaMl, subir: SubirClip = subirClipDeVerdad): Promise<ResultadoClip> {
  const ruta = String(payload.ruta ?? "");
  if (!ruta.startsWith("/") || ruta.includes("..")) return { tipo: "error", mensaje: "El cambio tiene una ruta mal armada." };
  const v = await una<{ nombre: string; tipo: string | null; url_firmada: string; vencido: boolean }>(
    "select nombre, tipo, url_firmada, vence_ts < now() vencido from video_ml where id = $1 and organizacion_id = $2", [Number(payload.video_id), org]);
  if (!v) return { tipo: "error", mensaje: "El video ya no está en Laucen." };
  if (v.vencido) return { tipo: "error", mensaje: "El link del video venció: hay que volver a subirlo." };
  let datos: Uint8Array;
  try {
    const r = await fetch(v.url_firmada, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return { tipo: "error", mensaje: `No se pudo leer el video guardado (${r.status}).` };
    datos = new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    return { tipo: "error", mensaje: `No se pudo leer el video guardado: ${(e as Error).message}` };
  }
  const extras = Object.fromEntries(Object.entries((payload.extras ?? {}) as Record<string, unknown>).map(([k, x]) => [k, typeof x === "string" ? x : JSON.stringify(x)]));
  const r = await subir(cuenta, ruta, String(payload.campo ?? "file"), { nombre: v.nombre, tipo: v.tipo || "video/quicktime", datos }, extras);
  return { tipo: "respuesta", r };
}

export type Sondeo = { fecha: string; canal: string; item: string; resultados: { ruta: string; status: number; cuerpo: string }[] };

/** Sólo lectura: qué contesta ML sobre los clips de una publicación y qué video tiene cargado. Guarda el resultado. */
export async function sondearClips(org: string, canalId: number, itemId: string): Promise<Sondeo> {
  const cuenta = await cuentaDelCanal(org, canalId);
  if (!cuenta || cuenta.estado !== "activa") throw new Error("Esa cuenta de Mercado Libre no está conectada.");
  if (!/^MLA\d+$/.test(itemId)) throw new Error("El número de publicación tiene que ser tipo MLA123456789.");
  const nombre = (await consulta<{ nombre: string }>("select nombre from canal where id = $1", [canalId]))[0]?.nombre ?? String(canalId);
  const rutas = [
    `/items/${itemId}?attributes=id,status,video_id,tags,catalog_listing,listing_type_id,site_id`,
    `/marketplace/items/${itemId}/clips`,
    `/items/${itemId}/clips`,
    `/items/${itemId}/video`,
  ];
  const resultados: Sondeo["resultados"] = [];
  for (const ruta of rutas) {
    const r = await ml(cuenta, "GET", ruta);
    resultados.push({ ruta, status: r.status, cuerpo: (typeof r.datos === "string" ? r.datos : JSON.stringify(r.datos)).slice(0, 600) });
  }
  const sondeo: Sondeo = { fecha: new Date().toISOString(), canal: nombre, item: itemId, resultados };
  await consulta(`insert into config_org (organizacion_id, clave, valor) values ($1, 'clips_sondeo', $2::jsonb)
                  on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`, [org, JSON.stringify(sondeo)]);
  return sondeo;
}
