// El pedido en PDF para el comprador (Fer, 25/10): «Descargar en PDF» de la página del pedido. El mismo PDF
// formal del presupuesto (lib/pedidos/presupuesto-pdf.ts), sin las observaciones internas.

import { tiendaPorSlug } from "@/lib/tienda/tienda";
import { una, motivoErp } from "@/lib/erp/base";
import { pdfPresupuesto } from "@/lib/pedidos/presupuesto-pdf";
import type { Moneda } from "@/lib/moneda";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; codigo: string }> }) {
  const { slug, codigo } = await params;
  const t = await tiendaPorSlug(slug);
  if (!t || !/^[\w-]{4,40}$/.test(codigo)) return texto("Ese pedido no existe.", 404);
  const p = await una<{ id: number; moneda: Moneda }>(`
    select p.id::int, p.moneda from pedido p join canal c on c.id = p.canal_id
     where p.organizacion_id = $1 and (p.canal_id = $2 or c.tipo in ('local', 'web_mayorista', 'otro')) and p.codigo_seguimiento = $3`,
  [t.organizacionId, t.canalId, codigo]);
  if (!p) return texto("Ese pedido no existe.", 404);
  try {
    const { pdf } = await pdfPresupuesto(t.organizacionId, p.id, p.moneda, { publico: true });
    return new Response(Buffer.from(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Pedido-${p.id}.pdf"`, "cache-control": "no-store" },
    });
  } catch (e) {
    console.error("[pedido pdf]", p.id, e instanceof Error ? e.message : e);
    return texto(motivoErp(e), 400);
  }
}
