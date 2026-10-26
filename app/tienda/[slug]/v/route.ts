// Lo que el navegador del visitante avisa para el registro propio de la tienda (lib/tienda/visitantes.ts): la visita
// (una vez por sesión), el producto que miró y el checkout empezado. El carrito, el clic en WhatsApp y la compra los
// anota el servidor al hacerlos. Sin datos del visitante: su id anónimo y su sello de entradas van en las galletas.

import { tiendaPorSlug } from "@/lib/tienda/tienda";
import { registrarEvento } from "@/lib/tienda/visitantes";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const t = await tiendaPorSlug((await params).slug);
  if (!t) return new Response(null, { status: 204 });
  const b = (await req.json().catch(() => ({}))) as { tipo?: string; pagina?: string; producto?: number };
  const tipo = b.tipo === "visita" || b.tipo === "producto" || b.tipo === "checkout" ? b.tipo : null;
  if (tipo) await registrarEvento(t.organizacionId, tipo, { pagina: typeof b.pagina === "string" ? b.pagina : null, productoId: Number(b.producto) || null });
  return new Response(null, { status: 204 });
}
