// Excel de Vendedores referentes (lib/compras/referentes.ts): lo que se ve (mismos filtros y orden, todas las filas) o, con
// ?cotizar=1, sólo lo marcado «Cotizar» para mandarle al proveedor (Fer, 28/10: sin SKU ni cantidad, títulos en castellano y
// el link de la publicación de referencia: la más vendida del producto), con columnas vacías para el precio, el peso y las medidas. La foto, con la
// fórmula IMAGEN de Excel (sólo Microsoft 365).

import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { coincideBusqueda } from "@/lib/busqueda";
import { ORDEN_REFERENTES, filtrarReferentes, publicacionesReferentes, textoBuscable } from "@/lib/compras/referentes";
import { ordenarEnMemoria } from "@/lib/lista";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await entrarErp("compras_ver");
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const todas = await publicacionesReferentes(s.org.id);
  const q = sp.q?.trim() ?? "";
  const cotizar = sp.cotizar === "1";
  const filas = cotizar ? todas.filter((x) => x.decision === "cotizar").sort((a, b) => b.vendidos - a.vendidos)
    : ordenarEnMemoria(filtrarReferentes(todas, sp, (x) => !q || coincideBusqueda(textoBuscable(x), q, sp.contiene !== "1")), sp, ORDEN_REFERENTES);

  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet(cotizar ? "Para cotizar" : "Vendedores referentes", { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = cotizar
    ? [{ header: "Foto", width: 12 }, { header: "Producto", width: 55 }, { header: "Publicación de referencia", width: 45 },
      { header: "Precio US$", width: 12, style: { numFmt: "#,##0.00" } }, { header: "Peso (g)", width: 10 }, { header: "Medidas de la caja (cm)", width: 18 }, { header: "Observaciones", width: 30 }]
    : [{ header: "Foto", width: 12 }, { header: "Producto", width: 55 }, { header: "Link (la más vendida)", width: 45 }, { header: "Precio desde $", width: 12, style: { numFmt: "#,##0" } },
      { header: "Precio hasta $", width: 12, style: { numFmt: "#,##0" } }, { header: "Vendidas", width: 10, style: { numFmt: "#,##0" } }, { header: "Lo venden", width: 10 },
      { header: "Vendedores", width: 40, style: { alignment: { wrapText: true } } }, { header: "Tu producto (SKU)", width: 18 }, { header: "Tu producto", width: 12 },
      { header: "Por qué", width: 40, style: { alignment: { wrapText: true } } }, { header: "Decisión", width: 12 }];
  h.getRow(1).font = { bold: true };
  for (const x of filas) {
    const foto = x.foto ? { formula: `_xlfn.IMAGE("${x.foto}")` } : null;
    const link = x.url ? { text: x.url, hyperlink: x.url } : null;
    const r = h.addRow(cotizar ? [foto, x.titulo, link, null, null, null, null]
      : [foto, x.titulo, link, x.precio_min, x.precio_max, x.vendidos, x.lo_venden, [...new Set(x.pubs.map((p) => p.vendedor).filter(Boolean))].join(", "),
        x.nuestro_sku, x.producto_id ? (x.nuestro_estado === "archivado" ? "Archivado" : "Activo") : x.comparado === "ia" ? "No lo tenés" : "",
        x.comparado === "ia" ? x.motivo : x.producto_id ? `Sin IA: ${Math.round((x.parecido ?? 0) * 100)} % del título` : null,
        x.decision === "cotizar" ? "Cotizar" : x.decision === "descartado" ? "Descartado" : ""]);
    r.height = 48;
    r.alignment = { vertical: "middle", wrapText: true };
  }
  const buffer = await libro.xlsx.writeBuffer();
  const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  const nombre = `${cotizar ? "Productos para cotizar" : "Vendedores referentes"} ${fecha}`;
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
