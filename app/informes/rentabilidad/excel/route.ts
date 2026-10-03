// Descarga en Excel de la rentabilidad, con los mismos filtros que la pantalla.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";
import { hoyArgentina } from "@/lib/rango-fechas";
import { BASES_COSTO, leerFiltroRentabilidad, rentabilidad, totalesRentabilidad, type FilaRentabilidad } from "@/lib/informes/rentabilidad";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await entrarErp("informes_ventas_ver");
  const f = leerFiltroRentabilidad(Object.fromEntries(req.nextUrl.searchParams), hoyArgentina());
  const filas = await rentabilidad(s.org.id, f);
  const porVenta = f.agrupar === "venta";
  const comunes: ColumnaExcel<FilaRentabilidad>[] = [
    { titulo: "Unidades", valor: (r) => r.unidades, formato: "entero", ancho: 10 },
    { titulo: "Venta", valor: (r) => r.venta, formato: "importe", ancho: 14 },
    { titulo: "Cargos del canal", valor: (r) => r.cargos, formato: "importe", ancho: 14 },
    { titulo: "Cargos de", valor: (r) => (r.cargos_ml ? "Facturación ML" : "Comisión de la orden"), ancho: 20 },
    { titulo: `${BASES_COSTO[f.costo]}`, valor: (r) => (r.sin_costo > 0 ? null : r.costo), formato: "importe", ancho: 14 },
    { titulo: "Margen", valor: (r) => r.margen, formato: "importe", ancho: 14 },
    { titulo: "Margen %", valor: (r) => r.margen_pct, formato: "pct", ancho: 10 },
  ];
  const columnas: ColumnaExcel<FilaRentabilidad>[] = porVenta ? [
    { titulo: "Fecha", valor: (r) => (r.fecha ? new Date(`${r.fecha.replace(" ", "T")}:00Z`) : null), formato: "fechahora", ancho: 16 },
    { titulo: "Pedido", valor: (r) => r.pedido_id, formato: "entero", ancho: 10 },
    { titulo: "Id externo", valor: (r) => r.externo, formato: "texto", ancho: 18 },
    { titulo: "Canal", valor: (r) => r.canal, ancho: 16 },
    { titulo: "Productos", valor: (r) => r.titulo, ancho: 50 },
    ...comunes,
  ] : [
    { titulo: "Código", valor: (r) => r.sku, formato: "texto", ancho: 18 },
    { titulo: "Producto", valor: (r) => r.titulo, ancho: 50 },
    { titulo: "Ventas", valor: (r) => r.ventas, formato: "entero", ancho: 10 },
    ...comunes,
  ];
  const t = totalesRentabilidad(filas);
  const vacios = porVenta ? [null, null, null, null] : [null, null];
  const pie = [["Total", ...vacios, t.unidades, t.venta, t.cargos, null, t.costo, t.margen, t.margenPct]];
  return respuestaExcel(porVenta ? "Rentabilidad por venta" : "Rentabilidad por producto", "Rentabilidad", columnas, filas, pie);
}
