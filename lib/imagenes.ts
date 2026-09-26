// Bajar una imagen desde nuestro servidor y pasarla a base64, para mandarla a
// Claude. Mandarle a Claude el link falla con algunos sitios (Mercado Libre,
// alicdn) que no le dejan bajar la foto; desde Vercel sí se puede.

const TIPOS = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type Tipo = (typeof TIPOS)[number];
const MAX = 3.5 * 1024 * 1024;

export type ImagenB64 = { media_type: Tipo; data: string };

function tipoPorContenido(b: Buffer): Tipo | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (b.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function aBase64(url: string | null | undefined): Promise<ImagenB64 | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > MAX) return null;
    // El tipo se reconoce por el contenido, no por lo que dice el sitio: alicdn
    // manda WEBP con nombre y encabezado de JPG, y Claude rechaza el pedido
    // entero si el tipo declarado no coincide.
    const tipo = tipoPorContenido(buf);
    if (!tipo) return null;
    return { media_type: tipo, data: buf.toString("base64") };
  } catch {
    return null;
  }
}
