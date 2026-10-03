// /ventas/reclamos/ml/<claim_id de ML> → la ficha del reclamo en Laucen
// (lo usa la cola de Mercado Libre para enlazar sus acciones).

import { notFound, redirect } from "next/navigation";
import { una } from "@/lib/erp/base";
import { entrarErp } from "@/app/componentes/erp";

export const dynamic = "force-dynamic";

export default async function ReclamoPorIdMl({ params }: { params: Promise<{ claim: string }> }) {
  const s = await entrarErp("reclamos_ver");
  const claim = (await params).claim;
  if (!/^\d{1,30}$/.test(claim)) notFound();
  const r = await una<{ id: number }>("select id::int from reclamo where organizacion_id = $1 and origen = 'mercadolibre' and id_externo = $2", [s.org.id, claim]);
  if (!r) notFound();
  redirect(`/ventas/reclamos/${r.id}`);
}
