// Tareas periódicas del ERP: pg_cron de Supabase lo revisa cada 2 minutos pero
// sólo lo llama (?clave=, tabla erp_llave) si hay algo pendiente de verdad, y
// como red de seguridad cada media hora (Fer, 3/10). Hoy: facturación automática (pedidos que
// llegaron al estado elegido) y reintento de comprobantes con error; ventas
// facturadas a cuenta corriente; asientos contables que falten; e
// importaciones que siguen solas en segundo plano; la cola de salida a
// Mercado Libre (lib/mercadolibre/cola.ts) y, de 2 a 5, la barrida nocturna.

import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { facturarPendientes } from "@/lib/arca/facturar";
import { sincronizarVentasCc } from "@/lib/administracion/cc";
import { contabilizarPendientes } from "@/lib/administracion/contabilidad";
import { ejecutarImportacion } from "@/lib/importar/ejecutar";
import { avanzar as avanzarVs } from "@/lib/importar/virtualseller";
import { procesarCola, hayPendientes } from "@/lib/mercadolibre/cola";
import { procesarCambiosStock, sincronizarStockMl, variacionesConEventos } from "@/lib/mercadolibre/stock";
import { barridaNocturna, enVentanaBarrida } from "@/lib/mercadolibre/barrida";

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
    if (Date.now() - t0 > 40_000) break;
    const r: Record<string, unknown> = (informe[organizacion_id] as Record<string, unknown>) ?? {};
    try {
      r.cuenta_corriente = await sincronizarVentasCc(organizacion_id);
      r.contabilidad = await contabilizarPendientes(organizacion_id, t0 + 40_000);
    } catch (e) {
      r.error_administracion = e instanceof Error ? e.message : String(e);
    }
    informe[organizacion_id] = r;
  }
  // Importaciones en segundo plano: después de contestar (con after), así
  // pg_net no queda esperando ~100 s y no frena las otras llamadas de la base
  // (el barrido de Mercado Libre usa la misma cola).
  const imps = (await pool.query<{ id: number; organizacion_id: string; usuario_id: string | null }>(
    "select id::int, organizacion_id, usuario_id from importacion where segundo_plano and estado = 'ejecutando' order by id")).rows;
  const vs = (await pool.query<{ id: number; organizacion_id: string }>(
    "select id::int, organizacion_id from importacion_vs where estado in ('cargando', 'importando') or coalesce((resumen ->> 'iva_en_curso')::boolean, false) order by id")).rows;
  // Stock que cruzó el umbral (eventos de mover_stock): se encola enseguida
  // la pausa de esas publicaciones, sin esperar al barrido de media hora.
  const conEventos = (await pool.query<{ organizacion_id: string }>(`
    select distinct organizacion_id from evento where tipo = 'stock_bajo_umbral' and procesado_ts is null`)).rows;
  for (const { organizacion_id } of conEventos) {
    try {
      const vars = await variacionesConEventos(organizacion_id);
      if (vars.length) informe[`stock_${organizacion_id}`] = await sincronizarStockMl(organizacion_id, vars, t0 + 50_000);
    } catch (e) {
      informe[`stock_${organizacion_id}_error`] = e instanceof Error ? e.message : String(e);
    }
  }
  // Cambios de stock que no se avisaron al instante (falló la llamada de
  // pg_net a /api/erp/stock; ver db/stock.sql): lo mismo que haría esa ruta.
  try {
    const cambios = await procesarCambiosStock();
    if (cambios.variaciones) informe.cambios_stock = cambios;
    for (const canal of cambios.tiendas) revalidateTag(`tienda-${canal}`);
  } catch (e) {
    informe.cambios_stock_error = e instanceof Error ? e.message : String(e);
  }
  // Mercado Libre: la cola de salida (hasta ~45 s) y, de noche, la barrida.
  // Van en paralelo con las importaciones: son pedidos a ML, no a la base.
  const cola = await hayPendientes();
  const barrida = enVentanaBarrida() && !!(await pool.query(
    "select 1 from canal where tipo = 'mercadolibre' and estado = 'activo' and coalesce((config ->> 'sincronizar_stock')::boolean, false) limit 1")).rowCount;
  if (imps.length || vs.length) {
    informe.importaciones = imps.map((i) => i.id);
    informe.importaciones_vs = vs.map((i) => i.id);
  }
  if (cola) informe.cola_ml = true;
  if (barrida) informe.barrida_ml = true;
  if (imps.length || vs.length || cola || barrida) {
    after(async () => {
      await Promise.all([
        (async () => {
          try {
            if (cola) console.log("[tareas] cola ML", JSON.stringify(await procesarCola(t0 + 45_000)));
            if (barrida) {
              console.log("[tareas] barrida ML", JSON.stringify(await barridaNocturna(t0 + 100_000)));
              // Lo que encoló la barrida sale enseguida.
              if (t0 + 108_000 - Date.now() > 10_000) await procesarCola(t0 + 108_000);
            }
          } catch (e) {
            console.error("[tareas] Mercado Libre", e instanceof Error ? e.message : e);
          }
        })(),
        (async () => {
          for (const i of vs) {
            if (t0 + 105_000 - Date.now() < 10_000) break;
            await avanzarVs(i.organizacion_id, i.id, t0 + 105_000);
          }
          for (const i of imps) {
            const resto = t0 + 105_000 - Date.now();
            if (resto < 10_000) break;
            try {
              const r = await ejecutarImportacion(i.organizacion_id, i.id, i.usuario_id ?? "sistema", resto);
              if (!r.pendientes) await pool.query("update importacion set segundo_plano = false where id = $1", [i.id]);
            } catch (e) {
              // "Ya se está ejecutando": la está procesando la pantalla; la próxima vuelta sigue.
              console.error("[tareas] importación", i.id, e instanceof Error ? e.message : e);
            }
          }
        })(),
      ]);
    });
  }
  return Response.json({ ok: true, segundos: Math.round((Date.now() - t0) / 1000), informe });
}
