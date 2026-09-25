// Disparador diario del Radar (Vercel Cron, ver vercel.json). Qué corre cada
// día lo decide la configuración de cada organización (lib/radar/procesos.ts).
//
// Si CRON_SECRET está cargada en Vercel, Vercel la manda y se exige. Sin ella
// la ruta queda abierta, pero es inofensiva: sólo hace lo que ya toca según la
// configuración, no repite nada de la semana, y Apify tiene tope de gasto.

import { asegurarEsquema } from "@/lib/radar/esquema";
import { correrCron } from "@/lib/radar/procesos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("no autorizado", { status: 401 });
  }
  const t0 = Date.now();
  await asegurarEsquema();
  const resumen = await correrCron(t0 + 270_000);
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), resumen });
}
