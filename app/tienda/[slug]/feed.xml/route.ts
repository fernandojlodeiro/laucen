// Feed de catálogo para Meta Commerce Manager: /tienda/<slug>/feed.xml
// (se carga en Meta como "fuente de datos programada").

import { tiendaPorSlug } from "@/lib/tienda/tienda";
import { feedMeta } from "@/lib/tienda/feed";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { urlTienda } from "@/lib/tienda/dominios-tienda";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await asegurarEsquemaErp();
  const t = await tiendaPorSlug((await params).slug);
  if (!t || !t.listaId) return new Response("No existe esa tienda", { status: 404 });
  // Los links del feed, con la dirección pública de la tienda (su dominio, si tiene).
  return new Response(await feedMeta(t, await urlTienda(t)), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
}
