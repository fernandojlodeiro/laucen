// Exportación de Mercado Pago (lib/mercadopago/exportacion.ts). La llama la base
// (pg_net) con ?clave= (tabla erp_llave): por ahora sólo el inventario de las
// cuentas conectadas (?accion=sonda), que sólo lee de Mercado Pago.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { sondearTodas } from "@/lib/mercadopago/exportacion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const q = new URL(req.url).searchParams;
  const clave = q.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  if (q.get("accion") === "sonda") return Response.json(await sondearTodas(q.get("org") ?? undefined));
  return new Response("Acción desconocida", { status: 400 });
}
