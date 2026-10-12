// Catálogo con nuestra marca (lib/mercadolibre/catalogo-propio.ts): lo llama pg_cron de Supabase cada 30 minutos con
// ?clave= (tabla meli_llave), sólo hace algo en las cuentas con «Catálogo con nuestra marca» prendido. Al terminar,
// manda lo que haya en la cola.

import { after } from "next/server";
import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { correrCatalogoPropio } from "@/lib/mercadolibre/catalogo-propio";
import { procesarCola } from "@/lib/mercadolibre/cola";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from meli_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  const informe = await correrCatalogoPropio(t0 + 230_000);
  console.log("[catalogo-propio]", JSON.stringify(informe));
  after(async () => {
    try {
      if (t0 + 290_000 - Date.now() > 15_000) await procesarCola(t0 + 290_000);
    } catch (e) {
      console.error("[catalogo-propio] cola", e instanceof Error ? e.message : e);
    }
  });
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
