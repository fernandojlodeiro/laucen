// Resumen de la vista previa de Precios en ML de una cuenta (sólo lectura), para que una sesión compare qué cambiaría
// antes y después de tocar el esquema sin abrir la pantalla. Con ?clave= (tabla meli_llave) y ?canal=.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { filasPrevia, limpiarCachePrevia } from "@/app/catalogo/precios-ml/lista";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const u = new URL(req.url);
  const clave = u.searchParams.get("clave");
  const ok = clave ? await pool.query("select 1 from meli_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const canal = Number(u.searchParams.get("canal"));
  const org = (await pool.query<{ organizacion_id: string }>("select organizacion_id from canal where id = $1", [canal])).rows[0]?.organizacion_id;
  if (!org) return new Response("Canal desconocido", { status: 404 });
  limpiarCachePrevia();
  const filas = await filasPrevia(org, { canal: String(canal), cambios: "0" });
  const conCambio = filas.filter((f) => f.hay_cambio);
  return Response.json({
    canal, filas: filas.length, conCambio: conCambio.length, nuevas: filas.filter((f) => f.rol === "nueva").length,
    cambios: conCambio.map((f) => ({ sku: f.sku, item: f.item_id, plan: f.plan, lista: f.lista, venta: f.venta, precioMl: f.precio_ml, ventaMl: f.venta_ml, cambio: f.cambio, avisos: f.avisos })),
    todas: u.searchParams.get("todas") === "1" ? filas.filter((f) => f.item_id).map((f) => ({ sku: f.sku, item: f.item_id, plan: f.plan, lista: f.lista, venta: f.venta, precioMl: f.precio_ml, ventaMl: f.venta_ml })) : undefined,
  });
}
