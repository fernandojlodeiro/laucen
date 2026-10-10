// Barrido de Mercado Libre (lib/mercadolibre/procesar.ts): lo llama pg_cron
// de Supabase cada 30 minutos (red de seguridad: los avisos se procesan al
// llegar) con ?clave= (tabla meli_llave). Procesa las
// notificaciones que hayan quedado, trae órdenes y preguntas perdidas y
// encola los ajustes de stock; después de contestar, manda lo que haya en la
// cola de ML (también la manda /api/erp/tareas; el turno por canal evita que
// se pisen). En paralelo, los precios de ML (lib/precios-ml/): las lecturas
// de precio para ganar y campañas (sólo lectura) y, en los canales con
// "Sincronizar precios" prendido, lo automático (precios que cambiaron y una
// pasada entera por noche). Y el seguimiento de los envíos de OCA (lib/oca/envios.ts) y los pedidos
// sin pagar cuya reserva de stock venció (lib/pedidos/reserva.ts).

import { after } from "next/server";
import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { barrido } from "@/lib/mercadolibre/procesar";
import { procesarCola } from "@/lib/mercadolibre/cola";
import { leerPreciosMl } from "@/lib/precios-ml/lectura";
import { vueltaAutomatica } from "@/lib/precios-ml/preparar";
import { barrerOca } from "@/lib/oca/envios";
import { vencerReservas } from "@/lib/pedidos/reserva";

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
    await Promise.all([
      (async () => {
        try {
          const resto = t0 + 110_000 - Date.now();
          if (resto > 10_000) console.log("[meli] cola", JSON.stringify(await procesarCola(t0 + 110_000)));
        } catch (e) {
          console.error("[meli] cola", e instanceof Error ? e.message : e);
        }
      })(),
      (async () => {
        try {
          const auto = await vueltaAutomatica();
          if (Object.keys(auto).length) console.log("[meli] precios automáticos", JSON.stringify(auto));
          // Una vez por día: envío gratis puesto en publicaciones más baratas que el umbral (lib/precios-ml/envio-gratis.ts).
          try {
            const eg = await (await import("@/lib/precios-ml/envio-gratis")).revisarEnvioGratis();
            if (Object.keys(eg).length) console.log("[meli] envío gratis de más", JSON.stringify(eg));
          } catch (e) {
            console.error("[meli] envío gratis", e instanceof Error ? e.message : e);
          }
          if (t0 + 105_000 - Date.now() > 10_000) console.log("[meli] lecturas de precios", JSON.stringify(await leerPreciosMl(t0 + 105_000, { tanda: 1000 })));
        } catch (e) {
          console.error("[meli] precios", e instanceof Error ? e.message : e);
        }
      })(),
      (async () => {
        try {
          const r = await barrerOca(t0 + 110_000);
          if (r.revisados) console.log("[oca] seguimiento", JSON.stringify(r));
        } catch (e) {
          console.error("[oca] seguimiento", e instanceof Error ? e.message : e);
        }
      })(),
      (async () => {
        try {
          const r = await vencerReservas(t0 + 110_000);
          if (r.cancelados.length) console.log("[pedidos] reservas vencidas", JSON.stringify(r));
        } catch (e) {
          console.error("[pedidos] reservas vencidas", e instanceof Error ? e.message : e);
        }
      })(),
    ]);
  });
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
