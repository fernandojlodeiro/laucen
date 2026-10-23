// El PDF del despacho, para verlo (o bajarlo con ?bajar=1).

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";
import { respuestaPdf, textoPlano } from "@/lib/compras/archivo-pdf";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) return textoPlano("Tenés que entrar a Laucen para ver el despacho.", 401);
  if (!tienePermiso(sesion.permisos, "despachos_ver")) return textoPlano("No tenés permiso para ver despachos.", 403);
  const id = Number((await params).id);
  const d = Number.isInteger(id) && id > 0
    ? await una<{ archivo: string | null; numero: string | null }>("select archivo, numero from despacho_importacion where id = $1 and organizacion_id = $2", [id, sesion.org.id]) : null;
  if (!d) return textoPlano("Ese despacho no existe.", 404);
  return respuestaPdf(sesion.org.id, d.archivo, `despacho-${d.numero ?? id}.pdf`, new URL(req.url).searchParams.get("bajar") === "1");
}
