// Receptor de notificaciones (tópicos) de Mercado Libre. ML exige un 200
// rápido: se guarda la notificación tal cual y se contesta; el trabajo se hace
// después de contestar (`after`), en fila dentro de esta función
// (lib/mercadolibre/receptor.ts), y lo que no se alcance lo retoma el barrido
// de cada 30 minutos.
//
// Si NO se pudo guardar (la base no contesta), se contesta 503: así ML la
// vuelve a mandar en un rato en vez de darla por entregada y perderla
// (bitácora #1009). Un cuerpo vacío o roto, 200 (no hay nada que reintentar).

import { after } from "next/server";
import { procesarRecibidas, recibirNotificacion } from "@/lib/mercadolibre/receptor";
import type { Notificacion } from "@/lib/mercadolibre/procesar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let n: Notificacion | null = null;
  try { n = await req.json(); } catch { /* cuerpo vacío o roto: igual 200 */ }
  if (n && n.topic && n.resource) {
    try {
      await recibirNotificacion(n);
    } catch (e) {
      console.error("[meli] no se pudo guardar la notificación (ML la reintenta)", e instanceof Error ? e.message : e);
      return new Response(null, { status: 503 });
    }
    after(() => procesarRecibidas());
  }
  return new Response(null, { status: 200 });
}

export async function GET() {
  return new Response("ok", { status: 200 });
}
