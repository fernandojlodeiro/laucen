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
  // Hasta 4 pilotos a la vez (Fer, 28/9: comparar las cuatro IAs en paralelo).
  const r = await pool.query<{ id: number; organizacion_id: string }>(
    "select id, organizacion_id from piloto_corridas where automatico and estado <> 'listo' order by id limit 4");
  if (!r.rows.length) return Response.json({ nada: true });
  const hasta = Date.now() + 270_000;
  const res = await Promise.all(r.rows.map(async (c) => {
    try {
      return { piloto: c.id, ...(await avanzar(c.id, c.organizacion_id, hasta)) };
    } catch (e) {
      console.error("[piloto] tanda automática:", c.id, e);
      return { piloto: c.id, error: true };
    }
  }));
  return Response.json(res);
}
