// Cambios de stock al instante (Fer, 3/10): la base llama acá con pg_net cada
// vez que una transacción cambia el stock de una organización que sincroniza
// con Mercado Libre o tiene tienda web (mecanismo completo en db/stock.sql).
// Toma las variaciones anotadas en stock_cambio_pendiente, encola en ML la
// cantidad nueva de cada publicación vinculada (el trabajador de la cola sale
// enseguida, después de contestar) e invalida la copia del catálogo de las
// tiendas. Si esta llamada se pierde, lo levanta /api/erp/tareas.

import { revalidateTag } from "next/cache";
import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { procesarCambiosStock } from "@/lib/mercadolibre/stock";

export const dynamic = "force-dynamic";
// La cola de ML sigue mandando hasta ~45 s después de contestar (after).
export const maxDuration = 60;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  const r = await procesarCambiosStock();
  for (const canal of r.tiendas) revalidateTag(`tienda-${canal}`);
  return Response.json({ ok: true, ms: Date.now() - t0, ...r });
}
