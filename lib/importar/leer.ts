// Lee un .xlsx o un .csv y deja sus filas en `importacion_fila` (una por renglón, como
// {columna: valor}). Fechas → texto ISO, números → número, el resto → texto.
// Los inserts van de a lotes para aguantar decenas de miles de filas.

import ExcelJS from "exceljs";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { mapeoSugerido, type Destino } from "@/lib/importar/campos";

export type Valor = string | number | boolean | null;
export type Hoja = { columnas: string[]; filas: { n: number; datos: Record<string, Valor> }[] };

const LOTE = 500;

/** Abre el libro. Tira ErrorErp si no es un .xlsx que se pueda leer. */
export async function abrirLibro(contenido: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(contenido);
  } catch {
    throw new ErrorErp("No se pudo leer el archivo. Tiene que ser un Excel .xlsx, el .xls que exporta Virtual Seller o un .csv (si es un .xls viejo de otro lado, abrilo y guardalo como .xlsx).");
  }
  if (!libro.worksheets.length) throw new ErrorErp("El archivo no tiene hojas.");
  return libro;
}

/** Una fecha de Excel como texto: "2026-03-15" o "2026-03-15T14:30:00".
 *  ExcelJS entrega la hora tal cual se ve en la planilla, marcada como UTC:
 *  se lee como hora argentina (sin zona). */
function fechaIso(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  return iso.slice(11, 19) === "00:00:00" ? iso.slice(0, 10) : iso.slice(0, 19);
}

function valorCelda(v: ExcelJS.CellValue): Valor {
  if (v == null) return null;
  if (v instanceof Date) return fechaIso(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return limpiar(v);
  if (typeof v === "object") {
    if ("result" in v) return valorCelda((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ("richText" in v) return limpiar(v.richText.map((t) => t.text).join(""));
    if ("text" in v) return limpiar(String((v as { text: unknown }).text ?? ""));
    if ("error" in v) return null;
  }
  return limpiar(String(v));
}

/** Sin espacios de más ni caracteres que la base no acepta en JSON. */
function limpiar(s: string): string | null {
  const t = s.replace(/\u0000/g, "").trim();
  return t === "" ? null : t;
}

/** Toma una hoja: la primera fila son los encabezados; las filas vacías no
 *  cuentan. `n` es el número de fila en el Excel (la primera de datos es la 2). */
export function leerHoja(hoja: ExcelJS.Worksheet): Hoja {
  const encabezado = hoja.getRow(1);
  const ancho = Math.max(hoja.actualColumnCount, encabezado.cellCount);
  const columnas: string[] = [];
  const indices: number[] = [];
  const usados = new Map<string, number>();
  for (let i = 1; i <= ancho; i++) {
    const v = valorCelda(encabezado.getCell(i).value);
    let nombre = v == null ? "" : String(v).replace(/\s+/g, " ");
    if (!nombre) {
      // Columna sin encabezado: sólo si tiene algún dato.
      let tiene = false;
      hoja.eachRow((fila, n) => { if (!tiene && n > 1 && fila.getCell(i).value != null) tiene = true; });
      if (!tiene) continue;
      nombre = `Columna ${i}`;
    }
    const veces = (usados.get(nombre) ?? 0) + 1;
    usados.set(nombre, veces);
    columnas.push(veces > 1 ? `${nombre} (${veces})` : nombre);
    indices.push(i);
  }
  if (!columnas.length) throw new ErrorErp("La primera fila de la hoja está vacía: tiene que tener los nombres de las columnas.");

  const filas: Hoja["filas"] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, n) => {
    if (n === 1) return;
    const datos: Record<string, Valor> = {};
    let alguno = false;
    indices.forEach((i, k) => {
      const v = valorCelda(fila.getCell(i).value);
      if (v != null) { datos[columnas[k]] = v; alguno = true; }
    });
    if (alguno) filas.push({ n, datos });
  });
  return { columnas, filas };
}

/** Lee un .csv: detecta la codificación (UTF-8, o si no Windows-1252, como
 *  exporta Excel en castellano) y el separador (";" como lo guarda Excel en
 *  Argentina, "," o tabulador). Respeta comillas ("a; b" es un solo valor, ""
 *  es una comilla). La primera fila son los encabezados. Los valores quedan
 *  como texto: después se leen como número o fecha según el campo ("1.234,5",
 *  "15/03/2026"). */
export function leerCsv(contenido: ArrayBuffer): Hoja {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(contenido);
  } catch {
    texto = new TextDecoder("windows-1252").decode(contenido);
  }
  texto = texto.replace(/^\uFEFF/, "");
  const primera = texto.slice(0, texto.search(/\r?\n/) >>> 0 || texto.length);
  const contar = (c: string) => primera.split(c).length - 1;
  const sep = [";", ",", "\t"].reduce((a, b) => (contar(b) > contar(a) ? b : a));

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += c;
    } else if (c === '"' && campo === "") comillas = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); filas.push(fila); fila = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }

  const { columnas, indices } = columnasDe(filas[0] ?? [], filas.slice(1));
  return filasDeTexto(columnas, indices, filas.slice(1));
}

/** Arma las filas de datos a partir de los renglones de texto. Los reportes
 *  de Virtual Seller (Salesforce) terminan con un renglón vacío y un pie
 *  ("Clientes y proveedores", "Copyright…", "Generado por…"): lo que viene
 *  después del primer renglón vacío no se lee. */
function filasDeTexto(columnas: string[], indices: number[], renglones: string[][]): Hoja {
  const salida: Hoja["filas"] = [];
  for (const [k, f] of renglones.entries()) {
    const datos: Record<string, Valor> = {};
    let alguno = false;
    indices.forEach((i, j) => {
      const v = limpiar(f[i] ?? "");
      if (v != null) { datos[columnas[j]] = v; alguno = true; }
    });
    if (!alguno) {
      if (salida.length) break;
      continue;
    }
    salida.push({ n: k + 2, datos });
  }
  return { columnas, filas: salida };
}

/** Arma columnas e índices desde el renglón de encabezados (sin columnas
 *  vacías; repetidos con "(2)"). */
function columnasDe(encabezado: string[], renglones: string[][]) {
  const columnas: string[] = [];
  const indices: number[] = [];
  const usados = new Map<string, number>();
  const ancho = Math.max(encabezado.length, ...renglones.map((f) => f.length));
  for (let i = 0; i < ancho; i++) {
    let nombre = (limpiar(encabezado[i] ?? "") ?? "").replace(/\s+/g, " ");
    if (!nombre) {
      if (!renglones.some((f) => limpiar(f[i] ?? ""))) continue;
      nombre = `Columna ${i + 1}`;
    }
    const veces = (usados.get(nombre) ?? 0) + 1;
    usados.set(nombre, veces);
    columnas.push(veces > 1 ? `${nombre} (${veces})` : nombre);
    indices.push(i);
  }
  if (!columnas.length) throw new ErrorErp("La primera fila del archivo está vacía: tiene que tener los nombres de las columnas.");
  return { columnas, indices };
}

/** ¿El archivo es en realidad una página HTML con una tabla? Así exporta
 *  Virtual Seller sus "Excel" (.xls). */
export function esHtml(contenido: ArrayBuffer): boolean {
  const inicio = new TextDecoder("utf-8").decode(contenido.slice(0, 2048)).trimStart().toLowerCase();
  return inicio.startsWith("<") && inicio.includes("<table") || inicio.startsWith("<html") || inicio.startsWith("<head");
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const desescapar = (t: string) => t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e.toLowerCase()] ?? m);

/** Lee la primera tabla de un "Excel" que es HTML. */
export function leerHtml(contenido: ArrayBuffer): Hoja {
  let texto: string;
  try { texto = new TextDecoder("utf-8", { fatal: true }).decode(contenido); }
  catch { texto = new TextDecoder("windows-1252").decode(contenido); }
  const renglones = [...texto.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) =>
      desescapar(c[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()));
  if (!renglones.length) throw new ErrorErp("El archivo no tiene ninguna tabla para leer.");
  const { columnas, indices } = columnasDe(renglones[0], renglones.slice(1));
  return filasDeTexto(columnas, indices, renglones.slice(1));
}

/** Crea la importación con sus filas y devuelve su id. El mapeo arranca con
 *  lo que se reconoce por el nombre de las columnas. */
export async function guardarImportacion(org: string, args: {
  destino: Destino; archivo: string; ruta: string; hoja: string; datos: Hoja; usuarioId: string;
}): Promise<number> {
  const { columnas, filas } = args.datos;
  if (!filas.length) throw new ErrorErp("La hoja no tiene filas con datos debajo de los encabezados.");
  const imp = await una<{ id: number }>(`
    insert into importacion (organizacion_id, destino, archivo, ruta_storage, hoja, columnas, mapeo, filas_total, usuario_id)
    values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) returning id::int`,
    [org, args.destino, args.archivo, args.ruta, args.hoja, JSON.stringify(columnas),
      JSON.stringify(mapeoSugerido(args.destino, columnas)), filas.length, args.usuarioId]);
  const id = imp!.id;
  try {
    for (let i = 0; i < filas.length; i += LOTE) {
      await consulta(`
        insert into importacion_fila (organizacion_id, importacion_id, n, datos)
        select $1, $2, x.n, x.datos from jsonb_to_recordset($3::jsonb) as x(n int, datos jsonb)`,
        [org, id, JSON.stringify(filas.slice(i, i + LOTE))]);
    }
  } catch (e) {
    // Sin filas a medias: si falla un lote, la importación no queda.
    await consulta("delete from importacion where id = $1 and organizacion_id = $2", [id, org]).catch(() => {});
    throw e;
  }
  return id;
}
