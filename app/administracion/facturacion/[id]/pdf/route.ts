// El PDF de un comprobante autorizado, para ver en el navegador (inline).
// Los errores van en texto llano (es lo que se ve en esa pestaña).

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una, motivoErp } from "@/lib/erp/base";
import { pdfComprobante } from "@/lib/arca/pdf";
import { nombrePdf } from "../../comun";

export const dynamic = "force-dynamic";

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) return texto("Tenés que entrar a Laucen para ver la factura.", 401);
  if (!tienePermiso(sesion.permisos, "facturacion_ver")) return texto("No tenés permiso de facturación.", 403);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return texto("Ese comprobante no existe.", 404);
  try {
    const c = await una<{ tipo_cbte: number; punto_venta: number; numero: string | null }>(
      "select tipo_cbte, punto_venta, numero::text from comprobante where id = $1 and organizacion_id = $2", [id, sesion.org.id]);
    if (!c) return texto("Ese comprobante no existe.", 404);
    const pdf = await pdfComprobante(sesion.org.id, id);
    return new Response(Buffer.from(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${nombrePdf(c.tipo_cbte, c.punto_venta, c.numero)}"` },
    });
  } catch (e) {
    return texto(motivoErp(e), 400);
  }
}
