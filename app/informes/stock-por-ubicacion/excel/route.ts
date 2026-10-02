// Descarga en Excel del stock por ubicación, con los mismos filtros que la pantalla.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { leerFiltroUbicacion, stockPorUbicacion, type FilaUbicacion } from "@/lib/informes/inventario";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await entrarErp("informes_stock_ver");
  const filas = await stockPorUbicacion(s.org.id, leerFiltroUbicacion(Object.fromEntries(req.nextUrl.searchParams)));
  const columnas: ColumnaExcel<FilaUbicacion>[] = [
    { titulo: "Depósito", valor: (r) => r.deposito, ancho: 20 },
    { titulo: "Ubicación", valor: (r) => r.ubicacion, ancho: 14, formato: "texto" },
    { titulo: "Descripción ubicación", valor: (r) => r.descripcion, ancho: 24 },
    { titulo: "Código", valor: (r) => r.sku, ancho: 18, formato: "texto" },
    { titulo: "Producto", valor: (r) => r.titulo, ancho: 60 },
    { titulo: "Cantidad", valor: (r) => r.cantidad, ancho: 10, formato: "entero" },
    { titulo: "Reservado", valor: (r) => r.reservado, ancho: 10, formato: "entero" },
  ];
  const total = filas.reduce((a, r) => a + r.cantidad, 0);
  return respuestaExcel("Stock por ubicación", "Stock por ubicación", columnas, filas, [["Total", null, null, null, null, total, null]]);
}
