// Piezas de Ventas que comparten Pedidos y Clientes: cómo se escriben las
// fechas, el color de cada estado y los nombres de los datos fiscales.

import type { EstadoPedido, EstadoPago } from "@/lib/pedidos";

const ZONA = "America/Argentina/Buenos_Aires";

/** "01/10/2026" */
export function fecha(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "01/10/2026 14:32" */
export function fechaHora(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Tono = "verde" | "gris" | "amarillo" | "rojo" | "azul" | "ambar" | "naranja" | "violeta";

export const TONO_ESTADO: Record<EstadoPedido, Tono> = {
  presupuesto: "violeta", nuevo: "azul", pagado: "naranja", en_preparacion: "amarillo", preparado: "amarillo",
  despachado: "azul", entregado: "verde", cancelado: "rojo", devuelto: "gris",
};

export const TONO_PAGO: Record<EstadoPago, Tono> = {
  pendiente: "amarillo", pagado: "verde", a_cobrar: "ambar", a_convenir: "gris", reembolsado: "rojo",
};

export const TIPOS_CLIENTE = { consumidor_final: "Consumidor final", mayorista: "Mayorista" } as const;
export const DOCUMENTOS = ["DNI", "CUIT", "CUIL", "PASAPORTE", "OTRO"] as const;
export const CONDICIONES_IVA = {
  consumidor_final: "Consumidor final", responsable_inscripto: "Responsable inscripto",
  monotributo: "Monotributo", exento: "Exento", no_responsable: "No responsable",
} as const;

export const etiqueta = <T extends Record<string, string>>(mapa: T, k: string | null | undefined) =>
  k && Object.hasOwn(mapa, k) ? mapa[k as keyof T] : (k ?? "—");
