// "Descargar Excel" de una consulta libre del asistente: vuelve a correr la
// consulta guardada (con los permisos de ahora: lib/asistente/sql.ts) y baja
// todas las filas (hasta 50.000). Sólo quien la pidió.

import type { NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { una, motivoErp } from "@/lib/erp/base";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { respuestaExcel } from "@/lib/informes/excel";
import { consultarSql, TOPE_FILAS_EXCEL } from "@/lib/asistente/sql";
import { puedeConsultar } from "@/lib/asistente/acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await asegurarEsquemaErp();
  const s = await sesionActual();
  if (!s || !puedeConsultar(s.permisos, s.superadmin)) return new Response("Sin permiso.", { status: 403 });
  const { id } = await params;
  const c = await una<{ titulo: string; sql: string }>(
    "select titulo, sql from asistente_consulta where id = $1 and organizacion_id = $2 and usuario_id = $3", [Number(id) || 0, s.org.id, s.usuario.id]);
  if (!c) return new Response("No existe esa consulta.", { status: 404 });
  try {
    const r = await consultarSql(c.sql, s.usuario.authId ?? "", s.permisos, s.superadmin, TOPE_FILAS_EXCEL);
    const columnas = r.columnas.map((k) => ({
      titulo: k, ancho: Math.min(40, Math.max(10, k.length + 2)),
      valor: (f: Record<string, unknown>) => { const v = f[k]; return v == null ? null : typeof v === "number" ? v : String(v); },
    }));
    const pie = r.mas ? [[`Sólo las primeras ${TOPE_FILAS_EXCEL.toLocaleString("es-AR")} filas.`]] : [];
    return respuestaExcel(c.titulo, c.titulo, columnas, r.filas as Record<string, unknown>[], pie);
  } catch (e) {
    return new Response(motivoErp(e), { status: 400 });
  }
}
