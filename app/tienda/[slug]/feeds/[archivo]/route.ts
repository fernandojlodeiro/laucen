// Catálogos para publicidad (lib/tienda/feed.ts): https://<dominio>/feeds/google.xml, meta.xml y
// tiktok.xml. Los links de los productos van al dominio por donde se pidió el catálogo.

import { headers } from "next/headers";
import { tiendaPorSlug } from "@/lib/tienda/tienda";
import { catalogoPublicidad, type Plataforma } from "@/lib/tienda/feed";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { conMarca, urlTienda } from "@/lib/tienda/dominios-tienda";

export const dynamic = "force-dynamic";

const ARCHIVOS: Record<string, Plataforma> = { "google.xml": "google", "meta.xml": "meta", "tiktok.xml": "tiktok" };

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; archivo: string }> }) {
  const { slug, archivo } = await params;
  const plataforma = ARCHIVOS[archivo];
  if (!plataforma) return new Response("No existe", { status: 404 });
  await asegurarEsquemaErp();
  const base = await tiendaPorSlug(slug);
  if (!base?.listaId) return new Response("No existe esa tienda", { status: 404 });
  const t = await conMarca(base, (await headers()).get("host"));
  const c = await catalogoPublicidad(t, await urlTienda(t), plataforma);
  return new Response(c.xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900, s-maxage=900" } });
}
