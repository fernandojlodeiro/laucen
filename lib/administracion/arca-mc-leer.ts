// Lee el archivo "Mis Comprobantes – Recibidos" que Fer baja de ARCA (no hay
// API oficial). Sin base: sólo el texto → comprobantes, así se prueba suelto.
//
// ARCA lo da en .csv (separado por ';', coma decimal, a veces con una fila de
// título arriba) o en Excel. Hay dos versiones de columnas y se aceptan las
// dos; cada columna se reconoce por su encabezado, no por su posición:
//   · la vieja: Fecha · Tipo ("1 - Factura A") · Punto de Venta · Número Desde ·
//     Número Hasta · Cód. Autorización · Tipo Doc. Emisor · Nro. Doc. Emisor ·
//     Denominación Emisor · Tipo Cambio · Moneda · Imp. Neto Gravado ·
//     Imp. Neto No Gravado · Imp. Op. Exentas · Otros Tributos · IVA · Imp. Total
//   · la nueva: además (o en lugar del neto y el IVA sueltos) el neto y el IVA
//     por alícuota ("Imp. Neto Gravado IVA 21%" + "IVA 21%", lo mismo 0, 2,5,
//     5, 10,5 y 27), "Total IVA", y a veces percepciones aparte
//     ("Percepción IVA", "Percepción IIBB"/"Ingresos Brutos", "Impuestos
//     Internos"…).
// En la vieja el IVA viene en un solo número: la alícuota se deduce (21, 10,5,
// 27, 5 o 2,5; si no cierra con una, se reparte entre 21 y 10,5).

export type Alicuota = { pct: number; neto: number; iva: number };

export type CbteArca = {
  fila: number;                 // renglón del archivo (para los errores)
  fecha: string;                // AAAA-MM-DD
  tipo: number;                 // código de ARCA (1 = Factura A…)
  tipoTexto: string;
  letra: "A" | "B" | "C" | "M";
  nc: boolean;                  // nota de crédito (resta)
  nd: boolean;                  // nota de débito (suma, numeración propia)
  puntoVenta: number;
  numero: number;
  numeroHasta: number | null;
  cae: string | null;
  cuit: string;                 // del emisor (el proveedor), 11 dígitos
  denominacion: string;
  moneda: "ARS" | "USD";
  cotizacion: number;
  alicuotas: Alicuota[];        // neto e IVA por alícuota (sólo A y M)
  netoGravado: number;
  noGravado: number;
  exento: number;
  percepcionIva: number;
  percepcionIibb: number;
  otrosTributos: number;
  iva: number;
  total: number;
};

export type LecturaArca = { version: "vieja" | "nueva"; comprobantes: CbteArca[]; errores: string[] };

/** Código de comprobante de ARCA → letra y clase. Los recibos y tiques
 *  factura cuentan como factura de su letra. */
const TIPOS: Record<number, [letra: CbteArca["letra"], clase: "F" | "NC" | "ND", texto: string]> = {
  1: ["A", "F", "Factura A"], 2: ["A", "ND", "Nota de débito A"], 3: ["A", "NC", "Nota de crédito A"], 4: ["A", "F", "Recibo A"],
  5: ["A", "F", "Nota de venta al contado A"], 6: ["B", "F", "Factura B"], 7: ["B", "ND", "Nota de débito B"], 8: ["B", "NC", "Nota de crédito B"],
  9: ["B", "F", "Recibo B"], 10: ["B", "F", "Nota de venta al contado B"], 11: ["C", "F", "Factura C"], 12: ["C", "ND", "Nota de débito C"],
  13: ["C", "NC", "Nota de crédito C"], 15: ["C", "F", "Recibo C"], 51: ["M", "F", "Factura M"], 52: ["M", "ND", "Nota de débito M"],
  53: ["M", "NC", "Nota de crédito M"], 54: ["M", "F", "Recibo M"], 81: ["A", "F", "Tique factura A"], 82: ["B", "F", "Tique factura B"],
  83: ["B", "F", "Tique"], 111: ["C", "F", "Tique factura C"], 112: ["A", "NC", "Tique nota de crédito A"], 113: ["B", "NC", "Tique nota de crédito B"],
  114: ["C", "NC", "Tique nota de crédito C"], 115: ["A", "ND", "Tique nota de débito A"], 116: ["B", "ND", "Tique nota de débito B"],
  117: ["C", "ND", "Tique nota de débito C"], 118: ["M", "F", "Tique factura M"], 119: ["M", "NC", "Tique nota de crédito M"],
  120: ["M", "ND", "Tique nota de débito M"], 201: ["A", "F", "Factura de crédito electrónica MiPyME A"],
  202: ["A", "ND", "Nota de débito electrónica MiPyME A"], 203: ["A", "NC", "Nota de crédito electrónica MiPyME A"],
  206: ["B", "F", "Factura de crédito electrónica MiPyME B"], 207: ["B", "ND", "Nota de débito electrónica MiPyME B"],
  208: ["B", "NC", "Nota de crédito electrónica MiPyME B"], 211: ["C", "F", "Factura de crédito electrónica MiPyME C"],
  212: ["C", "ND", "Nota de débito electrónica MiPyME C"], 213: ["C", "NC", "Nota de crédito electrónica MiPyME C"],
};

export function tipoArca(codigo: number) {
  const t = TIPOS[codigo];
  return t ? { letra: t[0], nc: t[1] === "NC", nd: t[1] === "ND", texto: t[2] } : null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Encabezado normalizado: minúsculas, sin acentos ni puntos, espacios simples. */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.:_]/g, " ").replace(/\s+/g, " ").trim();
}

/** "21%", "10,5 %", "2.5%" → 21, 10.5, 2.5; null si el encabezado no tiene alícuota. */
function alicuotaDe(h: string): number | null {
  const m = h.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return [0, 2.5, 5, 10.5, 21, 27].includes(n) ? n : null;
}

/** Un importe de ARCA: "1.234,56", "1234,56" o "1234.56" (vacío = 0). */
export function importe(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let t = String(v ?? "").replace(/["\s$]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** "15/03/2026", "2026-03-15" (o con hora) → "2026-03-15". */
function fecha(v: unknown): string | null {
  const t = String(v ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Separa un renglón de CSV respetando comillas ("a;b" queda junto, "" = "). */
function partirRenglon(linea: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (comillas) {
      if (ch === '"') {
        if (linea[i + 1] === '"') { cur += '"'; i++; } else comillas = false;
      } else cur += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** El texto del CSV como tabla de celdas. El separador se toma del renglón de
 *  encabezados (';' en ARCA; también ',' o tabulación). */
export function tablaDeCsv(texto: string): string[][] {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const cab = lineas.find((l) => /punto de venta/i.test(l.normalize("NFD").replace(/[̀-ͯ]/g, ""))) ?? lineas[0] ?? "";
  const sep = [";", "\t", ","].map((s) => [s, cab.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  return lineas.map((l) => partirRenglon(l, sep));
}

type Columnas = {
  fecha?: number; tipo?: number; pv?: number; desde?: number; hasta?: number; cae?: number; doc?: number; denominacion?: number;
  tc?: number; moneda?: number; netoGravado?: number; noGravado?: number; exento?: number; otros: number[]; percIva: number[]; percIibb: number[];
  iva?: number; total?: number; netoPor: Map<number, number>; ivaPor: Map<number, number>;
};

/** Reconoce cada columna por su encabezado. */
export function reconocerColumnas(encabezados: string[]): Columnas & { receptor: boolean } {
  const c: Columnas & { receptor: boolean } = { otros: [], percIva: [], percIibb: [], netoPor: new Map(), ivaPor: new Map(), receptor: false };
  encabezados.forEach((crudo, i) => {
    const h = normalizar(crudo);
    if (!h) return;
    const pct = alicuotaDe(h);
    if (/^fecha/.test(h)) { if (c.fecha == null || /emision/.test(h)) c.fecha = i; return; }
    if (/tipo (de )?cambio/.test(h)) { c.tc = i; return; }
    if (/^moneda/.test(h)) { c.moneda = i; return; }
    if (/receptor/.test(h)) { if (/doc|cuit/.test(h)) c.receptor = true; return; }
    if (/(nro|numero) (de )?doc/.test(h) && /emisor/.test(h)) { c.doc = i; return; }
    if (/^cuit/.test(h) && /emisor/.test(h)) { c.doc = i; return; }
    if (/tipo doc/.test(h)) return;
    if (/(denominacion|razon social)/.test(h)) { c.denominacion = i; return; }
    if (/punto de venta/.test(h)) { c.pv = i; return; }
    if (/(numero|nro) hasta/.test(h)) { c.hasta = i; return; }
    if (/(numero|nro)( desde)?$/.test(h) || /(numero|nro) desde/.test(h)) { if (c.desde == null || /desde/.test(h)) c.desde = i; return; }
    if (/autorizacion|^cae/.test(h)) { c.cae = i; return; }
    if (/^tipo/.test(h)) { c.tipo = i; return; }
    if (/percep|retenc/.test(h)) {
      if (/iva/.test(h)) c.percIva.push(i);
      else if (/iibb|ingresos brutos|brutos/.test(h)) c.percIibb.push(i);
      else c.otros.push(i);
      return;
    }
    if (/no grav/.test(h)) { c.noGravado = i; return; }
    if (/exent/.test(h)) { c.exento = i; return; }
    if (/otros trib|impuestos internos|imp internos|tributos/.test(h)) { c.otros.push(i); return; }
    if (/neto/.test(h) && /grav/.test(h)) {
      if (pct != null) c.netoPor.set(pct, i);
      else c.netoGravado = i;
      return;
    }
    if (/iva/.test(h)) {
      if (pct != null) c.ivaPor.set(pct, i);
      else c.iva = i;
      return;
    }
    if (/total/.test(h)) { c.total = i; return; }
  });
  return c;
}

/** Del neto y el IVA sueltos (versión vieja), la alícuota o el reparto. */
export function deducirAlicuotas(neto: number, iva: number): Alicuota[] {
  if (neto <= 0) return iva > 0 ? [{ pct: 21, neto: r2(iva / 0.21), iva }] : [];
  if (iva <= 0) return [{ pct: 0, neto, iva: 0 }];
  for (const pct of [21, 10.5, 27, 5, 2.5]) {
    if (Math.abs(r2(neto * pct / 100) - iva) <= Math.max(0.05, neto * 0.0001)) return [{ pct, neto, iva }];
  }
  // Mezcla de 21 y 10,5: n21 + n105 = neto; 0,21·n21 + 0,105·n105 = iva.
  const n21 = r2((iva - 0.105 * neto) / 0.105);
  const n105 = r2(neto - n21);
  if (n21 > 0 && n105 > 0) return [{ pct: 21, neto: n21, iva: r2(n21 * 0.21) }, { pct: 10.5, neto: n105, iva: r2(iva - r2(n21 * 0.21)) }];
  // No cierra con ninguna: una sola línea con la alícuota que da.
  return [{ pct: r2((iva / neto) * 100), neto, iva }];
}

/** Toma la tabla (del CSV o de la hoja de Excel) y arma los comprobantes. */
export function leerTablaArca(tabla: (string | number | null)[][]): LecturaArca {
  const errores: string[] = [];
  const iCab = tabla.findIndex((f) => f.some((x) => /punto de venta/.test(normalizar(String(x ?? "")))));
  if (iCab < 0) return { version: "vieja", comprobantes: [], errores: ["No es el archivo de \"Mis Comprobantes\" de ARCA: no encuentro la columna \"Punto de Venta\"."] };
  const cab = tabla[iCab].map((x) => String(x ?? ""));
  const c = reconocerColumnas(cab);
  if (c.doc == null && c.receptor) {
    return { version: "vieja", comprobantes: [], errores: ["Este archivo es de comprobantes EMITIDOS. Hay que bajar \"Mis Comprobantes – Recibidos\"."] };
  }
  const faltan = [["Fecha", c.fecha], ["Tipo", c.tipo], ["Punto de Venta", c.pv], ["Número Desde", c.desde], ["Nro. Doc. Emisor", c.doc], ["Imp. Total", c.total]]
    .filter(([, v]) => v == null).map(([n]) => n);
  if (faltan.length) return { version: "vieja", comprobantes: [], errores: [`Al archivo le faltan columnas: ${faltan.join(", ")}.`] };
  const version = c.netoPor.size || c.ivaPor.size ? "nueva" : "vieja";
  const comprobantes: CbteArca[] = [];
  for (let i = iCab + 1; i < tabla.length; i++) {
    const f = tabla[i];
    const val = (k?: number) => (k == null ? "" : f[k] ?? "");
    const num = (k?: number) => (k == null ? 0 : importe(f[k]));
    const fila = i + 1;
    if (f.every((x) => String(x ?? "").trim() === "")) continue;
    const fe = fecha(val(c.fecha));
    const codigo = Number(String(val(c.tipo)).match(/^\s*(\d+)/)?.[1] ?? NaN);
    const t = tipoArca(codigo);
    if (!fe) { errores.push(`Renglón ${fila}: la fecha "${val(c.fecha)}" no se entiende.`); continue; }
    if (!t) { errores.push(`Renglón ${fila}: el tipo de comprobante "${val(c.tipo)}" no lo conozco (no se importa).`); continue; }
    const cuit = String(val(c.doc)).replace(/\D/g, "");
    if (cuit.length !== 11) { errores.push(`Renglón ${fila}: el emisor no tiene un CUIT válido ("${val(c.doc)}").`); continue; }
    const pv = Math.trunc(num(c.pv)), nro = Math.trunc(num(c.desde));
    if (!(nro > 0)) { errores.push(`Renglón ${fila}: falta el número del comprobante.`); continue; }
    const monTxt = normalizar(String(val(c.moneda)));
    const moneda: "ARS" | "USD" | null = !monTxt || /^(\$|pes|ars|peso)/.test(monTxt) ? "ARS" : /^(usd|dol|u\$s|us\$)/.test(monTxt) ? "USD" : null;
    if (!moneda) { errores.push(`Renglón ${fila}: la moneda "${val(c.moneda)}" no se puede cargar (sólo pesos o dólares).`); continue; }
    const tc = num(c.tc);
    const total = Math.abs(num(c.total));
    // Neto e IVA por alícuota (versión nueva) o deducidos (vieja).
    let alicuotas: Alicuota[] = [];
    if (version === "nueva") {
      for (const pct of new Set([...c.netoPor.keys(), ...c.ivaPor.keys()])) {
        const neto = Math.abs(num(c.netoPor.get(pct))), iva = Math.abs(num(c.ivaPor.get(pct)));
        if (neto || iva) alicuotas.push({ pct, neto: r2(neto), iva: r2(iva) });
      }
    }
    const netoSuelto = Math.abs(num(c.netoGravado)), ivaSuelto = Math.abs(num(c.iva));
    if (!alicuotas.length && (netoSuelto || ivaSuelto)) alicuotas = deducirAlicuotas(r2(netoSuelto), r2(ivaSuelto));
    alicuotas.sort((a, b) => b.pct - a.pct);
    const suma = (ks: number[]) => r2(ks.reduce((s, k) => s + Math.abs(num(k)), 0));
    comprobantes.push({
      fila, fecha: fe, tipo: codigo, tipoTexto: t.texto, letra: t.letra, nc: t.nc, nd: t.nd, puntoVenta: pv, numero: nro,
      numeroHasta: c.hasta != null && Math.trunc(num(c.hasta)) > nro ? Math.trunc(num(c.hasta)) : null,
      cae: String(val(c.cae)).trim() || null, cuit, denominacion: String(val(c.denominacion)).trim() || `CUIT ${cuit}`,
      moneda, cotizacion: moneda === "USD" ? tc : 1,
      alicuotas,
      netoGravado: r2(alicuotas.reduce((s, a) => s + a.neto, 0)),
      noGravado: r2(Math.abs(num(c.noGravado))), exento: r2(Math.abs(num(c.exento))),
      percepcionIva: suma(c.percIva), percepcionIibb: suma(c.percIibb), otrosTributos: suma(c.otros),
      iva: r2(alicuotas.reduce((s, a) => s + a.iva, 0)),
      total: r2(total),
    });
    if (moneda === "USD" && !(tc > 0)) errores.push(`Renglón ${fila}: está en dólares y no trae el tipo de cambio.`);
  }
  return { version, comprobantes, errores };
}

/** Atajo: el texto de un .csv de ARCA → comprobantes. */
export const leerCsvArca = (texto: string) => leerTablaArca(tablaDeCsv(texto));

/** Cómo entra a Laucen: las líneas (una por alícuota; en B y C, el total entero
 *  como gasto sin IVA), los importes de la cabecera y si los importes cierran
 *  con el total. Lo que sobra (tributos que el archivo no separa) va a "otros
 *  impuestos"; si falta, es un error. */
export function armarFactura(c: CbteArca): {
  lineas: { descripcion: string; ivaPct: number; neto: number; iva: number }[];
  noGravado: number; percepcionIva: number; percepcionIibb: number; otrosImpuestos: number; total: number; aviso: string | null; error: string | null;
} {
  if (c.letra === "B" || c.letra === "C") {
    return { lineas: [{ descripcion: `${c.tipoTexto} (sin IVA discriminado)`, ivaPct: 0, neto: c.total, iva: 0 }],
      noGravado: 0, percepcionIva: 0, percepcionIibb: 0, otrosImpuestos: 0, total: c.total, aviso: null, error: c.total > 0 ? null : "El total es cero." };
  }
  const lineas = c.alicuotas.filter((a) => a.neto || a.iva)
    .map((a) => ({ descripcion: `Neto gravado ${a.pct.toLocaleString("es-AR")} %`, ivaPct: a.pct, neto: a.neto, iva: a.iva }));
  const noGravado = r2(c.noGravado + c.exento);
  let otros = c.otrosTributos;
  const suma = r2(lineas.reduce((s, l) => s + l.neto + l.iva, 0) + noGravado + c.percepcionIva + c.percepcionIibb + otros);
  const dif = r2(c.total - suma);
  let aviso: string | null = null, error: string | null = null;
  if (dif > 0.05) {
    otros = r2(otros + dif);
    aviso = `Los importes separados suman ${suma.toLocaleString("es-AR", { minimumFractionDigits: 2 })}: la diferencia con el total va a "otros impuestos".`;
  } else if (dif < -0.05) {
    error = `Los importes no cierran: suman ${suma.toLocaleString("es-AR", { minimumFractionDigits: 2 })} y el total es ${c.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}.`;
  } else if (dif !== 0) {
    // Centavos de redondeo: a la línea más grande (o a otros impuestos).
    const mayor = lineas.reduce<(typeof lineas)[number] | null>((m, l) => (!m || l.neto > m.neto ? l : m), null);
    if (mayor) mayor.neto = r2(mayor.neto + dif); else otros = r2(otros + dif);
  }
  if (!(c.total > 0)) error = "El total es cero.";
  return { lineas, noGravado, percepcionIva: c.percepcionIva, percepcionIibb: c.percepcionIibb,
    otrosImpuestos: otros, total: c.total, aviso, error };
}
