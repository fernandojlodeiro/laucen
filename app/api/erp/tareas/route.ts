// Tareas periódicas del ERP: lo llama pg_cron de Supabase cada 2 minutos con
// ?clave= (tabla erp_llave). Hoy: facturación automática (pedidos que
// llegaron al estado elegido) y reintento de comprobantes con error; ventas
// facturadas a cuenta corriente; asientos contables que falten.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { facturarPendientes } from "@/lib/arca/facturar";
import { sincronizarVentasCc } from "@/lib/administracion/cc";
import { contabilizarPendientes } from "@/lib/administracion/contabilidad";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const clave = new URL(req.url).searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const t0 = Date.now();
  const informe: Record<string, unknown> = {};
  const orgs = (await pool.query<{ organizacion_id: string }>("select organizacion_id from emisor")).rows;
  for (const { organizacion_id } of orgs) {
    if (Date.now() - t0 > 60_000) break;
    informe[organizacion_id] = { facturacion: await facturarPendientes(organizacion_id, t0 + 60_000) };
  }
  // Administración: sólo las organizaciones que ya usan algo de ella (o facturan).
  const adm = (await pool.query<{ organizacion_id: string }>(`
    select organizacion_id from emisor union select organizacion_id from plan_cuenta
     union select organizacion_id from cuenta_fondos union select organizacion_id from factura_compra`)).rows;
  for (const { organizacion_id } of adm) {
    if (Date.now() - t0 > 100_000) break;
    const r: Record<string, unknown> = (informe[organizacion_id] as Record<string, unknown>) ?? {};
    try {
      r.cuenta_corriente = await sincronizarVentasCc(organizacion_id);
      r.contabilidad = await contabilizarPendientes(organizacion_id, t0 + 100_000);
    } catch (e) {
      r.error_administracion = e instanceof Error ? e.message : String(e);
    }
    informe[organizacion_id] = r;
  }
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
