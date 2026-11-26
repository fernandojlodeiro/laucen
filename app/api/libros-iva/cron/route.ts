// La vuelta del Libro de IVA al Drive a pedido (lib/administracion/libro-iva-drive.ts), con la clave de las tareas
// (?clave=, tabla erp_llave). La de cada noche la corre /api/erp/tareas, entre las 3 y las 5 (hora argentina).

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { vueltaLibrosIva } from "@/lib/administracion/libro-iva-drive";
import { pool } from "@/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const hecho = await vueltaLibrosIva();
  return Response.json({ ok: true, hecho });
}
