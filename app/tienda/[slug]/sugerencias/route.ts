// Sugerencias del buscador del encabezado: /tienda/<slug>/sugerencias?q=…
// Hasta 8 productos de la tienda cuyo título (o marca o SKU) tiene todas las
// palabras; primero los que empiezan con lo escrito. Sale del mismo catálogo
// que los listados (catalogo.ts), sin precios.

import { tiendaPorSlug } from "@/lib/tienda/tienda";
import { catalogoDe, filtrarPorTexto, ordenar } from "../catalogo";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return Response.json([]);
  const t = await tiendaPorSlug((await params).slug);
  if (!t) return Response.json([], { status: 404 });
  const lista = ordenar(filtrarPorTexto(await catalogoDe(t), q), "relevancia", q).slice(0, 8);
  return Response.json(lista.map((p) => ({ id: p.id, titulo: p.titulo, foto: p.foto })), { headers: { "cache-control": "private, max-age=30" } });
}
