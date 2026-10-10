// Los avisos de Windows (lib/avisos-push.ts): lo llama cada minuto el job de
// pg_cron 'avisos-push' (db/moneda.sql), sólo si hay algo reciente que la IA no
// contestó y alguien los activó. Se autentica con ?clave= (tabla erp_llave).

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { vueltaPush } from "@/lib/avisos-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  return Response.json(await vueltaPush());
}
