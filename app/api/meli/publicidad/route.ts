// Publicidad en Mercado Libre (orden 596; lib/publicidad/): lo llama pg_cron de Supabase cada hora (job
// 'meli-publicidad') con ?clave= (tabla meli_llave). Por organización, si pasaron las horas de la config, lee la
// publicidad de cada cuenta (sólo lectura), recalcula el veredicto de cada producto y avisa lo que pasó a CORTAR.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { leerPublicidad, tocaLeer } from "@/lib/publicidad/lectura";
import { guardarYAvisar } from "@/lib/publicidad/avisos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from meli_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  const orgs = (await pool.query<{ organizacion_id: string }>(
    "select distinct organizacion_id from meli_cuenta where estado = 'activa' and canal_id is not null")).rows.map((r) => r.organizacion_id);
  const informe: Record<string, unknown> = {};
  for (const org of orgs) {
    try {
      if (!(await tocaLeer(org))) { informe[org] = "no toca"; continue; }
      const l = await leerPublicidad(org, t0 + 250_000);
      informe[org] = { lectura: l, veredictos: await guardarYAvisar(org) };
    } catch (e) {
      informe[org] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  console.log("[publicidad]", JSON.stringify(informe).slice(0, 2000));
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
