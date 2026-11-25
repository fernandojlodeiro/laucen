// Ventas por provincia de un mes de una razón social, en Excel (lib/administracion/ventas-provincia.ts): el mismo
// archivo que se sube al Drive junto con los TXT del Libro de IVA.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { libroIvaPeriodo } from "@/lib/administracion/libro-iva-base";
import { ventasPorProvincia, excelProvincias, nombreArchivoProvincias } from "@/lib/administracion/ventas-provincia";
import { elegirRazonSocial, nombreRs } from "@/lib/razon-social";
import { periodoDe, type SPLibro } from "../comun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const s = await entrarErp("libros_iva_ver");
  const sp = Object.fromEntries(req.nextUrl.searchParams) as SPLibro;
  const { desde, hasta, periodo } = periodoDe(sp);
  const rs = await elegirRazonSocial(s.org.id, sp.rs, { todas: false });
  const { ventas } = await libroIvaPeriodo(s.org.id, desde, hasta, rs.id);
  const filas = await ventasPorProvincia(s.org.id, ventas);
  const textoPeriodo = periodo && /^\d{6}$/.test(periodo) ? `${periodo.slice(4)}/${periodo.slice(0, 4)}` : `${desde} a ${hasta}`;
  const buffer = await excelProvincias(filas, `Ventas por provincia ${textoPeriodo}`.replace(/\//g, "-"));
  const rsNombre = rs.multi && rs.id ? ` ${nombreRs(rs.razones.find((x) => x.id === rs.id)!)}` : "";
  const nombre = (periodo && /^\d{6}$/.test(periodo) ? nombreArchivoProvincias(periodo).replace(/\.xlsx$/, "") : `VENTAS_POR_PROVINCIA_${desde}_${hasta}`) + rsNombre;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[^\x20-\x7E]/g, "")}.xlsx"; filename*=UTF-8''${encodeURIComponent(`${nombre}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
