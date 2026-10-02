// Los nombres en criollo de lo que manda Mercado Envíos (logística, estado y
// subestado), y las pestañas de la pantalla de envíos.

export const LOGISTICA: Record<string, string> = {
  fulfillment: "Full", self_service: "Flex", cross_docking: "Colecta", xd_drop_off: "Colecta",
  drop_off: "Despacho en correo/punto", custom: "A convenir", not_specified: "A convenir",
};

export const ESTADO_ENVIO: Record<string, string> = {
  pending: "Pendiente", handling: "En preparación", ready_to_ship: "Listo para despachar", shipped: "En camino",
  delivered: "Entregado", not_delivered: "No entregado", cancelled: "Cancelado",
};

export const SUBESTADO_ENVIO: Record<string, string> = {
  ready_to_print: "Etiqueta lista para imprimir", printed: "Etiqueta impresa",
};

export const TONO_ENVIO: Record<string, "verde" | "gris" | "amarillo" | "rojo" | "azul"> = {
  pending: "gris", handling: "amarillo", ready_to_ship: "amarillo", shipped: "azul",
  delivered: "verde", not_delivered: "rojo", cancelled: "rojo",
};

export const PESTANAS = [
  ["despachar", "Para despachar"], ["camino", "En camino"], ["entregados", "Entregados"], ["todos", "Todos"],
] as const;
export type Pestana = (typeof PESTANAS)[number][0];
export const esPestana = (x?: string): x is Pestana => PESTANAS.some(([k]) => k === x);
