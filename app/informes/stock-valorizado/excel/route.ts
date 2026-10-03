// Descarga en Excel del stock valorizado, con los mismos filtros que la
// pantalla (también la moneda: con "Ambas", cada importe va en pesos y en dólares).

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { COSTOS, aDobleMoneda, leerFiltroValorizado, stockValorizado, totalesValorizado, type FilaValorizadoDoble } from "@/lib/informes/inventario";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";
import { tcDelDia } from "@/lib/moneda";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await entrarErp("informes_stock_ver");
  const f = leerFiltroValorizado(Object.fromEntries(req.nextUrl.searchParams));
  const [crudas, tc] = await Promise.all([stockValorizado(s.org.id, f), tcDelDia(s.org.id)]);
  const filas = aDobleMoneda(crudas, tc?.venta ?? null);
  const monedas: ("ARS" | "USD")[] = f.moneda === "ars" ? ["ARS"] : f.moneda === "usd" ? ["USD"] : ["ARS", "USD"];
  const signo = (m: "ARS" | "USD") => (m === "USD" ? "US$" : "$");
  const base = COSTOS[f.costo].replace(/ \((USD)\)$/, "");

  const columnas: ColumnaExcel<FilaValorizadoDoble>[] = [
    { titulo: "Código", valor: (r) => r.sku, ancho: 18, formato: "texto" },
    { titulo: "Descripción", valor: (r) => r.titulo, ancho: 60 },
    { titulo: "Familia", valor: (r) => r.familia, ancho: 28 },
    { titulo: "Moneda del costo", valor: (r) => r.moneda, ancho: 10 },
    ...monedas.map((m): ColumnaExcel<FilaValorizadoDoble> => ({ titulo: `${base} (${signo(m)})`, valor: (r) => (m === "USD" ? r.costo_usd : r.costo_ars), ancho: 16, formato: "importe" })),
    { titulo: "Stock", valor: (r) => r.stock, ancho: 10, formato: "entero" },
    ...monedas.map((m): ColumnaExcel<FilaValorizadoDoble> => ({ titulo: `Valorizado (${signo(m)})`, valor: (r) => (m === "USD" ? r.valorizado_usd : r.valorizado_ars), ancho: 18, formato: "importe" })),
  ];
  const t = totalesValorizado(filas);
  const total = ["Total stock valorizado", null, null, null, ...monedas.map(() => null), t.stock, ...monedas.map((m) => (m === "USD" ? t.usd : t.ars))];
  const pie: (string | number | null)[][] = [total];
  if (tc) pie.push([`Tipo de cambio oficial ${tc.fecha.split("-").reverse().join("/")}: ${tc.venta} pesos por dólar`]);
  else pie.push(["Sin tipo de cambio cargado: los costos en la otra moneda quedan vacíos"]);
  return respuestaExcel("Stock valorizado", "Stock valorizado", columnas, filas, pie);
}
