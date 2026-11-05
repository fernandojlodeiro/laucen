// Excel de las listas de Market Pro (categorías, productos, vendedores, marcas): lo mismo que se ve (filtros y período),
// todas las filas.

import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { leerFiltro, porCategoria, porMarca, porProducto, porVendedor, ultimoMes, type Medidas } from "@/lib/marketpro/analisis";
import { gananciaEstimada } from "@/lib/marketpro/ganancia";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Col<T> = [string, number, (x: T) => unknown, string?];
const PESOS = "#,##0", ENTERO = "#,##0", PCT = "0.0%";

function medidas<T extends Medidas>(): Col<T>[] {
  return [
    ["Facturación", 14, (x) => x.gmv, PESOS], ["Unidades", 10, (x) => x.unidades, ENTERO], ["Ticket", 12, (x) => x.ticket, PESOS],
    ["Vendedores", 10, (x) => x.vendedores, ENTERO], ["Publicaciones", 12, (x) => x.publicaciones, ENTERO], ["Líder (parte)", 10, (x) => x.lider_pct, PCT],
    ["Crecimiento 3m", 12, (x) => x.crecimiento, PCT], ["Full", 8, (x) => x.full_pct, PCT], ["Premium", 8, (x) => x.premium_pct, PCT],
    ["Catálogo", 8, (x) => x.catalogo_pct, PCT], ["Conversión", 10, (x) => x.conversion, "0.00%"], ["Oportunidad", 10, (x) => x.puntaje, ENTERO],
  ];
}

export async function GET(req: NextRequest) {
  const s = await entrarErp("market_pro_ver");
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const f = leerFiltro(sp);
  const mes = await ultimoMes(s.org.id);
  const vista = ["categorias", "productos", "vendedores", "marcas"].includes(sp.vista) ? sp.vista : "productos";
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet(`Market Pro ${vista}`, { views: [{ state: "frozen", ySplit: 1 }] });
  const poner = <T,>(cols: Col<T>[], filas: T[]) => {
    h.columns = cols.map(([header, width, , numFmt]) => ({ header, width, style: numFmt ? { numFmt } : {} }));
    h.getRow(1).font = { bold: true };
    for (const x of filas) h.addRow(cols.map(([, , v]) => v(x) ?? null));
  };
  if (mes && vista === "categorias") {
    type F = Awaited<ReturnType<typeof porCategoria>>[number];
    poner<F>([["Categoría", 60, (x) => x.ruta], ["Número", 12, (x) => `MLA${x.cat}`], ...medidas<F>(), ["Comisión Clásica", 10, (x) => (x.comision != null ? x.comision / 100 : null), PCT]], await porCategoria(s.org.id, mes, f));
  } else if (mes && vista === "vendedores") {
    type F = Awaited<ReturnType<typeof porVendedor>>[number];
    poner<F>([["Vendedor", 24, (x) => x.vendedor], ["Alias", 20, (x) => x.alias], ["Vendedor real (Mercado Libre)", 22, (x) => x.nombre], ["Somos nosotros", 10, (x) => (x.nuestras ? "Sí" : "")], ...medidas<F>().filter((c) => !["Líder (parte)", "Oportunidad"].includes(c[0])),
      ["Parte de la facturación", 12, (x) => x.lider_pct, PCT], ["Productos", 10, (x) => x.productos, ENTERO], ["Reputación", 14, (x) => x.reputacion],
      ["Provincia", 18, (x) => x.provincia], ["Donde más vende", 50, (x) => x.categoria_top]], await porVendedor(s.org.id, mes, f));
  } else if (mes && vista === "marcas") {
    type F = Awaited<ReturnType<typeof porMarca>>[number];
    poner<F>([["Marca", 24, (x) => x.marca], ["Productos", 10, (x) => x.productos, ENTERO], ...medidas<F>()], await porMarca(s.org.id, mes, f));
  } else if (mes) {
    type F = Awaited<ReturnType<typeof porProducto>>[number];
    const g = (x: F) => (x.tuyo_producto ? gananciaEstimada(x.precio_mediana, x.tuyo_costo, x.comision) : null);
    poner<F>([["Producto", 60, (x) => x.titulo], ["Marca", 16, (x) => x.marca], ["Categoría", 40, (x) => x.ruta], ["Clave", 20, (x) => x.producto],
      ["Precio mediana 3m", 12, (x) => x.precio_mediana, PESOS], ["Precio mínimo 3m", 12, (x) => x.precio_min, PESOS], ...medidas<F>(),
      ["El que más vende", 20, (x) => x.lider], ["Lo tenés (producto N.º)", 12, (x) => x.tuyo_producto],
      ["Tu costo", 12, (x) => x.tuyo_costo, PESOS], ["Ganancia s/venta", 10, (x) => g(x)?.sobreVenta, PCT], ["Ganancia s/costo", 10, (x) => g(x)?.sobreCosto, PCT]],
      await porProducto(s.org.id, mes, f));
  }
  const buf = await libro.xlsx.writeBuffer();
  return new Response(buf, { headers: {
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": `attachment; filename="market-pro-${vista}.xlsx"`,
  } });
}
