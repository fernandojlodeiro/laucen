// Excel para pedirle cotización al proveedor (pedido de Fer, 28/10): de lo que se ve en Sugerencia de compra (mismos filtros
// y orden), sólo lo que hay que comprar, con la foto, el SKU, el título, la cantidad (la del típico, la del mejor momento o
// el promedio, ya descontado lo que va a quedar cuando llegue, redondeada a decenas), la categoría de vía y la ganancia en
// pesos (por unidad y total). El proveedor conoce los SKU: no hace falta traducir nada. El precio es el FOB de la ficha (para
// controlar o borrar antes de mandarlo), con el subtotal, la ganancia total y los totales como fórmulas de Excel.

import ExcelJS from "exceljs";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { hoyArgentina } from "@/lib/rango-fechas";
import { CANTIDADES_PEDIDO, cantidadPedido, filasDeLaPantalla, type CantidadPedido, type FilaSugerencia } from "@/lib/compras/sugerencia";
import { CATEGORIAS_VIA } from "@/lib/compras/via";

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
async function miniaturas(filas: Pick<FilaSugerencia, "fotos">[]): Promise<(Buffer | null)[]> {
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
  // La cantidad: la del típico, la del mejor momento o el promedio (?cant=), elegida al lado del botón.
  const cant: CantidadPedido = CANTIDADES_PEDIDO.some(([k]) => k === sp.cant) ? (sp.cant as CantidadPedido) : "tipico";
  const filas = todas.map((x) => ({ ...x, pedir: cantidadPedido(x, cant) })).filter((x) => x.pedir > 0);
  const fotos = await miniaturas(filas);

  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet("Pedido", { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = [
    { header: "Foto", width: 14 },
    { header: "SKU", width: 14 },
    { header: "Producto", width: 60, style: { alignment: { wrapText: true, vertical: "middle" } } },
    { header: "Cantidad", width: 10, style: { numFmt: "#,##0", alignment: { vertical: "middle" } } },
    { header: "Precio US$", width: 12, style: { numFmt: "#,##0.00", alignment: { vertical: "middle" } } },
    { header: "Subtotal US$", width: 14, style: { numFmt: "#,##0.00", alignment: { vertical: "middle" } } },
    { header: "Vía", width: 22, style: { alignment: { vertical: "middle", wrapText: true } } },
    { header: "Ganancia por unidad $", width: 14, style: { numFmt: "#,##0", alignment: { vertical: "middle" } } },
    { header: "Ganancia total $", width: 16, style: { numFmt: "#,##0", alignment: { vertical: "middle" } } },
  ];
  h.getRow(1).font = { bold: true };
  filas.forEach((x, n) => {
    // El precio: el FOB de la ficha (Fer, 28/10: lo deja o lo borra antes de mandarlo); el subtotal, una fórmula.
    const r = n + 2;
    const fila = h.addRow([null, x.sku, x.titulo, x.pedir, x.fob_usd,
      { formula: `D${r}*E${r}`, result: x.fob_usd != null ? x.fob_usd * x.pedir : 0 }, CATEGORIAS_VIA[x.via].texto,
      // Lo que ganaría vendiendo lo que se pide (Fer, 28/10), en pesos: la ganancia por unidad de la pantalla (precio de venta −
      // Mercado Libre − costo puesto de su vía) por la cantidad; fórmula, para que siga a la cantidad si se cambia.
      x.ganancia_unit != null ? Math.round(x.ganancia_unit) : null,
      x.ganancia_unit != null ? { formula: `D${r}*H${r}`, result: Math.round(x.ganancia_unit) * x.pedir } : null]);
    fila.height = LADO * 0.75 + 6; // puntos
    fila.getCell(2).alignment = { vertical: "middle" };
    const foto = fotos[n];
    if (foto) {
      const id = libro.addImage({ buffer: foto as unknown as ExcelJS.Buffer, extension: "jpeg" });
      h.addImage(id, { tl: { col: 0.1, row: n + 1.05 }, ext: { width: LADO, height: LADO }, editAs: "oneCell" });
    }
  });
  const ult = filas.length + 1;
  h.addRow(["Total", null, `${filas.length} productos`, { formula: `SUM(D2:D${ult})`, result: filas.reduce((t, x) => t + x.pedir, 0) }, null,
    { formula: `SUM(F2:F${ult})`, result: filas.reduce((t, x) => t + (x.fob_usd ?? 0) * x.pedir, 0) },
    `Cantidad: ${CANTIDADES_PEDIDO.find(([k]) => k === cant)![1].toLowerCase()}`, null,
    { formula: `SUM(I2:I${ult})`, result: filas.reduce((t, x) => t + (x.ganancia_unit != null ? Math.round(x.ganancia_unit) * x.pedir : 0), 0) }]).font = { bold: true };

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
