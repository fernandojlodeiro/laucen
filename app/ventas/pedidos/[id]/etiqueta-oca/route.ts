// La etiqueta de OCA de un pedido, en PDF (la baja de OCA en el momento).
// La abre el botón «Etiqueta de OCA» de la ficha del pedido, en otra pestaña.

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { consulta } from "@/lib/erp/base";
import { envioOcaDe, etiquetaOca } from "@/lib/oca/envios";

export const dynamic = "force-dynamic";

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) return texto("Tenés que entrar a Laucen para imprimir.", 401);
  if (!tienePermiso(sesion.permisos, "pedidos_ver")) return texto("No tenés permiso para ver pedidos.", 403);
  const pid = Number((await params).id);
  if (!Number.isInteger(pid) || pid <= 0) return texto("Ese pedido no existe.", 404);
  const e = await envioOcaDe(sesion.org.id, pid);
  if (!e) return texto("Este pedido no tiene un envío de OCA.", 404);
  const r = await etiquetaOca(sesion.org.id, e.id);
  if (!r.ok) return texto(r.motivo, 502);
  await consulta("update envio set etiqueta_impresa_ts = coalesce(etiqueta_impresa_ts, now()) where id = $1", [e.id]);
  return new Response(Buffer.from(r.pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="oca-pedido-${pid}.pdf"`, "cache-control": "no-store" },
  });
}
