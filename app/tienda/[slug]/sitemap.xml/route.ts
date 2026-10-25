// sitemap.xml de cada dominio de tienda (bitácora #856): la portada, las categorías con productos y
// las fichas de los productos publicados con stock, con su fecha de última modificación. Un
// dominio de otra marca que apunta su canonical al principal no lista nada: sus páginas cuentan
// como las del principal.

import { headers } from "next/headers";
import { consulta } from "@/lib/erp/base";
import { tiendaPorSlug } from "@/lib/tienda/tienda";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { dominioCanonico } from "@/lib/tienda/seo";
import { arbolDe, catalogoDe } from "../catalogo";

export const dynamic = "force-dynamic";

const fecha = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await asegurarEsquemaErp();
  const t = await tiendaPorSlug((await params).slug);
  if (!t) return new Response("No existe", { status: 404 });
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "";
  const urls: { loc: string; lastmod?: string }[] = [];
  if (host && (await dominioCanonico(t, host)) === host) {
    const base = `https://${host}`;
    const [catalogo, arbol] = await Promise.all([catalogoDe(t), arbolDe(t)]);
    const conStock = catalogo.filter((p) => p.stock > 0);
    const fechas = new Map((await consulta<{ id: number; f: Date }>(
      "select id::int, coalesce(actualizado_ts, creado_ts) f from producto where organizacion_id = $1 and id = any($2::bigint[])",
      [t.organizacionId, conStock.map((p) => p.id)])).map((x) => [x.id, fecha(x.f)]));
    const ultima = [...fechas.values()].sort().at(-1);
    urls.push({ loc: `${base}/`, lastmod: ultima });
    for (const n of arbol.nodos.values()) if (n.total > 0) urls.push({ loc: `${base}/familia/${n.id}`, lastmod: ultima });
    for (const p of conStock) urls.push({ loc: `${base}/producto/${p.id}`, lastmod: fechas.get(p.id) });
    urls.push({ loc: `${base}/ayuda` }, { loc: `${base}/nosotros` });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `
  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("")}
</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
