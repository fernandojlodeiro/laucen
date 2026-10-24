// Las 24 jurisdicciones de Ingresos Brutos con su código de la Comisión Arbitral del Convenio Multilateral (901 CABA …
// 924 Tucumán), el que usan el SIFERE y las declaraciones CM03/CM05. Los nombres son los de lib/provincias.ts. Pura.

import { PROVINCIAS, provinciaNormal } from "@/lib/provincias";

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export const JURISDICCIONES: Record<number, (typeof PROVINCIAS)[number]> = {
  901: "Capital Federal", 902: "Buenos Aires", 903: "Catamarca", 904: "Córdoba", 905: "Corrientes", 906: "Chaco", 907: "Chubut",
  908: "Entre Ríos", 909: "Formosa", 910: "Jujuy", 911: "La Pampa", 912: "La Rioja", 913: "Mendoza", 914: "Misiones", 915: "Neuquén",
  916: "Río Negro", 917: "Salta", 918: "San Juan", 919: "San Luis", 920: "Santa Cruz", 921: "Santa Fe", 922: "Santiago del Estero",
  923: "Tierra del Fuego", 924: "Tucumán",
};

export const CODIGOS_JURISDICCION = Object.keys(JURISDICCIONES).map(Number);

export const SEDE_POR_DEFECTO = 904;

/** El nombre para mostrar: "Córdoba"; la Ciudad de Buenos Aires, "CABA". */
export const nombreJurisdiccion = (codigo: number | null | undefined) =>
  codigo == null ? "—" : codigo === 901 ? "CABA" : JURISDICCIONES[codigo] ?? `Jurisdicción ${codigo}`;

/** El código para lo que venga: un número 901–924 (o 1–24), o el nombre escrito de cualquier forma
 *  ("CABA", "Pcia. de Buenos Aires", "IIBB Córdoba"…). null si no se reconoce. */
export function codigoJurisdiccion(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).trim());
  if (Number.isInteger(n)) {
    if (JURISDICCIONES[n]) return n;
    if (JURISDICCIONES[n + 900]) return n + 900;
  }
  const t = String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const directa = provinciaNormal(t);
  if (directa) return codigoDeNombre(directa);
  // Dentro de un texto más largo ("percepción de IIBB del régimen general para Buenos Aires").
  if (/\bcaba\b|ciudad (autonoma )?de buenos aires|capital federal/.test(t)) return 901;
  const orden = [...CODIGOS_JURISDICCION].sort((a, b) => JURISDICCIONES[b].length - JURISDICCIONES[a].length);
  for (const c of orden) {
    const nom = JURISDICCIONES[c].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (t.includes(nom)) return c;
  }
  if (/\bpba\b|\bbs ?as\b|pcia buenos aires/.test(t)) return 902;
  // Los formularios cortan los nombres largos ("SANTIAGO DEL").
  if (/^santiago\b/.test(t)) return 922;
  if (/^tierra del\b/.test(t)) return 923;
  return null;
}

function codigoDeNombre(nombre: string): number | null {
  const c = CODIGOS_JURISDICCION.find((k) => JURISDICCIONES[k] === nombre);
  return c ?? null;
}

/** La provincia de cada percepción de IIBB de una factura: el detalle de la factura si suma lo mismo que la percepción;
 *  si no, todo a la provincia del proveedor, y si no tiene, a la sede. Pura. */
export function provinciasDePercepcion(total: number, detalle: { jur: number; importe: number }[] | null, delProveedor: number | null, sede: number) {
  const d = (detalle ?? []).filter((x) => x && Number(x.jur) && Number(x.importe));
  const suma = r2(d.reduce((s, x) => s + Number(x.importe), 0));
  if (d.length && Math.abs(suma - total) <= 0.05) return d.map((x) => ({ jur: Number(x.jur), importe: r2(Number(x.importe)) }));
  return total ? [{ jur: delProveedor ?? sede, importe: r2(total) }] : [];
}

