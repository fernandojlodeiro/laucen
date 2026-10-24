// La dirección vieja del catálogo de Meta (/tienda/<slug>/feed.xml): el mismo de /feeds/meta.xml.

import { headers } from "next/headers";
import { tiendaPorSlug } from "@/lib/tienda/tienda";
import { catalogoPublicidad } from "@/lib/tienda/feed";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { conMarca, urlTienda } from "@/lib/tienda/dominios-tienda";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await asegurarEsquemaErp();
  const base = await tiendaPorSlug((await params).slug);
  if (!base?.listaId) return new Response("No existe esa tienda", { status: 404 });
  const t = await conMarca(base, (await headers()).get("host"));
  const c = await catalogoPublicidad(t, await urlTienda(t), "meta");
  return new Response(c.xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900, s-maxage=900" } });
}
