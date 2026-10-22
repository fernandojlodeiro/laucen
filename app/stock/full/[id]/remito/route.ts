// El remito de un envío a Full en PDF (lib/full/remito.ts), para el transportista. Lo abre el botón
// «Remito» de la ficha del envío, en otra pestaña.

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { motivoErp } from "@/lib/erp/base";
import { pdfRemito } from "@/lib/full/remito";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) return texto("Tenés que entrar a Laucen para ver el remito.", 401);
  if (!tienePermiso(sesion.permisos, "full_ver")) return texto("No tenés permiso para ver los envíos a Full.", 403);
  const eid = Number((await params).id);
  if (!Number.isInteger(eid) || eid <= 0) return texto("Ese envío no existe.", 404);
  try {
    const { pdf, nombre } = await pdfRemito(sesion.org.id, eid);
    return new Response(Buffer.from(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${nombre}"`, "cache-control": "no-store" },
    });
  } catch (e) {
    return texto(motivoErp(e), 400);
  }
}
