// Bajar la exportación de Mercado Pago desde el espacio personal
// (lib/mercadopago/normalizar.ts), en partes (?parte=):
//   · movimientos (de entrada): el consolidado sin duplicados y uno por cuenta, con cobertura, controles,
//     diccionario y manifiesto;
//   · excel: el Excel con todas las hojas;
//   · originales&cuenta=<número de Mercado Pago>: los archivos de esa cuenta tal cual los entregó Mercado Pago.
// Para el dueño de la organización suma las cuentas de la empresa (las seis juntas; pedido de Fer, 18/10);
// para alguien autorizado, sólo las cuentas personales del espacio.

import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { sesionActual } from "@/lib/tenancy";
import { espacioDe } from "@/lib/personal/espacio";
import { datosExportacion } from "@/lib/personal/mercadopago";
import { datosExportacionEmpresa } from "@/lib/mercadopago/exportacion";
import { orgsDelDueno } from "@/lib/mercadopago/gastos-datos";
import { paqueteExportacion, respuestaZip, type ParteExportacion } from "@/lib/mercadopago/normalizar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const sesion = await sesionActual();
  const espacio = sesion ? await espacioDe(sesion.usuario.id) : null;
  if (!sesion || !espacio?.id) return new Response("No", { status: 403 });
  const q = new URL(req.url).searchParams;
  const parte = (["movimientos", "excel", "originales"].includes(q.get("parte") ?? "") ? q.get("parte") : "movimientos") as ParteExportacion;
  const cuenta = Number(q.get("cuenta")) || undefined;
  if (parte === "originales" && !cuenta) return new Response("Falta la cuenta", { status: 400 });
  const o = parte === "originales" ? { originalesDe: cuenta } : {};
  const datos = [...await datosExportacion(espacio.id, o)];
  if (espacio.esDueno) for (const org of await orgsDelDueno(sesion.usuario.id)) datos.push(...await datosExportacionEmpresa(org, o));
  try {
    const p = await paqueteExportacion(datos, "seis-cuentas", parte, cuenta);
    return respuestaZip(p.zip, p.nombre);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "No se pudo armar la exportación.", { status: 400 });
  }
}
