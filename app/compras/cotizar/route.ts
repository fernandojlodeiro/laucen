// Excel para mandarle al proveedor (pedido de Fer, 2/11), todo en un archivo y con las fotos de las fichas de Laucen:
//   · «Summary»: los renglones del resumen, si vienen;
//   · «Order»: el pedido (SKU, producto, cantidad, precio, total como fórmula); las cantidades que cambiaron contra la cotización,
//     en celeste con la nota «Quantity changed: antes → ahora»;
//   · «Not included»: lo cotizado que no va, con el motivo;
//   · «New to quote»: lo nuevo para que cotice, con el precio vacío (un producto sin SKU, con su link de referencia);
//   · «Price check»: el precio anterior, el de la cotización nueva (el costo FOB de la ficha, ya actualizado con ella), cuánto
//     cambió y la pregunta de si es un error o un producto distinto.
// Los datos salen de una cotización armada (?id=, tabla cotizacion_armada, db/compras.sql) o de la dirección:
//   items=SKU*cantidad,… (New to quote) · nuevo=título|cantidad|link (repetible) · consulta=SKU*precio anterior,… (Price check).
// Sin foto propia (una unidad suelta de un pack), usa la del kit que la contiene; un producto sin ficha puede traer su foto
// (JPG en base64). Textos en inglés: es para el proveedor.

import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una } from "@/lib/erp/base";
import { LADO_FOTO, miniaturas } from "@/lib/compras/fotos-excel";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Renglon = { sku?: string | null; titulo?: string | null; q?: number | null; precio?: number | null; antes?: number | null; nota?: string | null; link?: string | null; foto?: string | null };
type Cotizacion = { resumen?: string[]; pedido?: Renglon[]; fuera?: Renglon[]; nuevos?: Renglon[]; consulta?: Renglon[] };

const pares = (v: string | null) => (v ?? "").split(",").map((x) => x.trim().split("*")).filter((x) => x[0])
  .map(([sku, n]) => ({ sku: sku.trim(), n: Number(n) })).filter((x) => Number.isFinite(x.n) && x.n > 0);

/** Lo que pide la dirección, cuando no viene una cotización armada. */
function deLaDireccion(sp: URLSearchParams): Cotizacion {
  return {
    nuevos: [...pares(sp.get("items")).map((x) => ({ sku: x.sku, q: x.n })),
      ...sp.getAll("nuevo").map((x) => x.split("|")).filter(([t]) => t).map(([t, q, u]) => ({ titulo: t, q: Number(q) || null, link: u || null }))],
    consulta: pares(sp.get("consulta")).map((x) => ({ sku: x.sku, antes: x.n })),
  };
}

export async function GET(req: NextRequest) {
  const s = await entrarErp("compras_ver");
  const sp = req.nextUrl.searchParams;
  const id = Number(sp.get("id"));
  const guardada = Number.isInteger(id) && id > 0
    ? await una<{ titulo: string | null; datos: Cotizacion }>("select titulo, datos from cotizacion_armada where id = $1 and organizacion_id = $2", [id, s.org.id]) : null;
  const c: Cotizacion = guardada?.datos ?? deLaDireccion(sp);
  const todos = [...(c.pedido ?? []), ...(c.fuera ?? []), ...(c.nuevos ?? []), ...(c.consulta ?? [])];
  const skus = [...new Set(todos.map((x) => x.sku).filter((x): x is string => !!x))];
  const info = new Map((await consulta<{ sku: string; titulo: string; fob: number | null; foto: string | null }>(`
    select v.sku, titulo_variacion(v.id) titulo, case when v.costo_moneda = 'USD' then v.costo_fob::float8 end fob,
           coalesce((select pf.url from producto_foto pf where pf.producto_id = v.producto_id order by pf.orden limit 1),
                    (select pf.url from kit_componente kc join variacion vk on vk.id = kc.variacion_kit_id
                       join producto_foto pf on pf.producto_id = vk.producto_id where kc.variacion_componente_id = v.id order by pf.orden limit 1)) foto
      from variacion v where v.organizacion_id = $1 and v.sku = any($2::text[])`, [s.org.id, skus])).map((x) => [x.sku, x]));
  const titulo = (x: Renglon) => x.titulo ?? (x.sku ? info.get(x.sku)?.titulo : null) ?? "";

  const libro = new ExcelJS.Workbook();
  const alto = LADO_FOTO * 0.75 + 6; // puntos
  const centrado: Partial<ExcelJS.Alignment> = { vertical: "middle", wrapText: true };
  const CELESTE: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
  /** Las fotos de una hoja, una por renglón desde la fila 2: la de la ficha o la que trae el renglón. */
  const ponerFotos = async (h: ExcelJS.Worksheet, rs: Renglon[]) => {
    const bajadas = await miniaturas(rs.map((x) => (x.foto ? null : x.sku ? info.get(x.sku)?.foto : null)));
    rs.forEach((x, n) => {
      const f = x.foto ? Buffer.from(x.foto, "base64") : bajadas[n];
      if (!f) return;
      const img = libro.addImage({ buffer: f as unknown as ExcelJS.Buffer, extension: "jpeg" });
      h.addImage(img, { tl: { col: 0.1, row: n + 1.05 }, ext: { width: LADO_FOTO, height: LADO_FOTO }, editAs: "oneCell" });
    });
  };
  const formatear = (h: ExcelJS.Worksheet, hasta: number) => h.eachRow((r, i) => { if (i > 1 && i <= hasta) { r.height = alto; r.alignment = centrado; } });

  if (c.resumen?.length) {
    const h = libro.addWorksheet("Summary");
    h.getColumn(1).width = 110;
    for (const t of c.resumen) h.addRow([t]);
    h.getRow(1).font = { bold: true };
  }

  if (c.pedido?.length) {
    const rs = c.pedido;
    const h = libro.addWorksheet("Order", { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = [{ header: "Photo", width: 14 }, { header: "SKU", width: 14 }, { header: "Product", width: 55 }, { header: "Q", width: 8 },
      { header: "PRICE", width: 10, style: { numFmt: "0.00##" } }, { header: "TOTAL", width: 11, style: { numFmt: "#,##0.00" } }, { header: "NOTE", width: 40 }];
    h.getRow(1).font = { bold: true };
    rs.forEach((x, n) => {
      const r = n + 2;
      const cambio = x.antes != null && x.antes !== x.q;
      const fila = h.addRow([null, x.sku ?? "new product", titulo(x), x.q, x.precio, { formula: `D${r}*E${r}`, result: (x.q ?? 0) * (x.precio ?? 0) },
        cambio ? `Quantity changed: ${x.antes} → ${x.q}` : x.nota ?? null]);
      if (cambio) fila.eachCell({ includeEmpty: true }, (cel) => { cel.fill = CELESTE; });
    });
    const ult = rs.length + 1;
    h.addRow([null, "Total", `${rs.length} products`, { formula: `SUM(D2:D${ult})` }, null,
      { formula: `SUM(F2:F${ult})`, result: rs.reduce((t, x) => t + (x.q ?? 0) * (x.precio ?? 0), 0) }, null]).font = { bold: true };
    formatear(h, ult);
    await ponerFotos(h, rs);
  }

  if (c.fuera?.length) {
    const h = libro.addWorksheet("Not included");
    h.columns = [{ header: "Photo", width: 14 }, { header: "SKU", width: 14 }, { header: "Product", width: 55 }, { header: "Q quoted", width: 10 },
      { header: "PRICE", width: 10, style: { numFmt: "0.00##" } }, { header: "Reason", width: 50 }];
    h.getRow(1).font = { bold: true };
    for (const x of c.fuera) h.addRow([null, x.sku, titulo(x), x.q, x.precio, x.nota ?? "Cancelled"]);
    formatear(h, c.fuera.length + 1);
    await ponerFotos(h, c.fuera);
  }

  if (c.nuevos?.length) {
    const h = libro.addWorksheet("New to quote", { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = [{ header: "Photo", width: 14 }, { header: "SKU", width: 14 }, { header: "Product", width: 55 }, { header: "Q", width: 8 },
      { header: "Price US$", width: 11, style: { numFmt: "0.00" } }, { header: "Note", width: 55 }];
    h.getRow(1).font = { bold: true };
    for (const x of c.nuevos) {
      const r = h.addRow([null, x.sku ?? "NEW", titulo(x), x.q, null, x.nota ?? "Please quote."]);
      if (x.link) r.getCell(6).value = { text: `${x.nota ?? "Please quote."} Reference: ${x.link}`, hyperlink: x.link };
    }
    formatear(h, c.nuevos.length + 1);
    await ponerFotos(h, c.nuevos);
  }

  if (c.consulta?.length) {
    const h = libro.addWorksheet("Price check", { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = [{ header: "Photo", width: 14 }, { header: "SKU", width: 14 }, { header: "Product", width: 50 },
      { header: "Previous price US$", width: 12, style: { numFmt: "0.00" } }, { header: "New quote US$", width: 12, style: { numFmt: "0.00" } },
      { header: "Change", width: 9, style: { numFmt: "+0%;-0%" } }, { header: "Question", width: 60 }];
    h.getRow(1).font = { bold: true };
    c.consulta.forEach((x, n) => {
      const r = n + 2;
      const nuevo = x.precio ?? (x.sku ? info.get(x.sku)?.fob : null) ?? null;
      h.addRow([null, x.sku, titulo(x), x.antes, nuevo, nuevo != null && x.antes ? { formula: `E${r}/D${r}-1`, result: nuevo / x.antes - 1 } : null,
        x.nota ?? "The price went up a lot compared with the previous one. Is it a mistake, or is it a different product/version? Please confirm."]);
    });
    formatear(h, c.consulta.length + 1);
    await ponerFotos(h, c.consulta);
  }
  if (!libro.worksheets.length) libro.addWorksheet("Empty").addRow(["No items."]);

  const buffer = await libro.xlsx.writeBuffer();
  const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  const nombre = (guardada?.titulo ?? `Quotation request ${fecha}`).replace(/[^\w .-]+/g, "");
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
