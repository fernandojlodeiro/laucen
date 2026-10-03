// Barrido de Mercado Libre (lib/mercadolibre/procesar.ts): lo llama pg_cron
// de Supabase cada 30 minutos (red de seguridad: los avisos se procesan al
// llegar) con ?clave= (tabla meli_llave). Procesa las
// notificaciones que hayan quedado, trae órdenes y preguntas perdidas y
// encola los ajustes de stock; después de contestar, manda lo que haya en la
// cola de ML (también la manda /api/erp/tareas; el turno por canal evita que
// se pisen).

import { after } from "next/server";
import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { barrido } from "@/lib/mercadolibre/procesar";
import { procesarCola } from "@/lib/mercadolibre/cola";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from meli_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  const informe = await barrido(t0 + 80_000);
  after(async () => {
    try {
      const resto = t0 + 110_000 - Date.now();
      if (resto > 10_000) console.log("[meli] cola", JSON.stringify(await procesarCola(t0 + 110_000)));
    } catch (e) {
      console.error("[meli] cola", e instanceof Error ? e.message : e);
    }
  });
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
