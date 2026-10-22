// Bajar un archivo original del espacio personal, tal cual vino de Mercado
// Pago. Sólo si es de una cuenta del espacio de quien lo pide.

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { sesionActual } from "@/lib/tenancy";
import { espacioDe } from "@/lib/personal/espacio";
import { archivoDelEspacio } from "@/lib/personal/mercadopago";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await asegurarEsquemaErp();
  const sesion = await sesionActual();
  const espacio = sesion ? await espacioDe(sesion.usuario.id) : null;
  if (!espacio?.id) return new Response("No", { status: 403 });
  const a = await archivoDelEspacio(espacio.id, Number((await params).id));
  if (!a) return new Response("No existe", { status: 404 });
  const tipo = a.nombre.endsWith(".csv") ? "text/csv; charset=utf-8" : a.nombre.endsWith(".json") ? "application/json" : a.nombre.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/octet-stream";
  return new Response(new Uint8Array(a.contenido), { headers: { "content-type": tipo, "content-disposition": `attachment; filename="${a.nombre.replace(/"/g, "")}"`, "cache-control": "no-store" } });
}
