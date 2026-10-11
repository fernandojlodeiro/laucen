// Creación automática de lo que falta en cada cuenta de ML (lib/mercadolibre/auto-altas.ts): lo llama
// pg_cron de Supabase cada 10 minutos con ?clave= (tabla meli_llave), sólo si alguna cuenta tiene
// prendido «Crear solo lo que falta». Al terminar, manda lo que haya en la cola.

import { after } from "next/server";
import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { correrAutoAltas } from "@/lib/mercadolibre/auto-altas";
import { procesarCola } from "@/lib/mercadolibre/cola";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from meli_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  const informe = await correrAutoAltas(t0 + 230_000);
  console.log("[auto-altas]", JSON.stringify(informe));
  after(async () => {
    try {
      const resto = t0 + 290_000 - Date.now();
      if (resto > 15_000) console.log("[auto-altas] cola", JSON.stringify(await procesarCola(t0 + 290_000)));
    } catch (e) {
      console.error("[auto-altas] cola", e instanceof Error ? e.message : e);
    }
  });
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
