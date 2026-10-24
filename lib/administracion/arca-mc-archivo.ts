// El archivo de "Mis Comprobantes – Recibidos" de ARCA (.xlsx o .csv) leído a comprobantes: lo usan la importación de
// facturas de compra y la de compras de períodos anteriores en Libros de IVA.

import ExcelJS from "exceljs";
import { ErrorErp } from "@/lib/erp/base";
import { leerCsvArca, leerTablaArca } from "@/lib/administracion/arca-mc-leer";

export async function leerArchivoArca(buf: ArrayBuffer, esExcel: boolean) {
  return esExcel ? leerTablaArca(await tablaDeExcel(buf)) : leerCsvArca(decodificar(buf));
}

function decodificar(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** La primera hoja del Excel como tabla de celdas (fechas → AAAA-MM-DD). */
async function tablaDeExcel(buf: ArrayBuffer): Promise<(string | number | null)[][]> {
  const libro = new ExcelJS.Workbook();
  try { await libro.xlsx.load(buf); } catch { throw new ErrorErp("No se pudo leer el Excel. Bajá de ARCA el .csv o el .xlsx de \"Mis Comprobantes – Recibidos\"."); }
  const hoja = libro.worksheets[0];
  if (!hoja) throw new ErrorErp("El Excel no tiene hojas.");
  const tabla: (string | number | null)[][] = [];
  hoja.eachRow({ includeEmpty: true }, (fila) => {
    const celdas: (string | number | null)[] = [];
    for (let i = 1; i <= Math.max(hoja.actualColumnCount, fila.cellCount); i++) {
      const v = fila.getCell(i).value as unknown;
      celdas.push(v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "number" ? v
        : typeof v === "object" && v && "result" in v ? (v as { result: string | number }).result ?? null
        : typeof v === "object" && v && "richText" in v ? (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("") : String(v));
    }
    tabla.push(celdas);
  });
  return tabla;
}
