// Lee un Excel "Importaciones Detalladas" de Softrade (hoja Detalle, 36
// columnas A..AJ) y lo deja listo para softrade_items / softrade_subitems.
// Reglas en docs/orden-arca-importaciones.md, sección 7B.

import ExcelJS from "exceljs";

// Encabezados exactos de la fila 1 (se chequean: si Softrade cambia el
// formato, que falle ruidoso y no cargue columnas corridas).
const ENCABEZADOS = [
  "Identificador", "Item", "Fecha", "Tipo de Dato", "NCM-SIM", "Importador", "Localidad", "Destinación",
  "Aduana", "Via Transporte", "País de Origen", "País de Procedencia", "U$S Unitario", "U$S FOB",
  "Flete U$S", "Seguro U$S", "U$S CIF", "Cant. Estad.", "Un. Medida Estad.", "Cantidad", "Unidad de Medida",
  "Kgs. Netos", "Kgs. Brutos", "Derecho", "% Dere.", "Acuerdo ALADI", "Item", "Marca - Sufijos", "Cantidad",
  "Unitario Divisa", "FOB Divisa", "Moneda Divisa", "Condición de Venta", "Marca o Descripcion",
  "Descripcion Arancelaria", "Modelo",
];

const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function valor(celda) {
  const v = celda?.value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null;                         // fórmula
    if ("richText" in v) return v.richText.map((t) => t.text).join(""); // texto con formato
    if ("text" in v) return v.text;                                     // hipervínculo
  }
  return v;
}

const NO_DISP = /^no disponible$/i;

function texto(v) {
  if (v == null) return null;
  const t = (v instanceof Date ? v.toISOString() : String(v)).replace(/\s+/g, " ").trim();
  return t === "" || NO_DISP.test(t) ? null : t;
}

function numero(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  let t = String(v).trim();
  if (!t || NO_DISP.test(t)) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fecha(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Sufijos crudos (col AH), ej. "AA(INTELBRAS)-AI(4770537 MRM 537)-NA00-NB00-NC00-`". */
export function parsearSufijos(raw) {
  const r = { marca: null, codigo_articulo: null, atributos: {} };
  if (!raw) return r;
  const s = String(raw).replace(/`\s*$/, "");
  // XX(valor) —el valor puede traer guiones o paréntesis— o XXnn.
  const re = /([A-Z]{2})(?:\(([\s\S]*?)\)(?=\s*(?:-\s*[A-Z]{2}|-?\s*`|-?\s*$))|(\d+))/g;
  for (const m of s.matchAll(re)) {
    const [, clave, entre, digitos] = m;
    const v = (entre ?? digitos ?? "").replace(/\s+/g, " ").trim();
    if (clave === "AA") r.marca = v === "" || /^S\/?M$/i.test(v) ? "S/M" : v;
    else if (clave === "AI") r.codigo_articulo = v || null;
    else r.atributos[clave] = v;
  }
  return r;
}

export async function leerSoftrade(archivo) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const hoja = wb.worksheets.find((h) => normalizar(h.name) === "detalle");
  if (!hoja) throw new Error("El Excel no tiene la hoja 'Detalle'");

  const cab = hoja.getRow(1);
  const distintos = ENCABEZADOS
    .map((e, i) => [e, texto(valor(cab.getCell(i + 1))) ?? ""])
    .filter(([e, real]) => normalizar(e) !== normalizar(real));
  if (distintos.length) {
    throw new Error(`Encabezados distintos a los esperados: ${distintos.slice(0, 5).map(([e, r]) => `'${r}' en vez de '${e}'`).join(", ")}`);
  }

  const items = new Map();
  const subitems = [];
  let filas = 0;
  for (let n = 2; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);
    const v = (col) => valor(fila.getCell(col));
    const destinacion = texto(v(1));
    const numItem = numero(v(2));
    if (!destinacion || numItem == null) continue;
    filas++;
    const clave = `${destinacion}|${numItem}`;
    // Los campos del ítem (M..Z) vienen sólo en la primera fila del grupo;
    // en las siguientes vienen en 0 o "No disponible": nunca se suman.
    if (!items.has(clave)) {
      items.set(clave, {
        destinacion, num_item: numItem, fecha: fecha(v(3)), tipo_dato: texto(v(4)), ncm_sim: texto(v(5)),
        importador: texto(v(6)), localidad: texto(v(7)), destinacion_tipo: texto(v(8)), aduana: texto(v(9)),
        via: texto(v(10)), pais_origen: texto(v(11)), pais_procedencia: texto(v(12)),
        usd_unitario: numero(v(13)), usd_fob: numero(v(14)), flete_usd: numero(v(15)), seguro_usd: numero(v(16)),
        usd_cif: numero(v(17)), cant_estad: numero(v(18)), un_estad: texto(v(19)), cantidad: numero(v(20)),
        unidad: texto(v(21)), kg_netos: numero(v(22)), kg_brutos: numero(v(23)), derecho_usd: numero(v(24)),
        derecho_pct: numero(v(25)), acuerdo_aladi: texto(v(26)),
      });
    }
    const sufijosRaw = v(34) == null ? null : String(v(34));
    const suf = parsearSufijos(sufijosRaw);
    subitems.push({
      destinacion, num_item: numItem,
      num_subitem: numero(v(27)) ?? subitems.filter((s) => s.destinacion === destinacion && s.num_item === numItem).length + 1,
      marca_texto: texto(v(28)), cantidad: numero(v(29)), unitario_divisa: numero(v(30)), fob_divisa: numero(v(31)),
      moneda: texto(v(32)), incoterm: texto(v(33)), sufijos_raw: sufijosRaw,
      marca: suf.marca, codigo_articulo: suf.codigo_articulo, atributos: suf.atributos,
      descripcion_arancelaria: texto(v(35)), modelo: texto(v(36)),
    });
  }

  const param = wb.worksheets.find((h) => normalizar(h.name).startsWith("parametro"));
  const parametros = [];
  param?.eachRow((fila) => {
    const celdas = [];
    fila.eachCell((c) => { const t = texto(valor(c)); if (t) celdas.push(t); });
    if (celdas.length) parametros.push(celdas.join(": "));
  });

  return { filas, items: [...items.values()], subitems, parametros: parametros.join("\n") || null };
}
