// Leer el PDF de un despacho de importación con la IA (pedido de Fer, 23/10). La IA saca lo que dice el
// despacho (número, fecha, dólar, FOB, flete, seguro, la liquidación y la mercadería); lo de acá
// abajo es puro: decide a qué lado va cada concepto de la liquidación (gasto que suma al costo o
// impuesto que es crédito fiscal) y lo pasa a pesos con el dólar del despacho. El SIM liquida en
// dólares: cada importe en pesos = importe × cotización.

import { pedirClaude, jsonDe } from "@/lib/claude";

/** Lo que devuelve la IA (los importes, tal cual el despacho). */
export type LecturaDespacho = {
  numero: string | null;
  fecha: string | null;               // AAAA-MM-DD (la de oficialización)
  cotizacion: number | null;
  cuit_importador: string | null;
  vendedor: string | null;
  via: string | null;
  fob_usd: number | null;
  flete_usd: number | null;
  seguro_usd: number | null;
  /** El total de la liquidación del despacho (columna TOTAL), un renglón por concepto. */
  liquidacion: { codigo: string | null; concepto: string; importe_usd: number }[];
  /** La mercadería: un renglón por subítem si los hay (marca y modelo), si no por ítem. */
  items: { descripcion: string; ncm: string | null; cantidad: number; fob_unit_usd: number }[];
};

export type ItemPesos = { concepto: string; importe_ars: number };

const r2 = (x: number) => Math.round(x * 100) / 100;
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();

/** A qué lado va un concepto de la liquidación y con qué nombre (los nombres de impuestos son los que reconoce el asiento). */
export function clasificarConcepto(concepto: string, codigo?: string | null): { lado: "gastos" | "impuestos"; nombre: string } {
  const c = normal(concepto);
  if (/\biva\b/.test(c) && /adic/.test(c)) return { lado: "impuestos", nombre: "IVA adicional" };
  if (/^iva\b|\biva\b/.test(c)) return { lado: "impuestos", nombre: "IVA" };
  if (/ganancia/.test(c)) return { lado: "impuestos", nombre: "Ganancias" };
  if (/ingresos brutos|\biibb\b/.test(c)) return { lado: "impuestos", nombre: "IIBB" };
  if (/derecho/.test(c) || codigo === "010") return { lado: "gastos", nombre: "Derechos de importación" };
  if (/tasa/.test(c) && /estad/.test(c)) return { lado: "gastos", nombre: "Tasa estadística" };
  if (/arancel/.test(c) && /sim/.test(c)) return { lado: "gastos", nombre: "Arancel SIM" };
  const lindo = concepto.trim().toLowerCase().replace(/^./, (x) => x.toUpperCase());
  return { lado: "gastos", nombre: lindo || "Otro concepto" };
}

/** La lectura → lo que se carga en el despacho: gastos e impuestos en pesos y los avisos de control. */
export function aDespacho(l: LecturaDespacho) {
  const cot = Number(l.cotizacion) || 0;
  const gastos: ItemPesos[] = [], impuestos: ItemPesos[] = [];
  for (const x of l.liquidacion ?? []) {
    const usd = Number(x.importe_usd) || 0;
    if (!usd) continue;
    const k = clasificarConcepto(x.concepto, x.codigo);
    const destino = k.lado === "gastos" ? gastos : impuestos;
    const ya = destino.find((g) => g.concepto === k.nombre);
    const ars = r2(usd * cot);
    if (ya) ya.importe_ars = r2(ya.importe_ars + ars); else destino.push({ concepto: k.nombre, importe_ars: ars });
  }
  const avisos: string[] = [];
  if (!(cot > 0)) avisos.push("No se leyó la cotización del dólar: cargala a mano (los importes en pesos dependen de ella).");
  const fobItems = r2((l.items ?? []).reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.fob_unit_usd) || 0), 0));
  if (l.fob_usd && fobItems && Math.abs(fobItems - Number(l.fob_usd)) > 1)
    avisos.push(`La mercadería leída suma US$ ${fobItems.toLocaleString("es-AR")} de FOB y el despacho dice US$ ${Number(l.fob_usd).toLocaleString("es-AR")}.`);
  return { gastos, impuestos, fobItems, avisos };
}

const SISTEMA = `Leés despachos de importación argentinos (formulario OM-1993 SIM de ARCA/Aduana) y devolvés SÓLO un JSON, sin texto antes ni después:
{"numero": "26017IC04006534U" (año, aduana, tipo y número de registro con su dígito, todo junto sin espacios),
 "fecha": "AAAA-MM-DD" (la de oficialización),
 "cotizacion": número (el "Cotiz =" de Información Complementaria; el dólar del despacho),
 "cuit_importador": "11 dígitos sin guiones",
 "vendedor": "nombre del vendedor sin el código entre paréntesis",
 "via": "AVION" | "MARITIMA" | lo que diga,
 "fob_usd": número (FOB Total), "flete_usd": número (Flete Total), "seguro_usd": número (Seguro Total),
 "liquidacion": [{"codigo": "010", "concepto": "DERECHOS IMPORTACION", "importe_usd": número}] — SÓLO la columna TOTAL de la liquidación de la primera hoja (no la de cada ítem); un renglón por concepto,
 "items": [{"descripcion": "MARCA MODELO", "ncm": "8471.30.19.910G", "cantidad": número, "fob_unit_usd": número}] — la mercadería: si hay subítems (hoja "Nro. ítem … Subitem Nro."), un renglón por subítem con la marca (AA) y el modelo (AB) en la descripción; si un ítem no tiene subítems, un renglón por ítem con su marca y modelo y su "Unitario en Divisa".}
Los números con punto decimal (1524.5, no "1.524,50"). Si un dato no está, null. No inventes nada.`;

/** Manda el PDF a la IA y devuelve lo leído (o el motivo por el que no se pudo). */
export async function leerDespachoPdf(pdf: ArrayBuffer): Promise<{ lectura: LecturaDespacho; usd: number } | { error: string }> {
  const r = await pedirClaude({
    system: SISTEMA, modelo: "grande", effort: "medium", maxTokens: 6000,
    contenido: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
      { type: "text", text: "Leé este despacho y devolvé el JSON." },
    ],
  });
  if ("error" in r) return { error: `La IA no pudo leer el despacho (${r.error}).` };
  const l = jsonDe<LecturaDespacho>(r.texto);
  if (!l || typeof l !== "object") return { error: "La IA no devolvió los datos del despacho: probá de nuevo o cargalo a mano." };
  return { lectura: { ...l, liquidacion: Array.isArray(l.liquidacion) ? l.liquidacion : [], items: Array.isArray(l.items) ? l.items : [] }, usd: r.usd };
}
