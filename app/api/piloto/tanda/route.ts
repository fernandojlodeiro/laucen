// Tanda automática del piloto: la llama la base (pg_cron + pg_net) cada 5
// minutos, así un piloto marcado "automático" avanza solo, sin la página
// abierta. Pública pero con clave (tabla piloto_llave).

import { pool } from "@/db";
import { asegurarEsquema } from "@/lib/piloto/esquema";
import { avanzar } from "@/lib/piloto/proceso";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const clave = new URL(req.url).searchParams.get("clave") ?? "";
  await asegurarEsquema();
  const ok = await pool.query("select 1 from piloto_llave where clave = $1", [clave]);
  if (!clave || !ok.rowCount) return new Response("No", { status: 403 });
  const r = await pool.query<{ id: number; organizacion_id: string }>(
    "select id, organizacion_id from piloto_corridas where automatico and estado <> 'listo' order by id limit 1");
  const c = r.rows[0];
  if (!c) return Response.json({ nada: true });
  try {
    const res = await avanzar(c.id, c.organizacion_id, Date.now() + 270_000);
    return Response.json({ piloto: c.id, ...res });
  } catch (e) {
    console.error("[piloto] tanda automática:", e);
    return Response.json({ piloto: c.id, error: true }, { status: 500 });
  }
}
