// Descarga en Excel del stock valorizado, con los mismos filtros que la pantalla.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { COSTOS, leerFiltroValorizado, stockValorizado, totalesValorizado, type FilaValorizado } from "@/lib/informes/inventario";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await entrarErp("informes_stock_ver");
  const f = leerFiltroValorizado(Object.fromEntries(req.nextUrl.searchParams));
  const filas = await stockValorizado(s.org.id, f);
  const columnas: ColumnaExcel<FilaValorizado>[] = [
    { titulo: "Código", valor: (r) => r.sku, ancho: 18, formato: "texto" },
    { titulo: "Descripción", valor: (r) => r.titulo, ancho: 60 },
    { titulo: "Familia", valor: (r) => r.familia, ancho: 28 },
    { titulo: "Moneda", valor: (r) => r.moneda, ancho: 8 },
    { titulo: COSTOS[f.costo], valor: (r) => r.costo, formato: "importe" },
    { titulo: "Stock", valor: (r) => r.stock, ancho: 10, formato: "entero" },
    { titulo: "Valorizado", valor: (r) => r.valorizado, ancho: 16, formato: "importe" },
  ];
  const totales = totalesValorizado(filas).map((t) => [`Total stock valorizado (${t.moneda})`, null, null, t.moneda, null, t.stock, Math.round(t.valorizado * 100) / 100]);
  return respuestaExcel("Stock valorizado", "Stock valorizado", columnas, filas, totales);
}
