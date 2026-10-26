// La imagen de un banner que está en el Google Drive de la organización (db/tienda.sql, tienda_banner_archivo).
// Sólo sirve archivos que algún banner usa: la primera vez lo baja del Drive, lo pasa a WebP y lo guarda en la
// base; después sale de ahí. Con caché larga: el archivo de un id no cambia.

import sharp from "sharp";
import { una, consulta } from "@/lib/erp/base";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { tokenDeAcceso, bajarDelDrive } from "@/lib/google/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE = "public, max-age=86400, s-maxage=31536000, immutable";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!/^[\w-]{10,100}$/.test(id)) return new Response("No existe", { status: 404 });
  await asegurarEsquemaErp();
  const guardado = await una<{ tipo: string; contenido: Buffer }>("select tipo, contenido from tienda_banner_archivo where id = $1", [id]);
  if (guardado) return new Response(new Uint8Array(guardado.contenido), { headers: { "content-type": guardado.tipo, "cache-control": CACHE } });
  const b = await una<{ org: string }>(`select organizacion_id org from tienda_banner where imagen like '%/api/tienda/imagen/' || $1 || '%' limit 1`, [id]);
  if (!b) return new Response("No existe", { status: 404 });
  try {
    const crudo = Buffer.from(await bajarDelDrive(await tokenDeAcceso(b.org), id));
    const webp = await sharp(crudo).webp({ quality: 86 }).toBuffer();
    await consulta(`insert into tienda_banner_archivo (id, organizacion_id, tipo, contenido) values ($1, $2, 'image/webp', $3) on conflict (id) do nothing`, [id, b.org, webp]);
    return new Response(new Uint8Array(webp), { headers: { "content-type": "image/webp", "cache-control": CACHE } });
  } catch (e) {
    console.error("[imagen]", id, e instanceof Error ? e.message : e);
    return new Response("No se pudo traer la imagen", { status: 502, headers: { "cache-control": "no-store" } });
  }
}
