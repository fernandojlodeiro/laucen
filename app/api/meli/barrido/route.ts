// Barrido de Mercado Libre (lib/mercadolibre/procesar.ts): lo llama pg_cron
// de Supabase cada 2 minutos con ?clave= (tabla meli_llave). Procesa las
// notificaciones que hayan quedado, trae órdenes y preguntas perdidas y
// ajusta el stock en ML.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { barrido } from "@/lib/mercadolibre/procesar";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from meli_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  const informe = await barrido(t0 + 100_000);
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
