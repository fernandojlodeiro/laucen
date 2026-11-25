// Libro de IVA al Drive, cada noche a las 3 de la mañana (hora argentina; 6:00 UTC en vercel.json): el día 1 sube el
// libro entero del mes que terminó y, todas las noches, las compras de los meses sin liquidar que cambiaron
// (lib/administracion/libro-iva-drive.ts). Si CRON_SECRET está cargada en Vercel, se exige.

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { vueltaLibrosIva } from "@/lib/administracion/libro-iva-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("no autorizado", { status: 401 });
  }
  await asegurarEsquemaErp();
  const hecho = await vueltaLibrosIva();
  return Response.json({ ok: true, hecho });
}
