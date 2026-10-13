// Lee un invoice de compra (pedido de Fer, 12/10): los Excel de los proveedores de China no son todos iguales, pero
// todos tienen arriba la fecha (y casi siempre el número) y abajo una tabla con SKU, cantidad y precio. Esto busca
// solo el renglón de títulos de la tabla y, arriba de él, la fecha y el número. Sin base: lo prueban los tests.
//
// La fecha puede venir de muchas formas: como fecha de Excel, «2025-10-05», «05/10/2025», «10/05/2025» (en inglés va
// el mes primero), «Oct. 5, 2025», «5-Oct-2025», «2025年10月5日». Cuando día y mes son los dos 12 o menos no hay forma
// de saber cuál es cuál: si el invoice está en inglés se toma el mes primero, si no el día primero, y se marca como
// dudosa para revisarla en la vista previa.

export type Celda = string | number | boolean | null;

export type RenglonInvoice = { fila: number; sku: string; descripcion: string | null; cantidad: number; precio: number | null };

export type InvoiceLeido = {
  fecha: string | null; fechaTexto: string | null; fechaDudosa: boolean; numero: string | null;
  renglones: RenglonInvoice[]; avisos: string[];
};

const normal = (v: Celda): string =>
  v == null ? "" : String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Títulos de columna que se reconocen (sin acentos ni mayúsculas). El orden importa: el primero que aparece gana.
const T_SKU = [/^(sku|sku ?no\.?|sku ?code|item ?(no|number|code|#)\.?|model ?(no|number)?\.?|part ?(no|number)\.?|product ?(code|no)\.?|art(icle|iculo)? ?(no|code)?\.?|code|codigo|cod\.?|货号|型号|编号|产品编号)$/,
  /\bsku\b|货号|型号/];
const T_CANT = [/^(qty|q|q'?ty|quantity|pcs|cantidad|cant\.?|units?|unidades|a comprar|comprar|pedido|数量)(\s*\(.*\))?$/, /\bqty\b|quantity|cantidad|数量/];
const T_PRECIO = [/^(unit ?price|price|precio( unitario)?|u\.? ?price|fob( price)?|单价|价格)(\s*\(.*\))?$/, /unit ?price|单价|^price\b|precio unit/];
const T_TOTAL = [/^(amount|total|total ?amount|importe|subtotal|金额|总价)(\s*\(.*\))?$/, /amount|金额|总价/];
const T_DESC = [/^(description|descripcion|product ?name|name|item ?name|product|producto|detalle|goods|品名|描述|名称)(\s*\(.*\))?$/, /description|descripcion|品名|名称/];

/** Un SKU con el formato de la casa: «SKU00377», «SKU03142-U». */
export const ES_SKU_PROPIO = /^sku\s*-?\d{3,}/i;

function columna(titulos: string[], reglas: RegExp[], usadas: Set<number>): number {
  for (const r of reglas) {
    const i = titulos.findIndex((t, k) => !usadas.has(k) && t && r.test(t));
    if (i >= 0) return i;
  }
  return -1;
}

/** Un número escrito como sea: 1.25, "1,25", "US$ 1,234.50", "1.234,50". */
export function numeroInvoice(v: Celda): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  const coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (coma >= 0) t = /,\d{3}$/.test(t) && (t.match(/,/g)!.length > 1 || !/^-?0,/.test(t)) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const MESES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  ene: 1, abr: 4, ago: 8, dic: 12,
};
const mesDe = (t: string): number | null => MESES[t.slice(0, 4)] ?? MESES[t.slice(0, 3)] ?? null;

const iso = (a: number, m: number, d: number): string | null => {
  if (a < 100) a += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 2000 || a > 2100) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCMonth() === m - 1 ? f.toISOString().slice(0, 10) : null;
};

/** Una fecha en cualquiera de sus formas. `mesPrimero`: cómo leer 05/10/2025 cuando día y mes son ambiguos. */
export function fechaInvoice(v: Celda, mesPrimero: boolean): { fecha: string; dudosa: boolean } | null {
  if (v == null || typeof v === "boolean") return null;
  if (typeof v === "number") {
    // Número de serie de Excel (días desde 1899-12-30), entre 2010 y 2040.
    if (v < 40179 || v > 51500) return null;
    return { fecha: new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10), dudosa: false };
  }
  const t = normal(v);
  let m = t.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/) ?? t.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) { const f = iso(+m[1], +m[2], +m[3]); return f ? { fecha: f, dudosa: false } : null; }
  // «Oct. 5, 2025», «October 5th 2025»
  m = t.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && mesDe(m[1])) { const f = iso(+m[3], mesDe(m[1])!, +m[2]); if (f) return { fecha: f, dudosa: false }; }
  // «5-Oct-2025», «5 October 2025», «05 oct. 25», «5 de octubre de 2025»
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+(?:de\s+)?([a-z]{3,9})\.?[\s\-/.,]+(?:de\s+)?(\d{2,4})\b/);
  if (m && mesDe(m[2])) { const f = iso(+m[3], mesDe(m[2])!, +m[1]); if (f) return { fecha: f, dudosa: false }; }
  // «2025-Oct-05»
  m = t.match(/\b(\d{4})[\s\-/.]+([a-z]{3,9})\.?[\s\-/.]+(\d{1,2})\b/);
  if (m && mesDe(m[2])) { const f = iso(+m[1], mesDe(m[2])!, +m[3]); if (f) return { fecha: f, dudosa: false }; }
  // 05/10/2025, 10-05-25
  m = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const a = +m[1], b = +m[2], anio = +m[3];
    if (a > 12) { const f = iso(anio, b, a); return f ? { fecha: f, dudosa: false } : null; }
    if (b > 12) { const f = iso(anio, a, b); return f ? { fecha: f, dudosa: false } : null; }
    const f = mesPrimero ? iso(anio, a, b) : iso(anio, b, a);
    return f ? { fecha: f, dudosa: a !== b } : null;
  }
  return null;
}

const ES_FECHA = /^(invoice ?)?(date|fecha|dated|issue ?date|fecha de emision|日期|开票日期)\b/;
const ES_NUMERO = /^(invoice ?(no|number|#)|inv\.? ?(no|#)|p\.?i\.? ?(no|#)?|proforma ?invoice ?(no|#)?|order ?(no|#)|contract ?(no|#)|no\.|n[ro°º]\.?|numero|factura ?(n[ro°º]|#)?|发票号|合同号)\.?\b/;

/** Lo que sigue a un rótulo: en la misma celda después de «:», o la próxima celda con algo distinto. */
function despuesDe(fila: Celda[], k: number): Celda[] {
  const propio = String(fila[k] ?? "");
  const salida: Celda[] = [];
  const dos = propio.match(/[:：]\s*(.+)$/);
  if (dos) salida.push(dos[1].trim());
  for (let j = k + 1; j < fila.length && salida.length < 3; j++) {
    if (fila[j] == null || fila[j] === "" || fila[j] === fila[k]) continue;
    salida.push(fila[j]);
  }
  return salida;
}

/** Las columnas [precio, total] tales que cantidad × precio ≈ total en la mayoría de los renglones. */
function precioPorCuentas(filas: Celda[][], cCant: number): [number, number] | null {
  const ancho = Math.max(0, ...filas.map((f) => f.length));
  let mejor: [number, number] | null = null, mejorN = 0;
  for (let a = 0; a < ancho; a++) {
    for (let b = 0; b < ancho; b++) {
      if (a === b || a === cCant || b === cCant) continue;
      let n = 0, con = 0;
      for (const f of filas) {
        const q = numeroInvoice(f[cCant]), p = numeroInvoice(f[a]), t = numeroInvoice(f[b]);
        if (q == null || p == null || t == null || q <= 0) continue;
        con++;
        if (t > 0 && Math.abs(q * p - t) <= Math.max(0.02, t * 0.01)) n++;
      }
      if (con >= 2 && n >= con * 0.6 && n > mejorN) { mejor = [a, b]; mejorN = n; }
    }
  }
  return mejor;
}

export function leerInvoice(filas: Celda[][]): InvoiceLeido {
  const avisos: string[] = [];
  // El renglón de títulos: el primero que tiene SKU, cantidad y precio (o total).
  let cab = -1, cSku = -1, cCant = -1, cPrecio = -1, cTotal = -1, cDesc = -1;
  for (let i = 0; i < Math.min(filas.length, 80) && cab < 0; i++) {
    const titulos = filas[i].map(normal);
    const usadas = new Set<number>();
    const cant = columna(titulos, T_CANT, usadas); if (cant < 0) continue; usadas.add(cant);
    let precio = columna(titulos, T_PRECIO, usadas); if (precio >= 0) usadas.add(precio);
    let total = columna(titulos, T_TOTAL, usadas); if (total >= 0) usadas.add(total);
    if (precio < 0 && total < 0) {
      // Sin títulos de precio reconocibles: las dos columnas donde cantidad × una ≈ la otra.
      const par = precioPorCuentas(filas.slice(i + 1, i + 60), cant);
      if (!par) continue;
      [precio, total] = par; usadas.add(precio); usadas.add(total);
    }
    // El SKU: la columna cuyos valores parecen SKU propios («SKU00377»), aunque el título diga otra cosa
    // (en los invoices suele estar el código del proveedor en «Item No.» y el nuestro en otra columna).
    const debajo = filas.slice(i + 1, i + 200);
    let porContenido = -1, mejor = 0;
    for (let k = 0; k < titulos.length; k++) {
      if (usadas.has(k)) continue;
      const n = debajo.filter((f) => ES_SKU_PROPIO.test(String(f[k] ?? "").trim())).length;
      if (n > mejor) { mejor = n; porContenido = k; }
    }
    const sku = porContenido >= 0 ? porContenido : columna(titulos, T_SKU, usadas);
    if (sku < 0) continue;
    usadas.add(sku);
    cab = i; cSku = sku; cCant = cant; cPrecio = precio; cTotal = total; cDesc = columna(titulos, T_DESC, usadas);
  }

  // ¿Está en inglés? Decide cómo leer una fecha ambigua.
  const texto = filas.slice(0, Math.max(cab + 1, 15)).flat().map(normal).join(" ");
  const enIngles = /\b(invoice|quantity|qty|price|amount|description|date|total)\b/.test(texto) && !/\b(fecha|cantidad|precio)\b/.test(texto);

  // Fecha y número: arriba de la tabla (o en las primeras 20 filas si no hay tabla).
  const arriba = filas.slice(0, cab >= 0 ? cab : 20);
  let fecha: { fecha: string; dudosa: boolean } | null = null, fechaTexto: string | null = null, numero: string | null = null;
  for (const fila of arriba) {
    fila.forEach((c, k) => {
      const t = normal(c);
      if (!t) return;
      if (!fecha && ES_FECHA.test(t)) {
        for (const v of despuesDe(fila, k)) {
          const f = fechaInvoice(v, enIngles);
          if (f) { fecha = f; fechaTexto = String(v); break; }
        }
      }
      if (!numero && ES_NUMERO.test(t) && !ES_FECHA.test(t)) {
        const v = despuesDe(fila, k).find((x) => x != null && /\d/.test(String(x)) && !fechaInvoice(x, enIngles));
        if (v != null) numero = String(v).trim().slice(0, 60);
      }
    });
  }
  // Sin rótulo «Date»: la primera fecha que aparezca arriba.
  if (!fecha) {
    for (const fila of arriba) {
      for (const c of fila) {
        const f = typeof c === "number" ? null : fechaInvoice(c, enIngles);
        if (f) { fecha = f; fechaTexto = String(c); break; }
      }
      if (fecha) break;
    }
  }
  const f = fecha as { fecha: string; dudosa: boolean } | null;

  const renglones: RenglonInvoice[] = [];
  if (cab < 0) {
    avisos.push("No encontré la tabla de productos: hace falta un renglón de títulos con el SKU (o «Item No.», «Model»), la cantidad y el precio.");
  } else {
    let vacias = 0;
    for (let i = cab + 1; i < filas.length; i++) {
      const fila = filas[i];
      const sku = fila[cSku] == null ? "" : String(fila[cSku]).trim();
      const primeras = fila.slice(0, Math.max(cSku, cDesc, 1) + 1).map(normal).join(" ");
      if (/\b(total|subtotal|grand total|合计|总计)\b/.test(primeras) && !ES_SKU_PROPIO.test(sku)) break;
      if (!fila.some((c) => c != null && c !== "")) { if (++vacias >= 3 && renglones.length) break; continue; }
      vacias = 0;
      const cantidad = numeroInvoice(fila[cCant]);
      if (cantidad == null || cantidad <= 0) continue;
      let precio = cPrecio >= 0 ? numeroInvoice(fila[cPrecio]) : null;
      const total = cTotal >= 0 ? numeroInvoice(fila[cTotal]) : null;
      if ((precio == null || precio <= 0) && total != null && total > 0) precio = Math.round((total / cantidad) * 10000) / 10000;
      const descripcion = cDesc >= 0 && fila[cDesc] != null ? String(fila[cDesc]).replace(/\s+/g, " ").trim().slice(0, 300) || null : null;
      // Sin SKU pero con descripción y precio: entra igual (se le pone el SKU a mano en la vista previa).
      if (!sku && (!descripcion || precio == null)) continue;
      renglones.push({ fila: i + 1, sku: sku.replace(/\s+/g, " ").slice(0, 80), descripcion, cantidad, precio: precio != null && precio > 0 ? precio : null });
    }
    if (!renglones.length) avisos.push("Encontré los títulos de la tabla pero ningún renglón con SKU y cantidad.");
  }
  if (!f) avisos.push("No encontré la fecha: cargala a mano.");
  else if (f.dudosa) avisos.push(`La fecha «${fechaTexto}» se puede leer de dos formas: se tomó ${enIngles ? "el mes primero (está en inglés)" : "el día primero"}. Revisala.`);
  return { fecha: f?.fecha ?? null, fechaTexto, fechaDudosa: !!f?.dudosa, numero, renglones, avisos };
}
