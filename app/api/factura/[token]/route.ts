// El PDF de una factura por su enlace público (el botón de la plantilla de WhatsApp,
// lib/facturacion/envio.ts): un código al azar por comprobante, sin sesión.

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { una } from "@/lib/erp/base";
import { pdfComprobante } from "@/lib/arca/pdf";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{36}$/.test(token)) return new Response("No existe", { status: 404 });
  await asegurarEsquemaErp();
  const c = await una<{ id: number; org: string; tipo: number; pv: number; numero: string | null }>(
    "select id::int, organizacion_id org, tipo_cbte tipo, punto_venta pv, numero::text from comprobante where enlace_token = $1 and estado = 'autorizado'", [token]);
  if (!c) return new Response("No existe", { status: 404 });
  const pdf = await pdfComprobante(c.org, c.id);
  const nombre = `Comprobante-${String(c.pv).padStart(5, "0")}-${String(c.numero ?? "").padStart(8, "0")}.pdf`;
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${nombre}"`, "cache-control": "private, no-store" } });
}
