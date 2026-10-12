// Creación automática de lo que falta en cada cuenta de ML (lib/mercadolibre/auto-altas.ts): lo llama
// pg_cron de Supabase cada 10 minutos con ?clave= (tabla meli_llave), sólo si alguna cuenta tiene
// prendido «Crear solo lo que falta». Al terminar, manda lo que haya en la cola.

import { after } from "next/server";
import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { correrAutoAltas } from "@/lib/mercadolibre/auto-altas";
import { cerrarCatalogosVetados, correrBorrarCerradas, correrRehacer } from "@/lib/mercadolibre/rehacer-esquema";
import { procesarCola } from "@/lib/mercadolibre/cola";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from meli_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  // Pasar cuentas al esquema nuevo (rehacer-esquema.ts): antes de crear, así lo que se crea ya sale con él.
  const rehacer = await correrRehacer().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  if (Object.keys(rehacer).length) console.log("[rehacer]", JSON.stringify(rehacer));
  const vetados = await cerrarCatalogosVetados().catch(() => 0);
  if (vetados) console.log("[catálogos vedados] a cerrar", vetados);
  const borrar = await correrBorrarCerradas(t0 + 60_000).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  if (Object.keys(borrar).length) console.log("[borrar cerradas]", JSON.stringify(borrar));
  // Lo que cobra ML en las ofertas relámpago propuestas (lib/precios-ml/relampago.ts; sólo lectura): hasta 25 segundos.
  const rel = await import("@/lib/precios-ml/relampago");
  const costos = await rel.actualizarCostosRelampago(Date.now() + 25_000).catch(() => 0);
  if (costos) console.log("[relámpago] costos leídos", costos);
  // Cuándo corren las aceptadas (día y hora los pone ML): hasta 10 segundos.
  const fechas = await rel.actualizarFechasRelampago(Date.now() + 10_000).catch(() => 0);
  if (fechas) console.log("[relámpago] fechas leídas", fechas);
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
