// Los avisos de cambio de estado de los pedidos de la tienda (correo_cola, lib/correo/mails.ts).
// Lo llama pg_cron cada minuto (job 'correo-cola', db/correo.sql) sólo si hay algo en la cola, con la clave de erp_llave.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { procesarCola } from "@/lib/correo/mails";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  return Response.json(await procesarCola(null, Date.now() + 45_000));
}
