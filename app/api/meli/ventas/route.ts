// Ventas de Mercado Libre de los últimos 12 meses (lib/mercadolibre/ventas.ts): lo llama pg_cron de Supabase cada
// 2 minutos (job 'meli-ventas') con ?clave= (tabla meli_llave) mientras haya una carga sin terminar. Sólo lee de ML
// y escribe ml_venta: nunca crea pedidos.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { cargarHistoria } from "@/lib/mercadolibre/ventas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from meli_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  const orgs = (await pool.query<{ organizacion_id: string }>(
    "select distinct organizacion_id from ml_venta_carga where terminada_ts is null")).rows.map((r) => r.organizacion_id);
  const informe: Record<string, unknown> = {};
  for (const org of orgs) {
    try {
      informe[org] = await cargarHistoria(org, t0 + 240_000);
    } catch (e) {
      informe[org] = { error: e instanceof Error ? e.message : String(e) };
    }
    if (Date.now() > t0 + 240_000) break;
  }
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
