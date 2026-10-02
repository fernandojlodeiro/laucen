// Piezas de las pantallas de facturación: número de comprobante, estados y
// nombre del PDF.

import { TIPOS_CBTE } from "@/lib/arca/facturar";

export const ESTADOS_CBTE = {
  autorizado: { texto: "Autorizado", tono: "verde" },
  pendiente: { texto: "Pendiente", tono: "gris" },
  rechazado: { texto: "Rechazado", tono: "rojo" },
  error: { texto: "Error", tono: "amarillo" },
} as const;
export type EstadoCbte = keyof typeof ESTADOS_CBTE;

/** 00003-00000042 (sin número todavía: 00003-…). */
export const numeroCbte = (pv: number, n: number | string | null) =>
  `${String(pv).padStart(5, "0")}-${n == null ? "…" : String(n).padStart(8, "0")}`;

export const nombreTipo = (t: number) => TIPOS_CBTE[t]?.nombre ?? `Tipo ${t}`;

/** Factura-A-00003-00000042.pdf / Nota-de-credito-B-….pdf */
export const nombrePdf = (t: number, pv: number, n: number | string | null) =>
  `${TIPOS_CBTE[t]?.nc ? "Nota-de-credito" : "Factura"}-${TIPOS_CBTE[t]?.letra ?? "X"}-${numeroCbte(pv, n)}.pdf`;
