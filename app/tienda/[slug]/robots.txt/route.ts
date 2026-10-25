// robots.txt de cada dominio de tienda (bitácora #856): todo lo público se recorre; el carrito, el
// pago, la cuenta, los pedidos y las búsquedas no. Apunta al sitemap del mismo dominio.

import { headers } from "next/headers";
import { tiendaPorSlug } from "@/lib/tienda/tienda";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await asegurarEsquemaErp();
  const t = await tiendaPorSlug((await params).slug);
  if (!t) return new Response("No existe", { status: 404 });
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "";
  const texto = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /carrito", "Disallow: /checkout", "Disallow: /cuenta", "Disallow: /pedido/", "Disallow: /sugerencias",
    "Disallow: /buscar", "Disallow: /*?*q=", "Disallow: /*?*orden=",
    "",
    `Sitemap: https://${host}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(texto, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
