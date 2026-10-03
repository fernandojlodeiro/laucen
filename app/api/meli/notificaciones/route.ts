// Receptor de notificaciones (tópicos) de Mercado Libre. ML exige un 200
// rápido (si no, reintenta y después deja de avisar): se guarda la
// notificación tal cual y se contesta; el trabajo se hace enseguida, después
// de contestar (`after`), y si falla lo retoma el barrido de cada 30 minutos.

import { after } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { guardarNotificacion, procesarNotificaciones, type Notificacion } from "@/lib/mercadolibre/procesar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let n: Notificacion | null = null;
  try { n = await req.json(); } catch { /* cuerpo vacío o roto: igual 200 */ }
  if (n) {
    try {
      await asegurarEsquemaErp();
      const id = await guardarNotificacion(n);
      if (id) after(() => procesarNotificaciones(Date.now() + 50_000, id).then(() => undefined).catch((e) => console.error("[meli] notificación", e)));
    } catch (e) {
      console.error("[meli] no se pudo guardar la notificación", e);
    }
  }
  return new Response(null, { status: 200 });
}

export async function GET() {
  return new Response("ok", { status: 200 });
}
