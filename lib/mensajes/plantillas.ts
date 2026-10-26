// Las plantillas de WhatsApp de Laucen (Fer, 25/10): los mensajes que salen fuera de las 24 h del último
// mensaje del cliente necesitan una plantilla aprobada por Meta. Acá está la lista de las que usa Laucen,
// con su texto; se mandan a Meta a mano, con un clic, desde Configuración › Plantillas de WhatsApp, donde
// también se ve si están aprobadas. Laucen nunca manda una plantilla sola: el texto se acuerda antes con Fer.

import { plantillaFactura, PLANTILLA_FACTURA } from "@/lib/facturacion/envio";
import { plantillaAviso, nombrePlantilla } from "@/lib/mensajes/avisos-pedido";

export type Contexto = { tienda: string; panel: string };
export type PlantillaLaucen = { nombre: string; titulo: string; cuando: string; armar: (c: Contexto) => Record<string, unknown> };

export const PLANTILLAS: PlantillaLaucen[] = [
  { nombre: PLANTILLA_FACTURA, titulo: "Factura", cuando: "Al autorizarse la factura, a quien la pidió por WhatsApp.", armar: (c) => plantillaFactura(c.panel) },
  { nombre: nombrePlantilla("pagado"), titulo: "Pago confirmado", cuando: "Cuando el pedido queda pagado.", armar: (c) => plantillaAviso("pagado", c.tienda) },
  { nombre: nombrePlantilla("despachado"), titulo: "Pedido en camino", cuando: "Con el botón «Despachado» del pedido.", armar: (c) => plantillaAviso("despachado", c.tienda) },
  { nombre: nombrePlantilla("listo_retirar"), titulo: "Listo para retirar", cuando: "Con el botón «Preparado» de un pedido que retira.", armar: (c) => plantillaAviso("listo_retirar", c.tienda) },
  // El seguimiento de los pedidos sin pagar (lib/pedidos/seguimiento.ts): textos aprobados por Fer el 25/10.
  { nombre: nombrePlantilla("recibido"), titulo: "Pedido recibido (sin pagar)", cuando: "Al entrar un pedido que espera el pago: transferencia o efectivo por la tienda, o cargado a mano.", armar: (c) => plantillaAviso("recibido", c.tienda) },
  { nombre: nombrePlantilla("pago_incompleto"), titulo: "Pago sin completar", cuando: "A los 10 minutos de un pedido con tarjeta o Mercado Pago que no se pagó.", armar: (c) => plantillaAviso("pago_incompleto", c.tienda) },
  { nombre: nombrePlantilla("recordatorio"), titulo: "Recordatorio de pago", cuando: "A los 2 días de un pedido que sigue sin pagar.", armar: (c) => plantillaAviso("recordatorio", c.tienda) },
  { nombre: nombrePlantilla("ultimo_dia"), titulo: "Último día de la reserva", cuando: "El último día de la reserva, a la mañana.", armar: (c) => plantillaAviso("ultimo_dia", c.tienda) },
  { nombre: nombrePlantilla("reserva_anulada"), titulo: "Reserva anulada", cuando: "Cuando el pedido se cancela solo porque venció la reserva.", armar: (c) => plantillaAviso("reserva_anulada", c.tienda) },
];

/** El texto que lee el cliente (el cuerpo de la plantilla). */
export function cuerpoDe(p: PlantillaLaucen, c: Contexto): string {
  const comps = (p.armar(c).components ?? []) as { type: string; text?: string }[];
  return comps.find((x) => x.type === "BODY")?.text ?? "";
}

/** El botón de la plantilla, si tiene. */
export function botonDe(p: PlantillaLaucen, c: Contexto): string | null {
  const comps = (p.armar(c).components ?? []) as { type: string; buttons?: { text?: string }[] }[];
  return comps.find((x) => x.type === "BUTTONS")?.buttons?.[0]?.text ?? null;
}

/** El estado de Meta, en criollo. */
export function estadoLegible(estado: string | null): { texto: string; tono: "verde" | "ambar" | "rojo" | "naranja" | "gris" } {
  switch (estado) {
    case "APPROVED": return { texto: "Aprobada", tono: "verde" };
    case "PENDING": case "IN_APPEAL": return { texto: "En revisión", tono: "ambar" };
    case "REJECTED": return { texto: "Rechazada", tono: "rojo" };
    case "PAUSED": return { texto: "Pausada", tono: "naranja" };
    case "DISABLED": return { texto: "Desactivada", tono: "rojo" };
    case null: case "": return { texto: "Sin mandar", tono: "gris" };
    default: return { texto: estado, tono: "gris" };
  }
}

/** El motivo del rechazo, en criollo. */
export function motivoRechazoLegible(m: string | null): string | null {
  if (!m) return null;
  const t: Record<string, string> = {
    INVALID_FORMAT: "el formato del texto no es válido", INCORRECT_CATEGORY: "Meta cree que no es un aviso de una compra sino publicidad",
    PROMOTIONAL: "Meta lo tomó como publicidad", ABUSIVE_CONTENT: "Meta lo consideró contenido no permitido", TAG_CONTENT_MISMATCH: "el texto no coincide con la categoría",
    SCAM: "Meta lo consideró engañoso",
  };
  return t[m] ?? "Meta no dio el motivo";
}
