// ¿Al cliente le faltan datos para facturar? (Fer, 22/10) Sólo se avisa a los que no son consumidor
// final: con otra condición de IVA hace falta un CUIT válido. Uno sin condición se factura como
// consumidor final, así que no se avisa. Pura: la usa el pedido (aviso al elegir el cliente).

import { cuitCierra } from "@/lib/cuit-verificador";

const NOMBRES: Record<string, string> = {
  responsable_inscripto: "Responsable inscripto", monotributo: "Monotributo", exento: "Exento", no_responsable: "No responsable",
};

/** El motivo en criollo, o null si tiene todo. */
export function faltaParaFacturar(condicionIva: string | null | undefined, cuit: string | null | undefined): string | null {
  if (!condicionIva || condicionIva === "consumidor_final") return null;
  const c = String(cuit ?? "").replace(/\D/g, "");
  const es = NOMBRES[condicionIva] ?? condicionIva;
  if (!c) return `es ${es} y le falta el CUIT`;
  if (!cuitCierra(c)) return `es ${es} y su CUIT no es válido`;
  return null;
}
