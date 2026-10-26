// «Leer Drive» de los banners para todas las tiendas que tienen carpeta cargada (lib/tienda/banners-drive.ts), con la
// clave de erp_llave: para correrlo desde la base sin entrar al panel.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { leerBannersDelDrive } from "@/lib/tienda/banners-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const tiendas = (await pool.query<{ org: string; canal: number }>("select distinct organizacion_id org, canal_id::int canal from tienda_banner_drive")).rows;
  const out = [];
  for (const t of tiendas) out.push({ canal: t.canal, ...(await leerBannersDelDrive(t.org, t.canal).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))) });
  return Response.json(out);
}
