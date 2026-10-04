"use server";

// Importar "Mis Comprobantes – Recibidos" de ARCA: subir el archivo (queda la
// vista previa) y confirmar (registra las nuevas). Lo hace
// lib/administracion/arca-mc.ts.

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, id, texto } from "@/lib/erp/acciones";
import { tienePermiso } from "@/lib/permisos";
import { crearCuenta } from "@/lib/administracion/contabilidad";
import { leerCsvArca, leerTablaArca } from "@/lib/administracion/arca-mc-leer";
import { guardarLote, importarLote } from "@/lib/administracion/arca-mc";
import { emisorDe } from "@/lib/arca/facturar";

const LISTA = "/compras/facturas";
const previa = (lote: number) => `${LISTA}/arca/${lote}`;

/** Las cuentas elegidas en los desplegables (cuenta_<CUIT>). */
function leerCuentas(fd: FormData) {
  const cuentas: Record<string, number | null> = {};
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^cuenta_(\d{11})$/);
    if (m) cuentas[m[1]] = Number(v) || null;
  }
  return cuentas;
}

/** La vista previa con las cuentas ya elegidas (?elegidas=CUIT:id,…), para
 *  no perderlas al volver de crear una cuenta. */
function previaCon(lote: number, cuentas: Record<string, number | null>, aviso?: string) {
  const elegidas = Object.entries(cuentas).filter(([, c]) => c).map(([cuit, c]) => `${cuit}:${c}`).join(",");
  const p = new URLSearchParams();
  if (elegidas) p.set("elegidas", elegidas);
  if (aviso) p.set("ok", aviso);
  const q = p.toString();
  return q ? `${previa(lote)}?${q}` : previa(lote);
}

/** El texto del CSV: UTF-8, o Windows-1252 si no es UTF-8 válido (los .csv viejos de ARCA). */
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

export async function accionSubirArca(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(LISTA, async () => {
    const archivo = fd.get("archivo");
    if (!(archivo instanceof File) || !archivo.size) throw new ErrorErp("Elegí el archivo que bajaste de ARCA.");
    if (archivo.size > 4_500_000) throw new ErrorErp("El archivo es muy grande. Bajá un mes por vez.");
    const buf = await archivo.arrayBuffer();
    const esExcel = /\.xlsx$/i.test(archivo.name);
    if (!esExcel && !/\.(csv|txt)$/i.test(archivo.name)) throw new ErrorErp("Tiene que ser el .csv (o el .xlsx) de \"Mis Comprobantes – Recibidos\".");
    const lectura = esExcel ? leerTablaArca(await tablaDeExcel(buf)) : leerCsvArca(decodificar(buf));
    // El archivo es del CUIT con el que se bajó de ARCA: la razón social elegida (o la principal).
    const emisor = await emisorDe(s.org.id, id(fd, "emisor") || null);
    const lote = await guardarLote(s.org.id, archivo.name, lectura, s.usuario.id, emisor?.id ?? null);
    return { ir: previa(lote) };
  });
}

export async function accionImportarArca(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const lote = id(fd, "lote");
  await intentar(previa(lote), async () => {
    const cuentas = leerCuentas(fd);
    const r = await importarLote(s.org.id, lote, cuentas, s.usuario.id);
    revalidatePath(LISTA);
    const partes = [`${r.cargadas} cargada${r.cargadas === 1 ? "" : "s"}`, `${r.yaEstaban} ya estaba${r.yaEstaban === 1 ? "" : "n"}`];
    if (r.distintas) partes.push(`${r.distintas} cargada${r.distintas === 1 ? "" : "s"} a mano distinta${r.distintas === 1 ? "" : "s"} (no se tocaron)`);
    if (r.errores.length) partes.push(`${r.errores.length} con error`);
    return `Listo: ${partes.join(", ")}.`;
  });
}

/** "Nueva cuenta" desde la vista previa: una cuenta de egreso imputable, con
 *  las mismas reglas que en Contabilidad (crearCuenta). Pide además el
 *  permiso de Contabilidad. Vuelve con lo elegido y, si se pidió, la cuenta
 *  nueva ya elegida para ese proveedor. */
export async function accionCrearCuentaArca(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const lote = id(fd, "lote");
  const cuentas = leerCuentas(fd);
  await intentar(previaCon(lote, cuentas), async () => {
    if (!tienePermiso(s.permisos, "contabilidad_ver")) throw new ErrorErp("Para crear cuentas contables hace falta el permiso de Contabilidad.");
    const codigo = texto(fd, "codigo"), nombre = texto(fd, "nombre");
    const cuentaId = await crearCuenta(s.org.id, { codigo, nombre, tipo: "egreso", imputable: true });
    const para = texto(fd, "para");
    if (para && para in cuentas) cuentas[para] = cuentaId;
    revalidatePath("/administracion/contabilidad");
    return { ir: previaCon(lote, cuentas, `Cuenta ${codigo} — ${nombre} creada${para && para in cuentas ? " y elegida para su proveedor" : ": ya está en los desplegables"}.`) };
  });
}
