// Los archivos del Libro de IVA Digital de ARCA de un mes: los cinco juntos
// en un .zip o uno solo (?archivo=VENTAS_CBTE, VENTAS_ALICUOTAS, COMPRAS_CBTE,
// COMPRAS_ALICUOTAS o IMPORTACIONES). Las ventas, de todos los canales.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { archivosLibroIvaDigital } from "@/lib/administracion/libro-iva";
import { libroIvaPeriodo } from "@/lib/administracion/libro-iva-base";
import { elegirRazonSocial } from "@/lib/razon-social";
import { armarZip } from "@/lib/zip";
import { periodoDe, type SPLibro } from "../comun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const descarga = (nombre: string, tipo: string, cuerpo: Buffer) =>
  new Response(new Uint8Array(cuerpo), { headers: { "Content-Type": tipo, "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const s = await entrarErp("libros_iva_ver");
  const sp = Object.fromEntries(req.nextUrl.searchParams) as SPLibro & { archivo?: string };
  const { desde, hasta, periodo } = periodoDe(sp);
  if (!periodo) return new Response("Los archivos del Libro de IVA Digital se arman por mes entero.", { status: 400 });
  const rs = await elegirRazonSocial(s.org.id, sp.rs, { todas: false });
  const { ventas, compras } = await libroIvaPeriodo(s.org.id, desde, hasta, rs.id);
  const archivos = archivosLibroIvaDigital(periodo, ventas, compras);
  if (sp.archivo) {
    const a = archivos.find((x) => x.nombre === `LIBRO_IVA_DIGITAL_${sp.archivo}_${periodo}.txt`);
    if (!a) return new Response("No existe ese archivo.", { status: 404 });
    return descarga(a.nombre, "text/plain; charset=us-ascii", Buffer.from(a.contenido, "latin1"));
  }
  return descarga(`LIBRO_IVA_DIGITAL_${periodo}.zip`, "application/zip", armarZip(archivos));
}
