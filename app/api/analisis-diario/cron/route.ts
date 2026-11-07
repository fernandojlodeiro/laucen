// Disparador diario del análisis de campañas, publicidad y visitas (Vercel Cron, ver vercel.json: 12 UTC = 9 hora
// argentina). Lo que hace: lib/analisis-diario/correr.ts. Sólo lee y avisa; nada sale a Mercado Libre.
//
// Si CRON_SECRET está cargada en Vercel, Vercel la manda y se exige (como el cron del Radar). Sin ella la ruta queda
// abierta, pero no repite: una organización que ya tiene el análisis de hoy no se vuelve a analizar (cada corrida usa la IA).

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { pool } from "@/db";
import { correrAnalisis, organizacionesAnalisis } from "@/lib/analisis-diario/correr";
import { hoyAr } from "@/lib/analisis-diario/calcular";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("no autorizado", { status: 401 });
  }
  const t0 = Date.now();
  await asegurarEsquemaErp();
  const informe: Record<string, unknown> = {};
  for (const org of await organizacionesAnalisis()) {
    if (Date.now() - t0 > 240_000) { informe[org] = "sin tiempo"; continue; }
    const ya = await pool.query("select 1 from analisis_diario where organizacion_id = $1 and fecha = $2::date", [org, hoyAr()]);
    if (ya.rowCount) { informe[org] = "ya estaba"; continue; }
    informe[org] = await correrAnalisis(org).catch((e) => {
      console.error("[analisis diario]", org, e);
      return { error: e instanceof Error ? e.message : String(e) };
    });
  }
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
