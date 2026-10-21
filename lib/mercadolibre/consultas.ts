// Consultas de sólo lectura a la API de ML pedidas por una sesión (db/mercadolibre.sql, ml_consulta):
// el proceso de fondo (/api/erp/tareas) hace cada GET con la llave de la cuenta y guarda status y
// respuesta. Sólo GET y rutas relativas: nunca cambia nada en Mercado Libre.

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";

/** La respuesta guardada, como mucho de este tamaño (en caracteres de JSON). */
const MAXIMO = 400_000;

export async function hayConsultasPendientes(): Promise<boolean> {
  return !!(await una("select 1 from ml_consulta where estado = 'pendiente' limit 1"));
}

/** Una ruta que se puede pedir: relativa a la API, sin otro host ni saltos de línea. */
export const rutaValida = (r: string) => /^\/[^/\s]/.test(r) && !/[\r\n]/.test(r) && !r.includes("://");

export async function responderConsultas(hastaMs: number): Promise<{ respondidas: number; errores: number }> {
  const out = { respondidas: 0, errores: 0 };
  const pendientes = await consulta<{ id: number; organizacion_id: string; canal_id: number; ruta: string }>(
    "select id::int, organizacion_id, canal_id::int, ruta from ml_consulta where estado = 'pendiente' order by id limit 30");
  for (const p of pendientes) {
    if (Date.now() > hastaMs) break;
    const cuenta = rutaValida(p.ruta) ? await cuentaDelCanal(p.organizacion_id, p.canal_id) : null;
    const r = cuenta ? await ml(cuenta, "GET", p.ruta) : { status: 0, datos: { message: cuenta === null && rutaValida(p.ruta) ? "esa cuenta no está conectada" : "ruta no válida" } };
    let texto = JSON.stringify(r.datos ?? null);
    if (texto.length > MAXIMO) texto = JSON.stringify({ recortada: true, inicio: texto.slice(0, MAXIMO) });
    const ok = r.status >= 200 && r.status < 300;
    await consulta("update ml_consulta set estado = $2, status = $3, respuesta = $4::jsonb, respondida_ts = now() where id = $1",
      [p.id, ok ? "respondida" : "error", r.status, texto]);
    if (ok) out.respondidas++; else out.errores++;
  }
  return out;
}
