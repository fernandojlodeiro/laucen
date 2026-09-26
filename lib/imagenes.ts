// Bajar una imagen desde nuestro servidor y pasarla a base64, para mandarla a
// Claude. Mandarle a Claude el link falla con algunos sitios (Mercado Libre,
// alicdn) que no le dejan bajar la foto; desde Vercel sí se puede.

const TIPOS = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type Tipo = (typeof TIPOS)[number];
const MAX = 3.5 * 1024 * 1024;

export type ImagenB64 = { media_type: Tipo; data: string };

export async function aBase64(url: string | null | undefined): Promise<ImagenB64 | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
    if (!(TIPOS as readonly string[]).includes(tipo)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > MAX) return null;
    return { media_type: tipo as Tipo, data: buf.toString("base64") };
  } catch {
    return null;
  }
}
