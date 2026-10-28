// Excel para pedirle cotización al proveedor (pedido de Fer, 28/10): de lo que se ve en Sugerencia de compra (mismos filtros
// y orden), sólo lo que hay que comprar, con la foto, el SKU, el título y la cantidad (la del ritmo típico, ya descontado lo
// que va a quedar cuando llegue). El proveedor conoce los SKU: no hace falta traducir nada. Lleva una columna vacía para que
// ponga el precio.

import ExcelJS from "exceljs";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { hoyArgentina } from "@/lib/rango-fechas";
import { filasDeLaPantalla, type FilaSugerencia } from "@/lib/compras/sugerencia";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Lado de la foto en el Excel, en píxeles. */
const LADO = 90;

/** La foto principal, achicada a JPG (Excel no acepta WEBP, que es como vienen de Mercado Libre). Sin foto, null. */
async function miniatura(url: string | undefined): Promise<Buffer | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    return await sharp(Buffer.from(await r.arrayBuffer())).resize(LADO * 2, LADO * 2, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer();
  } catch {
    return null;
  }
}

/** Baja las fotos de a varias a la vez. */
async function miniaturas(filas: FilaSugerencia[]): Promise<(Buffer | null)[]> {
  const out: (Buffer | null)[] = new Array(filas.length).fill(null);
  let i = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (i < filas.length) { const k = i++; out[k] = await miniatura(filas[k].fotos?.[0]); }
  }));
  return out;
}

export async function GET(req: NextRequest) {
  const s = await entrarErp("compras_ver");
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { filas: todas } = await filasDeLaPantalla(s.org.id, sp, hoyArgentina());
  const filas = todas.filter((x) => x.comprar_tipico > 0);
  const fotos = await miniaturas(filas);

  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet("Pedido", { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = [
    { header: "Foto", width: 14 },
    { header: "SKU", width: 14 },
    { header: "Producto", width: 60, style: { alignment: { wrapText: true, vertical: "middle" } } },
    { header: "Cantidad", width: 10, style: { numFmt: "#,##0", alignment: { vertical: "middle" } } },
    { header: "Precio US$", width: 12, style: { numFmt: "#,##0.00", alignment: { vertical: "middle" } } },
  ];
  h.getRow(1).font = { bold: true };
  filas.forEach((x, n) => {
    const fila = h.addRow([null, x.sku, x.titulo, x.comprar_tipico, null]);
    fila.height = LADO * 0.75 + 6; // puntos
    fila.getCell(2).alignment = { vertical: "middle" };
    const foto = fotos[n];
    if (foto) {
      const id = libro.addImage({ buffer: foto as unknown as ExcelJS.Buffer, extension: "jpeg" });
      h.addImage(id, { tl: { col: 0.1, row: n + 1.05 }, ext: { width: LADO, height: LADO }, editAs: "oneCell" });
    }
  });
  h.addRow(["Total", null, `${filas.length} productos`, filas.reduce((t, x) => t + x.comprar_tipico, 0), null]).font = { bold: true };

  const buffer = await libro.xlsx.writeBuffer();
  const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Pedido de cotizacion ${fecha}.xlsx"; filename*=UTF-8''${encodeURIComponent(`Pedido de cotización ${fecha}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
