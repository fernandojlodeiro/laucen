// El «sello» de un reclamo (Fer, 29/10): cambia cuando entra un mensaje o se actualiza el reclamo. La ficha lo pregunta
// cada pocos segundos (RefrescoReclamo) y, si cambió, se vuelve a dibujar sola: la respuesta del comprador o de Mercado
// Libre aparece sin recargar, como en un chat. Los mensajes llegan solos por la notificación de ML (lib/mercadolibre/reclamos.ts).

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { una } from "@/lib/erp/base";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionActual();
  if (!s || !tienePermiso(s.permisos, "reclamos_ver")) return Response.json({ sello: null }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ sello: null }, { status: 400 });
  const r = await una<{ sello: string | null }>(`
    select r.actualizado_ts::text || '|' || coalesce((select max(m.id)::text from reclamo_mensaje m where m.reclamo_id = r.id), '0') sello
      from reclamo r where r.id = $1 and r.organizacion_id = $2`, [id, s.org.id]);
  return Response.json({ sello: r?.sello ?? null }, { headers: { "cache-control": "no-store" } });
}
