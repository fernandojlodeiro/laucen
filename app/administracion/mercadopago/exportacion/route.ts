// Bajar la exportación de las cuentas de Mercado Pago de la empresa
// (lib/mercadopago/normalizar.ts): un .zip con los movimientos en CSV (por
// cuenta y consolidado), el Excel con todas las hojas, el diccionario y el
// manifiesto. Con el permiso de Mercado Pago; sólo las cuentas de la organización.

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { datosExportacionEmpresa } from "@/lib/mercadopago/exportacion";
import { paqueteExportacion } from "@/lib/mercadopago/normalizar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  await asegurarEsquemaErp();
  const sesion = await sesionActual();
  if (!sesion || !tienePermiso(sesion.permisos, "mercadopago_ver")) return new Response("No", { status: 403 });
  const p = await paqueteExportacion(await datosExportacionEmpresa(sesion.org.id), "empresa");
  return new Response(new Uint8Array(p.zip), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${p.nombre}"`, "cache-control": "no-store" } });
}
