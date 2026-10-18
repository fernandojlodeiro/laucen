// Bajar la exportación de las cuentas de Mercado Pago del espacio personal
// (lib/mercadopago/normalizar.ts): un .zip con los movimientos en CSV (por
// cuenta y consolidado), el Excel con todas las hojas, el diccionario y el
// manifiesto. Sólo para quien entra al espacio; sólo sus cuentas.

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { sesionActual } from "@/lib/tenancy";
import { espacioDe } from "@/lib/personal/espacio";
import { datosExportacion } from "@/lib/personal/mercadopago";
import { paqueteExportacion } from "@/lib/mercadopago/normalizar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  await asegurarEsquemaErp();
  const sesion = await sesionActual();
  const espacio = sesion ? await espacioDe(sesion.usuario.id) : null;
  if (!espacio?.id) return new Response("No", { status: 403 });
  const p = await paqueteExportacion(await datosExportacion(espacio.id), "personal");
  return new Response(new Uint8Array(p.zip), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${p.nombre}"`, "cache-control": "no-store" } });
}
