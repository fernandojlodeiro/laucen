// Descarga en Excel de la sugerencia de compra, con los mismos filtros que la pantalla.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { coincideBusqueda } from "@/lib/busqueda";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";
import { hoyArgentina } from "@/lib/rango-fechas";
import { ORDEN_SUGERENCIA, arbolCategorias, filtrarMuestra, leerFiltroSugerencia, sugerenciaGuardada, totalesSugerencia, type FilaSugerencia } from "@/lib/compras/sugerencia";
import { ordenarEnMemoria } from "@/lib/lista";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const s = await entrarErp("compras_ver");
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const f = leerFiltroSugerencia(sp, hoyArgentina());
  const { filas: todas } = await sugerenciaGuardada(s.org.id, f);
  const { ancestros } = await arbolCategorias(s.org.id, todas);
  const sinCat = new Set((sp.sin_cat ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && sp.sin_cat));
  const categoriaFuera = (x: FilaSugerencia) => x.familia_id == null ? sinCat.has(0) : (ancestros.get(x.familia_id) ?? []).some((id) => sinCat.has(id));
  const q = sp.q?.trim() ?? "";
  const filas = ordenarEnMemoria(filtrarMuestra(todas, sp, (x) => !categoriaFuera(x) && (!q || coincideBusqueda([x.sku, x.titulo], q, sp.contiene !== "1"))), sp, ORDEN_SUGERENCIA);
  const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const columnas: ColumnaExcel<FilaSugerencia>[] = [
    { titulo: "SKU", valor: (x) => x.sku, ancho: 16, formato: "texto" },
    { titulo: "Producto", valor: (x) => x.titulo, ancho: 50 },
    { titulo: "Inactivo", valor: (x) => (x.archivado ? "Sí" : ""), ancho: 9 },
    { titulo: `Para ${f.dias} días · típico`, valor: (x) => x.tipico, formato: "entero", ancho: 12 },
    { titulo: `Para ${f.dias} días · mejor momento`, valor: (x) => x.mejor, formato: "entero", ancho: 12 },
    { titulo: "Stock hoy", valor: (x) => x.stock, formato: "entero", ancho: 10 },
    { titulo: "A comprar · típico", valor: (x) => x.comprar_tipico, formato: "entero", ancho: 11 },
    { titulo: "A comprar · mejor momento", valor: (x) => x.comprar_mejor, formato: "entero", ancho: 11 },
    { titulo: "Días con venta", valor: (x) => x.dias_con_venta, formato: "entero", ancho: 10 },
    { titulo: "Tramos con venta regular", valor: (x) => x.ventanas, formato: "entero", ancho: 10 },
    { titulo: "Compras grandes no consideradas", valor: (x) => (x.grandes ? `${x.grandes} (la mayor, ${x.mayor_grande} u.)` : ""), ancho: 18 },
    { titulo: "Costo US$", valor: (x) => x.costo_usd, formato: "importe", ancho: 11 },
    { titulo: "Inversión típica US$", valor: (x) => (x.costo_usd == null ? null : x.costo_usd * x.comprar_tipico), formato: "importe", ancho: 13 },
    { titulo: "Inversión mejor US$", valor: (x) => (x.costo_usd == null ? null : x.costo_usd * x.comprar_mejor), formato: "importe", ancho: 13 },
    { titulo: "Última venta", valor: (x) => fecha(x.ultima_fecha), formato: "fecha", ancho: 11 },
    { titulo: "Precio última venta $", valor: (x) => x.ultima_precio, formato: "importe", ancho: 13 },
    { titulo: "Dólar ese día", valor: (x) => x.ultima_tc, formato: "importe", ancho: 10 },
    { titulo: "Precio en US$", valor: (x) => x.precio_usd, formato: "importe", ancho: 11 },
    { titulo: "Precio hoy $", valor: (x) => x.precio_hoy, formato: "importe", ancho: 13 },
    { titulo: "Clásica hoy $", valor: (x) => x.clasica, formato: "importe", ancho: 13 },
    { titulo: "Comisión ML %", valor: (x) => x.comision_pct, formato: "pct", ancho: 10 },
    { titulo: "Mercado Libre $", valor: (x) => x.costos_ml, formato: "importe", ancho: 12 },
    { titulo: "Ganancia $", valor: (x) => x.ganancia_unit, formato: "importe", ancho: 13 },
    { titulo: "% s/ venta", valor: (x) => x.margen_pct, formato: "pct", ancho: 9 },
    { titulo: "% s/ costo", valor: (x) => x.roi_pct, formato: "pct", ancho: 9 },
    { titulo: "Ganancia típica $", valor: (x) => (x.ganancia_unit == null ? null : x.ganancia_unit * x.comprar_tipico), formato: "importe", ancho: 14 },
    { titulo: "Ganancia mejor $", valor: (x) => (x.ganancia_unit == null ? null : x.ganancia_unit * x.comprar_mejor), formato: "importe", ancho: 14 },
  ];
  const t = totalesSugerencia(filas);
  return respuestaExcel("Sugerencia de compra", "Sugerencia", columnas, filas,
    [["Total", null, null, null, null, null, t.unidadesTipicas, t.unidadesMejor, null, null, null, null, t.inversionTipicaUsd, t.inversionMejorUsd, null, null, null, null, null, null, null, null, null, null, null, t.gananciaTipica, t.gananciaMejor],
      [`Período ${f.desde} a ${f.hasta}; comprar para ${f.dias} días`]]);
}
