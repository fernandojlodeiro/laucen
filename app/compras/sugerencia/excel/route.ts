// Descarga en Excel de la sugerencia de compra, con los mismos filtros que la pantalla.

import { ESTADOS_MERCADO } from "@/lib/seguimiento/estado-mercado";
import type { NextRequest } from "next/server";
import { CATEGORIAS_VIA } from "@/lib/compras/via";
import { entrarErp } from "@/app/componentes/erp";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";
import { hoyArgentina } from "@/lib/rango-fechas";
import { filasDeLaPantalla, totalesSugerencia, type FilaSugerencia } from "@/lib/compras/sugerencia";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** La fila de totales, cada valor bajo la columna de ese título. */
const totalEn = <T,>(columnas: ColumnaExcel<T>[], valores: Record<string, string | number>) => columnas.map((c) => valores[c.titulo] ?? null);

export async function GET(req: NextRequest) {
  const s = await entrarErp("compras_ver");
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { f, filas, tcHoy } = await filasDeLaPantalla(s.org.id, sp, hoyArgentina());
  const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const columnas: ColumnaExcel<FilaSugerencia>[] = [
    { titulo: "SKU", valor: (x) => x.sku, ancho: 16, formato: "texto" },
    { titulo: "Producto", valor: (x) => x.titulo, ancho: 50 },
    { titulo: "Inactivo", valor: (x) => (x.archivado ? "Sí" : ""), ancho: 9 },
    { titulo: `Para ${f.dias} días · típico`, valor: (x) => x.tipico, formato: "entero", ancho: 12 },
    { titulo: `Para ${f.dias} días · mejor momento`, valor: (x) => x.mejor, formato: "entero", ancho: 12 },
    { titulo: "Stock hoy", valor: (x) => x.stock, formato: "entero", ancho: 10 },
    { titulo: `Stock al llegar (en ${f.demora} días)`, valor: (x) => x.al_llegar, formato: "entero", ancho: 11 },
    { titulo: "A comprar · típico", valor: (x) => x.comprar_tipico, formato: "entero", ancho: 11 },
    { titulo: "A comprar · mejor momento", valor: (x) => x.comprar_mejor, formato: "entero", ancho: 11 },
    { titulo: `Para ${f.dias} días · según compras`, valor: (x) => x.segun_compras, formato: "entero", ancho: 12 },
    { titulo: "Compras registradas", valor: (x) => x.compras_n || null, formato: "entero", ancho: 10 },
    { titulo: "Última compra (llegada)", valor: (x) => (x.ultima_compra ? fecha(x.ultima_compra) : null), formato: "fecha", ancho: 11 },
    { titulo: "Última compra (u.)", valor: (x) => x.ultima_cant, formato: "entero", ancho: 10 },
    { titulo: "Días que tarda en venderse una compra", valor: (x) => x.dias_compra, formato: "entero", ancho: 12 },
    { titulo: "Días con venta", valor: (x) => x.dias_con_venta, formato: "entero", ancho: 10 },
    { titulo: "Tramos con venta regular", valor: (x) => x.ventanas, formato: "entero", ancho: 10 },
    { titulo: "Compras grandes no consideradas", valor: (x) => (x.grandes ? `${x.grandes} (la mayor, ${x.mayor_grande} u.)` : ""), ancho: 18 },
    { titulo: "Costo puesto US$", valor: (x) => x.costo_usd, formato: "importe", ancho: 11 },
    { titulo: "Costo por", valor: (x) => (x.costo_de === "avion" ? "Avión" : x.costo_de === "barco" ? "Barco" : x.costo_de === "ficha" ? "Ficha" : ""), ancho: 8 },
    { titulo: "FOB al proveedor típico US$", valor: (x) => (x.fob_usd == null ? null : x.fob_usd * x.comprar_tipico), formato: "importe", ancho: 13 },
    { titulo: "Inversión típica US$", valor: (x) => (x.costo_usd == null ? null : x.costo_usd * x.comprar_tipico), formato: "importe", ancho: 13 },
    { titulo: "Inversión mejor US$", valor: (x) => (x.costo_usd == null ? null : x.costo_usd * x.comprar_mejor), formato: "importe", ancho: 13 },
    { titulo: "Última venta", valor: (x) => fecha(x.ultima_fecha), formato: "fecha", ancho: 11 },
    { titulo: "Precio última venta $", valor: (x) => x.ultima_precio, formato: "importe", ancho: 13 },
    { titulo: "Dólar ese día", valor: (x) => x.ultima_tc, formato: "importe", ancho: 10 },
    { titulo: "Precio en US$", valor: (x) => x.precio_usd, formato: "importe", ancho: 11 },
    { titulo: "Última venta a pesos de hoy $", valor: (x) => x.precio_hoy, formato: "importe", ancho: 13 },
    { titulo: "Clásica hoy $", valor: (x) => x.clasica, formato: "importe", ancho: 13 },
    { titulo: "Lo estás vendiendo", valor: (x) => (x.vendiendo ? "Sí" : "No"), ancho: 9 },
    { titulo: "Ganancia calculada sobre", valor: (x) => (x.precio_base === "clasica" ? "Clásica" : x.precio_base === "mercado" ? "Mercado" : x.precio_base === "ultima" ? "Última venta" : ""), ancho: 14 },
    { titulo: "Precio de venta $", valor: (x) => x.precio_venta, formato: "importe", ancho: 13 },
    { titulo: "Revisar Clásica (más de 5 % contra mercado)", valor: (x) => (x.revisar ? "Sí" : ""), ancho: 10 },
    { titulo: "Comisión ML %", valor: (x) => x.comision_pct, formato: "pct", ancho: 10 },
    { titulo: "Mercado Libre $", valor: (x) => x.costos_ml, formato: "importe", ancho: 12 },
    { titulo: "Ganancia $", valor: (x) => x.ganancia_unit, formato: "importe", ancho: 13 },
    { titulo: "% s/ venta", valor: (x) => x.margen_pct, formato: "pct", ancho: 9 },
    { titulo: "% s/ costo", valor: (x) => x.roi_pct, formato: "pct", ancho: 9 },
    { titulo: "Ganancia típica $", valor: (x) => (x.ganancia_unit == null ? null : x.ganancia_unit * x.comprar_tipico), formato: "importe", ancho: 14 },
    { titulo: "Ganancia mejor $", valor: (x) => (x.ganancia_unit == null ? null : x.ganancia_unit * x.comprar_mejor), formato: "importe", ancho: 14 },
    { titulo: "Mercado (el más barato) $", valor: (x) => x.mercado, formato: "importe", ancho: 13 },
    { titulo: "Mercado (mediana) $", valor: (x) => x.mercado_mediana, formato: "importe", ancho: 13 },
    { titulo: "Publicaciones iguales", valor: (x) => x.mercado_n || null, formato: "entero", ancho: 10 },
    { titulo: "Precio de mercado", valor: (x) => (x.estado_mercado ? ESTADOS_MERCADO[x.estado_mercado].texto : null), formato: "texto", ancho: 24 },
    { titulo: "Vía", valor: (x) => CATEGORIAS_VIA[x.via].texto, ancho: 18 },
    { titulo: "FOB US$", valor: (x) => x.fob_usd, formato: "importe", ancho: 10 },
    { titulo: "Peso y volumen de", valor: (x) => (x.medidas === "packing" ? "Packing list" : x.medidas === "ficha" ? "Ficha" : ""), ancho: 12 },
    { titulo: "Flete avión % FOB", valor: (x) => x.flete_aereo_pct, formato: "pct", ancho: 10 },
    { titulo: "Con NCM", valor: (x) => (x.con_ncm ? "Sí" : ""), ancho: 8 },
    { titulo: "Costo final avión US$", valor: (x) => x.avion_final, formato: "importe", ancho: 12 },
    { titulo: "Ganancia avión US$", valor: (x) => x.avion_ganancia, formato: "importe", ancho: 12 },
    { titulo: "Costo final avión $", valor: (x) => (x.avion_final != null && tcHoy ? x.avion_final * tcHoy : null), formato: "importe", ancho: 12 },
    { titulo: "% avión s/ venta", valor: (x) => x.avion_margen, formato: "pct", ancho: 9 },
    { titulo: "% avión s/ costo", valor: (x) => x.avion_sobre_costo, formato: "pct", ancho: 9 },
    { titulo: "Costo final barco US$", valor: (x) => x.barco_final, formato: "importe", ancho: 12 },
    { titulo: "Ganancia barco US$", valor: (x) => x.barco_ganancia, formato: "importe", ancho: 12 },
    { titulo: "Costo final barco $", valor: (x) => (x.barco_final != null && tcHoy ? x.barco_final * tcHoy : null), formato: "importe", ancho: 12 },
    { titulo: "% barco s/ venta", valor: (x) => x.barco_margen, formato: "pct", ancho: 9 },
    { titulo: "% barco s/ costo", valor: (x) => x.barco_sobre_costo, formato: "pct", ancho: 9 },
  ];
  const t = totalesSugerencia(filas);
  return respuestaExcel("Sugerencia de compra", "Sugerencia", columnas, filas,
    [totalEn(columnas, { "SKU": "Total", "A comprar · típico": t.unidadesTipicas, "A comprar · mejor momento": t.unidadesMejor, "FOB al proveedor típico US$": t.fobTipicoUsd,
      "Inversión típica US$": t.inversionTipicaUsd, "Inversión mejor US$": t.inversionMejorUsd, "Ganancia típica $": t.gananciaTipica, "Ganancia mejor $": t.gananciaMejor }),
      [`Período ${f.desde} a ${f.hasta}; comprar para ${f.dias} días; la compra llega en ${f.demora} días`]]);
}
