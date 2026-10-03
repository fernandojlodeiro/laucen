// Descarga en Excel de un informe: columnas con su ancho y formato, encabezado
// en negrita y fijo, filtros de Excel prendidos y, si hay, filas de total al final.

import ExcelJS from "exceljs";

export type ColumnaExcel<T> = {
  titulo: string; valor: (f: T) => string | number | Date | null; ancho?: number;
  formato?: "entero" | "importe" | "texto" | "decimal" | "pct" | "fecha" | "fechahora";
};

// Las fechas van como Date en UTC con la fecha/hora argentina ya puesta (Excel no tiene zonas).
const FORMATOS = {
  entero: "#,##0", importe: "#,##0.00", texto: "@", decimal: "#,##0.00##", pct: '0.0" %"', fecha: "dd/mm/yyyy", fechahora: "dd/mm/yyyy hh:mm",
};

export async function respuestaExcel<T>(nombre: string, hoja: string, columnas: ColumnaExcel<T>[], filas: T[], totales: (string | number | null)[][] = []) {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet(hoja.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho ?? 14, style: c.formato && c.formato !== "texto" ? { numFmt: FORMATOS[c.formato] } : {} }));
  h.getRow(1).font = { bold: true };
  for (const f of filas) h.addRow(columnas.map((c) => c.valor(f)));
  h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  for (const t of totales) h.addRow(t).font = { bold: true };
  const buffer = await libro.xlsx.writeBuffer();
  const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // El nombre puede tener acentos: va en ASCII y, aparte, en UTF-8.
      "Content-Disposition": `attachment; filename="${`${nombre} ${fecha}`.normalize("NFD").replace(/[^\x20-\x7E]/g, "")}.xlsx"; filename*=UTF-8''${encodeURIComponent(`${nombre} ${fecha}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
