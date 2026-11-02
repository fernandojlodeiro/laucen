// Fotos para los Excel que se le mandan al proveedor: la foto principal achicada a JPG (Excel no acepta WEBP, que es como
// vienen de Mercado Libre), bajadas de a varias a la vez. La usan el Excel para el proveedor de Sugerencia de compra y el
// Excel para cotizar por SKU.

import sharp from "sharp";

/** Lado de la foto en el Excel, en píxeles. */
export const LADO_FOTO = 90;

/** La foto achicada a JPG. Sin foto o si no se pudo bajar, null. */
export async function miniatura(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    return await sharp(Buffer.from(await r.arrayBuffer())).resize(LADO_FOTO * 2, LADO_FOTO * 2, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer();
  } catch {
    return null;
  }
}

/** Baja las fotos de a diez a la vez, en el mismo orden. */
export async function miniaturas(urls: (string | null | undefined)[]): Promise<(Buffer | null)[]> {
  const out: (Buffer | null)[] = new Array(urls.length).fill(null);
  let i = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (i < urls.length) { const k = i++; out[k] = await miniatura(urls[k]); }
  }));
  return out;
}
