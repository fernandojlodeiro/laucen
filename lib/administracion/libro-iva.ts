// Libros de IVA (Administración → Libros de IVA): funciones puras, sin base.
//
//   · El libro: cada comprobante del período en pesos y con signo (las notas
//     de crédito restan), con el neto gravado y el IVA por alícuota, no
//     gravado, exento, percepciones y total; los totales, el resumen por
//     alícuota y el saldo técnico (débito fiscal − crédito fiscal).
//   · Los archivos del "Libro de IVA Digital" de ARCA (mismo diseño de
//     registro que el ex "Régimen de información de compras y ventas", RG
//     3685): VENTAS_CBTE (266), VENTAS_ALICUOTAS (62), COMPRAS_CBTE (325),
//     COMPRAS_ALICUOTAS (84) y COMPRAS_IMPORTACIONES (50). Campos de ancho
//     fijo: números con ceros a la izquierda, importes en centavos sin punto
//     (13 enteros + 2 decimales), fechas AAAAMMDD, textos a la izquierda
//     completados con espacios, renglones separados por CRLF.
//
// Los datos los arma lib/administracion/libro-iva-base.ts.

export const ALICUOTAS = [27, 21, 10.5, 5, 2.5, 0] as const;
export type Alicuota = (typeof ALICUOTAS)[number];
/** Código de alícuota de ARCA. */
export const CODIGO_ALICUOTA: Record<Alicuota, number> = { 0: 3, 10.5: 4, 21: 5, 27: 6, 5: 8, 2.5: 9 };

/** Comprobante del libro, en su moneda original y con importes positivos
 *  (que reste o sume lo dice `nc`). */
export type CbteIva = {
  origen: "venta" | "compra" | "despacho";
  id: number;
  fecha: string;               // AAAA-MM-DD
  tipo: number;                // código de ARCA (1 = Factura A, 66 = despacho…)
  puntoVenta: number;
  numero: string;              // sólo dígitos
  despacho?: string | null;    // nº de despacho (sólo importaciones)
  docTipo: number;             // 80 CUIT, 86 CUIL, 96 DNI, 99 sin identificar
  docNro: string;
  nombre: string;
  condicionIva: string | null;
  moneda: "PES" | "DOL";
  cotizacion: number;
  nc: boolean;
  alicuotas: { pct: number; base: number; iva: number }[];
  noGravado: number;
  exento: number;
  /** Compras B/C: lo que no discrimina IVA (no da crédito fiscal). */
  sinDiscriminar: number;
  percepcionIva: number;
  percepcionNacionales: number;  // ganancias y otros nacionales
  percepcionIibb: number;
  percepcionMunicipal: number;
  impuestosInternos: number;
  otros: number;
  total: number;
  /** Ventas por servicios: vencimiento del pago. */
  vencimientoPago?: string | null;
  canal?: string | null;
  canalId?: number | null;
  enlace?: string;
};

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

// ── Tipos de comprobante ──────────────────────────────────────────────

export const TIPO_TEXTO: Record<number, string> = {
  1: "FA", 2: "ND A", 3: "NC A", 6: "FB", 7: "ND B", 8: "NC B", 11: "FC", 12: "ND C", 13: "NC C",
  19: "FE", 20: "ND E", 21: "NC E", 51: "FM", 52: "ND M", 53: "NC M", 66: "Despacho",
};
const TIPO_LETRA: Record<number, string> = { 1: "A", 2: "A", 3: "A", 6: "B", 7: "B", 8: "B", 11: "C", 12: "C", 13: "C", 19: "E", 20: "E", 21: "E", 51: "M", 52: "M", 53: "M", 66: "" };
export const letraDeTipo = (t: number) => TIPO_LETRA[t] ?? "";
export const esNotaCredito = (t: number) => [3, 8, 13, 21, 53].includes(t);

/** Código de ARCA de un comprobante de compra por su letra y si es NC o ND. */
export function tipoCompra(letra: string, nc: boolean, nd: boolean): number | null {
  const base: Record<string, number> = { A: 1, B: 6, C: 11, E: 19, M: 51 };
  const b = base[letra];
  if (b == null) return null;
  return b + (nd ? 1 : nc ? 2 : 0);
}

/** "FA 00002-00000123" o "Despacho 26001IC04012345X". */
export function textoComprobante(c: Pick<CbteIva, "tipo" | "puntoVenta" | "numero" | "despacho">) {
  if (c.tipo === 66) return `Despacho ${c.despacho ?? "s/n"}`;
  return `${TIPO_TEXTO[c.tipo] ?? `Tipo ${c.tipo}`} ${String(c.puntoVenta).padStart(5, "0")}-${String(c.numero).padStart(8, "0")}`;
}

/** La alícuota que corresponde a un porcentaje (o null si no es ninguna). */
export function alicuotaDe(pct: number): Alicuota | null {
  return (ALICUOTAS as readonly number[]).find((a) => Math.abs(a - Number(pct)) < 0.001) as Alicuota | undefined ?? null;
}

// ── El libro en pesos ─────────────────────────────────────────────────

export type ImportesLibro = {
  neto: Record<Alicuota, number>;
  iva: Record<Alicuota, number>;
  noGravado: number; exento: number; sinDiscriminar: number;
  percepcionIva: number; percepcionIibb: number; otros: number; total: number;
};
export type FilaLibro = { c: CbteIva; signo: 1 | -1 } & ImportesLibro;

const porAlicuota = (): Record<Alicuota, number> => ({ 27: 0, 21: 0, 10.5: 0, 5: 0, 2.5: 0, 0: 0 });
export const importesVacios = (): ImportesLibro => ({
  neto: porAlicuota(), iva: porAlicuota(), noGravado: 0, exento: 0, sinDiscriminar: 0, percepcionIva: 0, percepcionIibb: 0, otros: 0, total: 0,
});

/** El comprobante en pesos (a su cotización) y con signo. "Otros" junta
 *  percepciones nacionales y municipales, impuestos internos y otros tributos. */
export function filaLibro(c: CbteIva): FilaLibro {
  const signo: 1 | -1 = c.nc ? -1 : 1;
  const cot = c.moneda === "PES" ? 1 : c.cotizacion || 1;
  const a = (x: number) => r2(signo * x * cot) || 0;
  const f: FilaLibro = { c, signo, ...importesVacios() };
  for (const al of c.alicuotas) {
    const k = alicuotaDe(al.pct);
    if (k == null) continue;
    f.neto[k] = r2(f.neto[k] + a(al.base));
    f.iva[k] = r2(f.iva[k] + a(al.iva));
  }
  f.noGravado = a(c.noGravado);
  f.exento = a(c.exento);
  f.sinDiscriminar = a(c.sinDiscriminar);
  f.percepcionIva = a(c.percepcionIva);
  f.percepcionIibb = a(c.percepcionIibb);
  f.otros = a(c.percepcionNacionales + c.percepcionMunicipal + c.impuestosInternos + c.otros);
  f.total = a(c.total);
  return f;
}

export function sumarImportes(filas: ImportesLibro[]): ImportesLibro {
  const t = importesVacios();
  for (const f of filas) {
    for (const k of ALICUOTAS) { t.neto[k] = r2(t.neto[k] + f.neto[k]); t.iva[k] = r2(t.iva[k] + f.iva[k]); }
    t.noGravado = r2(t.noGravado + f.noGravado); t.exento = r2(t.exento + f.exento); t.sinDiscriminar = r2(t.sinDiscriminar + f.sinDiscriminar);
    t.percepcionIva = r2(t.percepcionIva + f.percepcionIva); t.percepcionIibb = r2(t.percepcionIibb + f.percepcionIibb);
    t.otros = r2(t.otros + f.otros); t.total = r2(t.total + f.total);
  }
  return t;
}

export const ivaTotal = (t: ImportesLibro) => r2(ALICUOTAS.reduce<number>((s, k) => s + t.iva[k], 0));
export const netoTotal = (t: ImportesLibro) => r2(ALICUOTAS.reduce<number>((s, k) => s + t.neto[k], 0));

/** El libro: filas en orden de fecha (y comprobante) y sus totales. */
export function armarLibro(cbtes: CbteIva[]) {
  const filas = [...cbtes]
    .sort((x, y) => x.fecha.localeCompare(y.fecha) || x.tipo - y.tipo || x.puntoVenta - y.puntoVenta || x.numero.localeCompare(y.numero, undefined, { numeric: true }) || x.id - y.id)
    .map(filaLibro);
  return { filas, totales: sumarImportes(filas) };
}

/** Las alícuotas usadas (para no mostrar columnas vacías en pantalla). */
export const alicuotasUsadas = (t: ImportesLibro, filas: ImportesLibro[]) =>
  ALICUOTAS.filter((k) => t.neto[k] !== 0 || t.iva[k] !== 0 || filas.some((f) => f.neto[k] !== 0 || f.iva[k] !== 0));

/** El resumen del mes: base e IVA por alícuota de cada libro, débito −
 *  crédito = saldo técnico (positivo: a pagar; negativo: a favor), y las
 *  percepciones de IVA sufridas (las de compras y despachos) como saldo de
 *  libre disponibilidad / a favor, aparte. */
export function resumenIva(ventas: ImportesLibro, compras: ImportesLibro) {
  const alicuotas = ALICUOTAS.map((k) => ({ pct: k, baseVentas: ventas.neto[k], debito: ventas.iva[k], baseCompras: compras.neto[k], credito: compras.iva[k] }))
    .filter((a) => a.baseVentas || a.debito || a.baseCompras || a.credito);
  const debito = ivaTotal(ventas);
  const credito = ivaTotal(compras);
  const saldoTecnico = r2(debito - credito);
  const percepciones = compras.percepcionIva;
  return { alicuotas, debito, credito, saldoTecnico, percepciones, saldoConPercepciones: r2(saldoTecnico - percepciones) };
}

// ── Libro de IVA Digital (archivos TXT) ──────────────────────────────

/** Número entero con ceros a la izquierda; si no entra, se queda con los últimos dígitos. */
export function num(n: number | string, largo: number): string {
  const s = String(n).replace(/\D/g, "") || "0";
  return s.padStart(largo, "0").slice(-largo);
}
/** Importe en centavos sin punto (13 enteros + 2 decimales). Negativo: "-" adelante. */
export function importe(n: number, largo = 15): string {
  const c = Math.round(Math.abs(n) * 100);
  const s = String(c).padStart(largo, "0").slice(-largo);
  return n < 0 && c > 0 ? `-${s.slice(1)}` : s;
}
/** Texto a la izquierda completado con espacios, sin acentos ni caracteres fuera de ASCII. */
export function txt(s: string | null | undefined, largo: number): string {
  const limpio = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  return limpio.slice(0, largo).padEnd(largo, " ");
}
export const fechaTxt = (f: string | null | undefined) => (f ? f.slice(0, 10).replace(/-/g, "") : "00000000");
/** Tipo de cambio: 4 enteros + 6 decimales, sin punto. */
export const cambioTxt = (cot: number) => num(Math.round((cot || 1) * 1e6), 10);
const monedaTxt = (c: CbteIva) => (c.moneda === "PES" ? "PES" : "DOL");
const cotTxt = (c: CbteIva) => cambioTxt(c.moneda === "PES" ? 1 : c.cotizacion);

/** Las alícuotas que se informan: las de importe distinto de cero, agrupadas por código. */
function alicuotasInformadas(c: CbteIva) {
  const m = new Map<Alicuota, { base: number; iva: number }>();
  for (const a of c.alicuotas) {
    const k = alicuotaDe(a.pct);
    if (k == null) continue;
    const x = m.get(k) ?? { base: 0, iva: 0 };
    x.base = r2(x.base + a.base); x.iva = r2(x.iva + a.iva);
    m.set(k, x);
  }
  return [...m.entries()].filter(([, x]) => x.base !== 0 || x.iva !== 0).map(([k, x]) => ({ codigo: CODIGO_ALICUOTA[k], ...x }));
}

/** Discrimina IVA (A, M, B de venta, despacho): se informan alícuotas. */
function discrimina(c: CbteIva) {
  const l = letraDeTipo(c.tipo);
  if (c.origen === "despacho") return true;
  if (c.origen === "venta") return l === "A" || l === "B" || l === "M";
  return l === "A" || l === "M";
}

/** Código de operación: "0" si hay IVA; si no, "E" (exento), "N" (no gravado). */
function codigoOperacion(c: CbteIva) {
  if (!discrimina(c)) return "0";
  const ivaTot = c.alicuotas.reduce((s, a) => s + a.iva, 0);
  if (ivaTot !== 0) return "0";
  return c.exento > 0 && c.noGravado <= 0 ? "E" : "N";
}

/** Las alícuotas de un comprobante que discrimina: si no tiene ninguna, va
 *  una de 0 % con base cero (ARCA pide al menos una para A y B). */
function alicuotasParaTxt(c: CbteIva) {
  if (!discrimina(c)) return [];
  const a = alicuotasInformadas(c);
  return a.length ? a : [{ codigo: 3, base: 0, iva: 0 }];
}

export const LARGO = { ventasCbte: 266, ventasAlicuotas: 62, comprasCbte: 325, comprasAlicuotas: 84, comprasImportaciones: 50 } as const;

/** VENTAS_CBTE, 266 posiciones. */
export function lineaVentaCbte(c: CbteIva): string {
  const al = alicuotasParaTxt(c);
  const nro = num(c.numero, 20);
  return [
    fechaTxt(c.fecha),                       // 1  Fecha de comprobante (8)
    num(c.tipo, 3),                          // 2  Tipo de comprobante (3)
    num(c.puntoVenta, 5),                    // 3  Punto de venta (5)
    nro,                                     // 4  Número de comprobante (20)
    nro,                                     // 5  Número de comprobante hasta (20)
    num(c.docTipo, 2),                       // 6  Código de documento del comprador (2)
    num(c.docTipo === 99 ? 0 : c.docNro, 20),// 7  Número de identificación del comprador (20)
    txt(c.nombre, 30),                       // 8  Apellido y nombre o denominación (30)
    importe(c.total),                        // 9  Importe total de la operación (15)
    importe(c.noGravado),                    // 10 Conceptos que no integran el precio neto gravado (15)
    importe(0),                              // 11 Percepción a no categorizados (15)
    importe(c.exento),                       // 12 Operaciones exentas (15)
    importe(c.percepcionIva + c.percepcionNacionales), // 13 Percepciones o pagos a cuenta de impuestos nacionales (15)
    importe(c.percepcionIibb),               // 14 Percepciones de Ingresos Brutos (15)
    importe(c.percepcionMunicipal),          // 15 Percepciones de impuestos municipales (15)
    importe(c.impuestosInternos),            // 16 Impuestos internos (15)
    monedaTxt(c),                            // 17 Código de moneda (3)
    cotTxt(c),                               // 18 Tipo de cambio (10: 4 enteros + 6 decimales)
    String(al.length),                       // 19 Cantidad de alícuotas de IVA (1)
    codigoOperacion(c),           // 20 Código de operación (1)
    importe(c.otros),                        // 21 Otros tributos (15)
    fechaTxt(c.vencimientoPago),             // 22 Fecha de vencimiento de pago (8)
  ].join("");
}

/** VENTAS_ALICUOTAS, 62 posiciones por alícuota. */
export function lineasVentaAlicuotas(c: CbteIva): string[] {
  return alicuotasParaTxt(c).map((a) => [
    num(c.tipo, 3),        // Tipo de comprobante (3)
    num(c.puntoVenta, 5),  // Punto de venta (5)
    num(c.numero, 20),     // Número de comprobante (20)
    importe(a.base),       // Importe neto gravado (15)
    num(a.codigo, 4),      // Alícuota de IVA (4)
    importe(a.iva),        // Impuesto liquidado (15)
  ].join(""));
}

/** CUIT y nombre que se informan como "vendedor" de un despacho de importación. */
export const ADUANA = { cuit: "33693450239", nombre: "DIRECCION GENERAL DE ADUANAS" };

/** COMPRAS_CBTE, 325 posiciones. */
export function lineaCompraCbte(c: CbteIva): string {
  const esDespacho = c.origen === "despacho";
  const al = alicuotasParaTxt(c);
  const credito = discrimina(c) ? r2(al.reduce((s, a) => s + a.iva, 0)) : 0;
  return [
    fechaTxt(c.fecha),                                // 1  Fecha de comprobante (8)
    num(c.tipo, 3),                                   // 2  Tipo de comprobante (3)
    num(esDespacho ? 0 : c.puntoVenta, 5),            // 3  Punto de venta (5)
    num(esDespacho ? 0 : c.numero, 20),               // 4  Número de comprobante (20)
    txt(esDespacho ? c.despacho : "", 16),            // 5  Despacho de importación (16)
    num(c.docTipo, 2),                                // 6  Código de documento del vendedor (2)
    num(c.docTipo === 99 ? 0 : c.docNro, 20),         // 7  Número de identificación del vendedor (20)
    txt(c.nombre, 30),                                // 8  Apellido y nombre o denominación del vendedor (30)
    importe(c.total),                                 // 9  Importe total de la operación (15)
    importe(discrimina(c) ? c.noGravado : 0),         // 10 Conceptos que no integran el precio neto gravado (15)
    importe(discrimina(c) ? c.exento : 0),            // 11 Operaciones exentas (15)
    importe(c.percepcionIva),                         // 12 Percepciones o pagos a cuenta del IVA (15)
    importe(c.percepcionNacionales),                  // 13 Percepciones o pagos a cuenta de otros impuestos nacionales (15)
    importe(c.percepcionIibb),                        // 14 Percepciones de Ingresos Brutos (15)
    importe(c.percepcionMunicipal),                   // 15 Percepciones de impuestos municipales (15)
    importe(c.impuestosInternos),                     // 16 Impuestos internos (15)
    monedaTxt(c),                                     // 17 Código de moneda (3)
    cotTxt(c),                                        // 18 Tipo de cambio (10)
    String(al.length),                                // 19 Cantidad de alícuotas de IVA (1)
    codigoOperacion(c),                    // 20 Código de operación (1)
    importe(credito),                                 // 21 Crédito fiscal computable (15)
    importe(c.otros),                                 // 22 Otros tributos (15)
    num(0, 11),                                       // 23 CUIT emisor / corredor (11)
    txt("", 30),                                      // 24 Denominación del emisor / corredor (30)
    importe(0),                                       // 25 IVA comisión (15)
  ].join("");
}

/** COMPRAS_ALICUOTAS, 84 posiciones por alícuota (sin los despachos, que van a IMPORTACIONES). */
export function lineasCompraAlicuotas(c: CbteIva): string[] {
  if (c.origen === "despacho") return [];
  return alicuotasParaTxt(c).map((a) => [
    num(c.tipo, 3),                            // Tipo de comprobante (3)
    num(c.puntoVenta, 5),                      // Punto de venta (5)
    num(c.numero, 20),                         // Número de comprobante (20)
    num(c.docTipo, 2),                         // Código de documento del vendedor (2)
    num(c.docTipo === 99 ? 0 : c.docNro, 20),  // Número de identificación del vendedor (20)
    importe(a.base),                           // Importe neto gravado (15)
    num(a.codigo, 4),                          // Alícuota de IVA (4)
    importe(a.iva),                            // Impuesto liquidado (15)
  ].join(""));
}

/** COMPRAS_IMPORTACIONES, 50 posiciones por alícuota de cada despacho. */
export function lineasCompraImportaciones(c: CbteIva): string[] {
  if (c.origen !== "despacho") return [];
  return alicuotasParaTxt(c).map((a) => [
    txt(c.despacho, 16),  // Despacho de importación (16)
    importe(a.base),      // Importe neto gravado (15)
    num(a.codigo, 4),     // Alícuota de IVA (4)
    importe(a.iva),       // Impuesto liquidado (15)
  ].join(""));
}

const unir = (l: string[]) => (l.length ? l.join("\r\n") + "\r\n" : "");

/** Los cinco archivos del Libro de IVA Digital para un período (AAAAMM). */
export function archivosLibroIvaDigital(periodo: string, ventas: CbteIva[], compras: CbteIva[]) {
  const v = armarLibro(ventas).filas.map((f) => f.c);
  const c = armarLibro(compras).filas.map((f) => f.c);
  return [
    { nombre: `LIBRO_IVA_DIGITAL_VENTAS_CBTE_${periodo}.txt`, contenido: unir(v.map(lineaVentaCbte)), renglones: v.length },
    { nombre: `LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_${periodo}.txt`, contenido: unir(v.flatMap(lineasVentaAlicuotas)), renglones: v.flatMap(lineasVentaAlicuotas).length },
    { nombre: `LIBRO_IVA_DIGITAL_COMPRAS_CBTE_${periodo}.txt`, contenido: unir(c.map(lineaCompraCbte)), renglones: c.length },
    { nombre: `LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_${periodo}.txt`, contenido: unir(c.flatMap(lineasCompraAlicuotas)), renglones: c.flatMap(lineasCompraAlicuotas).length },
    { nombre: `LIBRO_IVA_DIGITAL_IMPORTACIONES_${periodo}.txt`, contenido: unir(c.flatMap(lineasCompraImportaciones)), renglones: c.flatMap(lineasCompraImportaciones).length },
  ];
}

// ── Despachos: de la lista de impuestos al comprobante ───────────────

export type ImpuestoDespacho = { concepto: string; importe_ars: number };

/** Clasifica los impuestos de un despacho: IVA (crédito fiscal), IVA
 *  adicional / percepción de IVA, ganancias (otros nacionales), IIBB y otros. */
export function clasificarImpuestosDespacho(items: ImpuestoDespacho[]) {
  const r = { iva: 0, percepcionIva: 0, percepcionNacionales: 0, percepcionIibb: 0, otros: 0 };
  for (const i of items ?? []) {
    const c = (i.concepto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const v = Number(i.importe_ars) || 0;
    if (/adicional|percep/.test(c) && /iva/.test(c)) r.percepcionIva += v;
    else if (/^iva\b/.test(c) || c === "iva") r.iva += v;
    else if (/ganancia/.test(c)) r.percepcionNacionales += v;
    else if (/iibb|ingresos brutos/.test(c)) r.percepcionIibb += v;
    else r.otros += v;
  }
  return { iva: r2(r.iva), percepcionIva: r2(r.percepcionIva), percepcionNacionales: r2(r.percepcionNacionales), percepcionIibb: r2(r.percepcionIibb), otros: r2(r.otros) };
}

/** La alícuota y la base del IVA de un despacho: la base estimada es CIF +
 *  derechos + tasa estadística; la alícuota, la de 21 o 10,5 % más cercana
 *  a IVA / base estimada. La base que se informa sale del IVA (IVA / alícuota),
 *  para que cierre. `dudosa` si el cociente no se parece a ninguna. */
export function baseIvaDespacho(iva: number, baseEstimada: number): { pct: 21 | 10.5; base: number; dudosa: boolean } {
  if (!(iva > 0)) return { pct: 21, base: 0, dudosa: false };
  const ratio = baseEstimada > 0 ? (iva / baseEstimada) * 100 : 21;
  const pct = Math.abs(ratio - 10.5) < Math.abs(ratio - 21) ? 10.5 : 21;
  return { pct, base: r2(iva / (pct / 100)), dudosa: baseEstimada > 0 && Math.abs(ratio - pct) > 1.5 };
}

// ── Período ───────────────────────────────────────────────────────────

/** El mes AAAA-MM: primer y último día. */
export function rangoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const desde = `${a}-${String(m).padStart(2, "0")}-01`;
  const hasta = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return { desde, hasta };
}
/** Si el rango es un mes entero, su AAAAMM; si no, null. */
export function periodoDeRango(desde: string, hasta: string): string | null {
  if (!/^\d{4}-\d{2}-01$/.test(desde)) return null;
  const r = rangoMes(desde.slice(0, 7));
  return r.hasta === hasta ? desde.slice(0, 7).replace("-", "") : null;
}
