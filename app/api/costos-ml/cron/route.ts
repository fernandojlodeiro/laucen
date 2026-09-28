// Costos de vender en Mercado Libre (lib/costos-ml/proceso.ts).
//
// - Vercel Cron (vercel.json), una vez por día: crea la corrida del día y la
//   avanza. Si CRON_SECRET está cargada en Vercel, se exige (como en el Radar).
// - pg_cron + pg_net cada 5 minutos, con ?clave= (tabla ml_costos_llave): sólo
//   sigue la corrida que haya quedado sin terminar. No crea corridas.

import { pool } from "@/db";
import { asegurarEsquema } from "@/lib/costos-ml/esquema";
import { avanzar, iniciarHoy } from "@/lib/costos-ml/proceso";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const t0 = Date.now();
  await asegurarEsquema();
  const clave = new URL(req.url).searchParams.get("clave");
  if (clave) {
    const ok = await pool.query("select 1 from ml_costos_llave where clave = $1", [clave]);
    if (!ok.rowCount) return new Response("No", { status: 403 });
  } else {
    const secreto = process.env.CRON_SECRET;
    if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`) {
      return new Response("no autorizado", { status: 401 });
    }
    await iniciarHoy();
  }
  const resultado = await avanzar(t0 + 270_000);
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), resultado });
}
