// Bajar la exportación de las cuentas de Mercado Pago de la empresa
// (lib/mercadopago/normalizar.ts), en partes (?parte=): movimientos (el
// consolidado sin duplicados y uno por cuenta, con cobertura, controles,
// diccionario y manifiesto), excel, u originales&cuenta=<número de Mercado
// Pago> (los archivos tal cual los entregó Mercado Pago). Con el permiso de
// Mercado Pago; sólo las cuentas de la organización.

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { datosExportacionEmpresa } from "@/lib/mercadopago/exportacion";
import { paqueteExportacion, respuestaZip, type ParteExportacion } from "@/lib/mercadopago/normalizar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const sesion = await sesionActual();
  if (!sesion || !tienePermiso(sesion.permisos, "mercadopago_ver")) return new Response("No", { status: 403 });
  const q = new URL(req.url).searchParams;
  const parte = (["movimientos", "excel", "originales"].includes(q.get("parte") ?? "") ? q.get("parte") : "movimientos") as ParteExportacion;
  const cuenta = Number(q.get("cuenta")) || undefined;
  if (parte === "originales" && !cuenta) return new Response("Falta la cuenta", { status: 400 });
  try {
    const p = await paqueteExportacion(await datosExportacionEmpresa(sesion.org.id, parte === "originales" ? { originalesDe: cuenta } : {}), "empresa", parte, cuenta);
    return respuestaZip(p.zip, p.nombre);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "No se pudo armar la exportación.", { status: 400 });
  }
}
