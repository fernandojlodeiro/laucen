// El logo de la tienda sin su margen (Fer, 28/10): las imágenes que se suben suelen tener el dibujo en el medio
// de mucho blanco o transparente (ej. 1024×747), y en la franja de 34 px de alto el logo quedaba diminuto. Acá se
// recorta ese margen y sale en WebP. Sólo sirve imágenes de nuestro Storage público (no es un proxy abierto);
// con caché larga, porque el nombre de cada archivo subido lleva la hora y no se pisa.

import sharp from "sharp";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=86400, s-maxage=31536000, immutable";
const PERMITIDO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") ?? "";
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !u.startsWith(PERMITIDO)) return new Response("No existe", { status: 404 });
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return Response.redirect(u, 302);
    const crudo = Buffer.from(await r.arrayBuffer());
    const webp = await sharp(crudo).trim({ threshold: 25 }).resize(600, 200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer()
      .catch(() => sharp(crudo).webp({ quality: 90 }).toBuffer());
    return new Response(new Uint8Array(webp), { headers: { "content-type": "image/webp", "cache-control": CACHE } });
  } catch (e) {
    console.error("[logo]", e instanceof Error ? e.message : e);
    return Response.redirect(u, 302);
  }
}
