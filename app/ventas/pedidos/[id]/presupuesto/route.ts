// El presupuesto en PDF para ver e imprimir (lib/pedidos/presupuesto-pdf.ts),
// en la moneda en que se mira el panel. Lo abre «Imprimir presupuesto» de la
// ficha, en otra pestaña.

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { monedaVista } from "@/lib/moneda";
import { motivoErp } from "@/lib/erp/base";
import { pdfPresupuesto } from "@/lib/pedidos/presupuesto-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) return texto("Tenés que entrar a Laucen para ver el presupuesto.", 401);
  if (!tienePermiso(sesion.permisos, "pedidos_ver")) return texto("No tenés permiso para ver pedidos.", 403);
  const pid = Number((await params).id);
  if (!Number.isInteger(pid) || pid <= 0) return texto("Ese presupuesto no existe.", 404);
  try {
    const moneda = await monedaVista(sesion.usuario.id, sesion.org.id).catch(() => "ARS" as const);
    const { pdf, nombre } = await pdfPresupuesto(sesion.org.id, pid, moneda);
    return new Response(Buffer.from(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${nombre}"`, "cache-control": "no-store" },
    });
  } catch (e) {
    return texto(motivoErp(e), 400);
  }
}
