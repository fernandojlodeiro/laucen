// Descarga en Excel de los movimientos de stock, con los mismos filtros que la pantalla.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";
import { TIPOS_MOVIMIENTO } from "@/lib/stock";
import { TOPE_EXCEL, leerFiltroMovimientos, movimientos, referencia, type FilaMovimiento } from "../consulta";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await entrarErp("stock_ver");
  const f = leerFiltroMovimientos(Object.fromEntries(req.nextUrl.searchParams));
  const filas = await movimientos(s.org.id, f, TOPE_EXCEL);
  const columnas: ColumnaExcel<FilaMovimiento>[] = [
    { titulo: "Fecha", valor: (m) => m.fecha, ancho: 15, formato: "texto" },
    { titulo: "Tipo", valor: (m) => TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo, ancho: 13 },
    { titulo: "SKU", valor: (m) => m.sku, ancho: 18, formato: "texto" },
    { titulo: "Producto", valor: (m) => m.titulo, ancho: 50 },
    { titulo: "Kit", valor: (m) => m.kit_sku, ancho: 16, formato: "texto" },
    { titulo: "Origen", valor: (m) => m.origen, ancho: 22 },
    { titulo: "Destino", valor: (m) => m.destino, ancho: 22 },
    { titulo: "Cantidad", valor: (m) => m.cantidad, ancho: 10, formato: "entero" },
    { titulo: "Referencia", valor: (m) => referencia(m), ancho: 20 },
    { titulo: "Nota", valor: (m) => m.nota, ancho: 30 },
    { titulo: "Usuario", valor: (m) => m.usuario, ancho: 20 },
  ];
  const pie = filas.length === TOPE_EXCEL ? [[`Sólo los ${TOPE_EXCEL.toLocaleString("es-AR")} más nuevos: afiná las fechas para bajar el resto.`]] : [];
  return respuestaExcel("Movimientos de stock", "Movimientos", columnas, filas, pie);
}
