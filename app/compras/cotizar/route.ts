// Excel para pedirle cotización al proveedor por lista de SKU (pedido de Fer, 2/11: «un Excel para Luis con fotos de los
// productos que se agregan y la consulta por los precios que subieron»). Por la dirección:
//   · items=SKU*cantidad,SKU*cantidad…  → hoja «New to quote»: foto, SKU, producto, cantidad y el precio vacío para que lo complete;
//   · nuevo=título|cantidad|link (puede repetirse) → un producto que todavía no tiene SKU, con su link de referencia;
//   · consulta=SKU*precio anterior,…     → hoja «Price check»: el precio anterior, el de la cotización nueva (el costo FOB de la
//     ficha, ya actualizado con ella), cuánto cambió y la pregunta de si es un error o un producto distinto.
// Sin foto propia (una unidad suelta de un pack), usa la del kit que la contiene. Textos en inglés: es para el proveedor.

import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { LADO_FOTO, miniaturas } from "@/lib/compras/fotos-excel";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const pares = (v: string | null) => (v ?? "").split(",").map((x) => x.trim().split("*")).filter((x) => x[0])
  .map(([sku, n]) => ({ sku: sku.trim(), n: Number(n) }));

export async function GET(req: NextRequest) {
  const s = await entrarErp("compras_ver");
  const sp = req.nextUrl.searchParams;
  const items = pares(sp.get("items")).filter((x) => Number.isFinite(x.n) && x.n > 0);
  const consultas = pares(sp.get("consulta")).filter((x) => Number.isFinite(x.n) && x.n > 0);
  const nuevos = sp.getAll("nuevo").map((x) => x.split("|")).map(([t, q, u]) => ({ titulo: t ?? "", q: Number(q) || null, url: u ?? null })).filter((x) => x.titulo);
  const skus = [...new Set([...items, ...consultas].map((x) => x.sku))];
  const info = new Map((await consulta<{ sku: string; titulo: string; fob: number | null; foto: string | null }>(`
    select v.sku, titulo_variacion(v.id) titulo, case when v.costo_moneda = 'USD' then v.costo_fob::float8 end fob,
           coalesce((select pf.url from producto_foto pf where pf.producto_id = v.producto_id order by pf.orden limit 1),
                    (select pf.url from kit_componente kc join variacion vk on vk.id = kc.variacion_kit_id
                       join producto_foto pf on pf.producto_id = vk.producto_id where kc.variacion_componente_id = v.id order by pf.orden limit 1)) foto
      from variacion v where v.organizacion_id = $1 and v.sku = any($2::text[])`, [s.org.id, skus])).map((x) => [x.sku, x]));

  const libro = new ExcelJS.Workbook();
  const alto = LADO_FOTO * 0.75 + 6; // puntos
  const ponerFotos = async (h: ExcelJS.Worksheet, urls: (string | null | undefined)[]) => {
    const fotos = await miniaturas(urls);
    fotos.forEach((f, n) => {
      if (!f) return;
      const id = libro.addImage({ buffer: f as unknown as ExcelJS.Buffer, extension: "jpeg" });
      h.addImage(id, { tl: { col: 0.1, row: n + 1.05 }, ext: { width: LADO_FOTO, height: LADO_FOTO }, editAs: "oneCell" });
    });
  };
  const centrado: Partial<ExcelJS.Alignment> = { vertical: "middle", wrapText: true };

  if (items.length || nuevos.length) {
    const h = libro.addWorksheet("New to quote", { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = [{ header: "Photo", width: 14 }, { header: "SKU", width: 14 }, { header: "Product", width: 55 }, { header: "Q", width: 8 },
      { header: "Price US$", width: 11, style: { numFmt: "0.00" } }, { header: "Note", width: 55 }];
    h.getRow(1).font = { bold: true };
    const urls: (string | null)[] = [];
    for (const it of items) {
      const x = info.get(it.sku);
      h.addRow([null, it.sku, x?.titulo ?? "", it.n, null, "Please quote."]);
      urls.push(x?.foto ?? null);
    }
    for (const nv of nuevos) {
      const r = h.addRow([null, "NEW", nv.titulo, nv.q, null, nv.url ? "Please quote. Reference:" : "Please quote."]);
      if (nv.url) r.getCell(6).value = { text: `Please quote. Reference: ${nv.url}`, hyperlink: nv.url };
      urls.push(null);
    }
    h.eachRow((r, i) => { if (i > 1) { r.height = alto; r.alignment = centrado; } });
    await ponerFotos(h, urls);
  }

  if (consultas.length) {
    const h = libro.addWorksheet("Price check", { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = [{ header: "Photo", width: 14 }, { header: "SKU", width: 14 }, { header: "Product", width: 50 },
      { header: "Previous price US$", width: 12, style: { numFmt: "0.00" } }, { header: "New quote US$", width: 12, style: { numFmt: "0.00" } },
      { header: "Change", width: 9, style: { numFmt: "+0%;-0%" } }, { header: "Question", width: 60 }];
    h.getRow(1).font = { bold: true };
    const urls: (string | null)[] = [];
    consultas.forEach((c, n) => {
      const x = info.get(c.sku);
      const r = n + 2;
      h.addRow([null, c.sku, x?.titulo ?? "", c.n, x?.fob ?? null, x?.fob != null ? { formula: `E${r}/D${r}-1`, result: x.fob / c.n - 1 } : null,
        "The price went up a lot compared with the previous one. Is it a mistake, or is it a different product/version? Please confirm."]);
      urls.push(x?.foto ?? null);
    });
    h.eachRow((r, i) => { if (i > 1) { r.height = alto; r.alignment = centrado; } });
    await ponerFotos(h, urls);
  }
  if (!libro.worksheets.length) libro.addWorksheet("Empty").addRow(["No items."]);

  const buffer = await libro.xlsx.writeBuffer();
  const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Quotation request ${fecha}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
