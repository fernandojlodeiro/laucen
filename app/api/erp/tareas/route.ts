// Tareas periódicas del ERP: lo llama pg_cron de Supabase cada 2 minutos con
// ?clave= (tabla erp_llave). Hoy: facturación automática (pedidos que
// llegaron al estado elegido) y reintento de comprobantes con error.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { facturarPendientes } from "@/lib/arca/facturar";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  const informe: Record<string, unknown> = {};
  const orgs = (await pool.query<{ organizacion_id: string }>("select organizacion_id from emisor")).rows;
  for (const { organizacion_id } of orgs) {
    if (Date.now() - t0 > 100_000) break;
    informe[organizacion_id] = await facturarPendientes(organizacion_id, t0 + 100_000);
  }
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
