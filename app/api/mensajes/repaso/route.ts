// El repaso de los chats que quedaron sin contestar (lib/mensajes/repaso.ts). Lo llama pg_cron cada minuto (job
// 'mensajes-repaso', db/mensajes.sql) sólo si hay alguno, con la clave de erp_llave.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { repasarSinContestar } from "@/lib/mensajes/repaso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  return Response.json(await repasarSinContestar(Date.now() + 40_000));
}
