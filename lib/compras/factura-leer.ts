// Leer el PDF de una factura de compra (gastos y servicios) con la IA (pedido de Fer, 23/10). La IA saca los datos
// del comprobante argentino y se arma un CbteArca, el mismo que sale de "Mis Comprobantes": así las líneas, los
// importes y el control de que cierren son los mismos que en la importación de ARCA (armarFactura).

import { pedirClaude, jsonDe } from "@/lib/claude";
import { tipoArca, type CbteArca, type Alicuota } from "@/lib/administracion/arca-mc-leer";
import { codigoJurisdiccion } from "@/lib/impuestos/jurisdicciones";

/** Lo que devuelve la IA. */
export type LecturaFactura = {
  tipo_codigo: number | null;        // código de ARCA (1 Factura A, 6 Factura B, 11 Factura C, 3 NC A…)
  punto_venta: number | null;
  numero: number | null;
  fecha: string | null;              // AAAA-MM-DD (de emisión)
  vencimiento: string | null;        // AAAA-MM-DD (del pago), si lo dice
  cuit_emisor: string | null;
  razon_social_emisor: string | null;
  cuit_receptor: string | null;
  moneda: "ARS" | "USD" | null;
  cotizacion: number | null;
  alicuotas: Alicuota[];             // neto e IVA por alícuota (A y M)
  no_gravado: number | null;
  exento: number | null;
  percepcion_iva: number | null;
  percepcion_iibb: number | null;
  /** Las percepciones de IIBB por provincia, si la factura las discrimina. */
  percepciones_iibb_provincias?: { provincia: string | number | null; importe: number | null }[] | null;
  otros_tributos: number | null;
  total: number | null;
  cae: string | null;
  /** false si el papel no es un comprobante (un pago, una transferencia, un cedulón o boleta de impuestos, un resumen). */
  es_comprobante?: boolean | null;
  /** Qué es, en pocas palabras, cuando no es un comprobante. */
  que_es?: string | null;
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const n = (x: unknown) => (Number.isFinite(Number(x)) ? Math.abs(Number(x)) : 0);

/** La lectura → un comprobante como los de ARCA (o el motivo por el que no sirve). Pura. */
export function aComprobante(l: LecturaFactura): { c: CbteArca } | { error: string } {
  const t = l.tipo_codigo != null ? tipoArca(Number(l.tipo_codigo)) : null;
  if (!t) return { error: `No se reconoce el tipo de comprobante${l.tipo_codigo != null ? ` (${l.tipo_codigo})` : ""}: cargala a mano.` };
  const cuit = String(l.cuit_emisor ?? "").replace(/\D/g, "");
  if (cuit.length !== 11) return { error: "No se leyó el CUIT del proveedor: cargala a mano." };
  if (!l.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(l.fecha)) return { error: "No se leyó la fecha de la factura: cargala a mano." };
  if (!(Number(l.numero) > 0)) return { error: "No se leyó el número de la factura: cargala a mano." };
  const alicuotas = (l.alicuotas ?? []).map((a) => ({ pct: Number(a.pct), neto: r2(n(a.neto)), iva: r2(n(a.iva)) })).filter((a) => a.neto || a.iva);
  const moneda = l.moneda === "USD" ? "USD" : "ARS";
  return {
    c: {
      fila: 0, fecha: l.fecha, tipo: Number(l.tipo_codigo), tipoTexto: t.texto, letra: t.letra, nc: t.nc, nd: t.nd,
      puntoVenta: Math.trunc(n(l.punto_venta)), numero: Math.trunc(n(l.numero)), numeroHasta: null, cae: l.cae ? String(l.cae).replace(/\D/g, "") || null : null,
      cuit, denominacion: (l.razon_social_emisor ?? "").trim() || `CUIT ${cuit}`, moneda, cotizacion: moneda === "USD" ? n(l.cotizacion) : 1,
      alicuotas, netoGravado: r2(alicuotas.reduce((s, a) => s + a.neto, 0)), noGravado: r2(n(l.no_gravado)), exento: r2(n(l.exento)),
      percepcionIva: r2(n(l.percepcion_iva)), percepcionIibb: r2(n(l.percepcion_iibb)), otrosTributos: r2(n(l.otros_tributos)),
      iva: r2(alicuotas.reduce((s, a) => s + a.iva, 0)), total: r2(n(l.total)),
    },
  };
}

/** Las percepciones de IIBB por provincia leídas ([{jur, importe}]), sólo si suman la percepción de la factura (con
 *  5 centavos de tolerancia) y se reconoce cada provincia. Pura. */
export function detalleIibb(l: LecturaFactura, total: number): { jur: number; importe: number }[] | null {
  if (!(total > 0)) return null;
  const m = new Map<number, number>();
  for (const x of l.percepciones_iibb_provincias ?? []) {
    const jur = codigoJurisdiccion(x?.provincia);
    const imp = r2(n(x?.importe));
    if (!imp) continue;
    if (!jur) return null;
    m.set(jur, r2((m.get(jur) ?? 0) + imp));
  }
  const d = [...m].map(([jur, importe]) => ({ jur, importe }));
  return d.length && Math.abs(d.reduce((s, x) => s + x.importe, 0) - total) <= 0.05 ? d : null;
}

const SISTEMA = `Leés comprobantes argentinos (facturas, notas de crédito y de débito, recibos, liquidaciones) que le emitieron a una empresa sus proveedores, y devolvés SÓLO un JSON, sin texto antes ni después:
{"es_comprobante": true | false (false si NO es un comprobante fiscal emitido por un proveedor: un comprobante de pago o de transferencia, un ticket de pago de un servicio, un cedulón o boleta de impuestos o tasas (Rentas, municipalidad, ARCA), un resumen de cuenta o de tarjeta, un presupuesto; en ese caso el resto puede ir en null),
 "que_es": "texto corto" (qué es, si no es un comprobante; si no, null),
 "tipo_codigo": número (el "COD." que figura junto a la letra: 1 Factura A, 2 ND A, 3 NC A, 6 Factura B, 7 ND B, 8 NC B, 11 Factura C, 12 ND C, 13 NC C, 51 Factura M, 201 FCE MiPyME A, 206 FCE B, 211 FCE C, 17/18 liquidación de servicios públicos A/B, 63/64 liquidación A/B; si no lo dice, deducilo de la letra y el tipo),
 "punto_venta": número, "numero": número, "fecha": "AAAA-MM-DD" (de emisión), "vencimiento": "AAAA-MM-DD" o null (del pago),
 "cuit_emisor": "11 dígitos" (el de quien emite, arriba), "razon_social_emisor": "texto", "cuit_receptor": "11 dígitos" (el del cliente, a quién va facturado),
 "moneda": "ARS" | "USD", "cotizacion": número o null (si es en dólares),
 "alicuotas": [{"pct": 21, "neto": número, "iva": número}] (neto gravado e IVA de cada alícuota; vacío si no discrimina IVA, como en B y C),
 "no_gravado": número, "exento": número, "percepcion_iva": número, "percepcion_iibb": número (percepciones de ingresos brutos de cualquier jurisdicción, sumadas), "percepciones_iibb_provincias": [{"provincia": "Córdoba", "importe": número}] (cada percepción de ingresos brutos con su provincia, si la factura lo dice; vacío si no),
 "otros_tributos": número (impuestos internos, tasas municipales y otros tributos, sumados), "total": número (el importe total), "cae": "14 dígitos" o null}
Los importes en la moneda del comprobante, con punto decimal (12345.67), sin signo. Si un dato no está, null o 0. No inventes nada.`;

/** Manda el archivo (PDF o imagen) a la IA y devuelve lo leído. */
export async function leerFacturaArchivo(datos: ArrayBuffer, tipo: string): Promise<{ lectura: LecturaFactura } | { error: string }> {
  const b64 = Buffer.from(datos).toString("base64");
  const imagen = /^image\/(png|jpeg|webp|gif)$/.test(tipo) ? (tipo as "image/png" | "image/jpeg" | "image/webp" | "image/gif") : null;
  const r = await pedirClaude({
    system: SISTEMA, modelo: "grande", effort: "medium", maxTokens: 3000,
    contenido: [
      imagen
        ? { type: "image", source: { type: "base64", media_type: imagen, data: b64 } }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
      { type: "text", text: "Leé este comprobante y devolvé el JSON." },
    ],
  });
  if ("error" in r) return { error: `La IA no pudo leer la factura (${r.error}).` };
  const l = jsonDe<LecturaFactura>(r.texto);
  if (!l || typeof l !== "object") return { error: "La IA no devolvió los datos de la factura: probá de nuevo o cargala a mano." };
  return { lectura: { ...l, alicuotas: Array.isArray(l.alicuotas) ? l.alicuotas : [] } };
}
