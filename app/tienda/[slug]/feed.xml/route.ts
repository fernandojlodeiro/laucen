// Feed de catálogo para Meta Commerce Manager: /tienda/<slug>/feed.xml
// (se carga en Meta como "fuente de datos programada").

import { tiendaPorSlug } from "@/lib/tienda/tienda";
import { feedMeta } from "@/lib/tienda/feed";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await asegurarEsquemaErp();
  const t = await tiendaPorSlug((await params).slug);
  if (!t || !t.listaId) return new Response("No existe esa tienda", { status: 404 });
  const u = new URL(req.url);
  const origen = `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("x-forwarded-host") ?? u.host}`;
  return new Response(await feedMeta(t, origen), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
}
