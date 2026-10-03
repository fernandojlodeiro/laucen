// Cómo se cuentan en criollo los cambios de la cola de Mercado Libre
// (lib/mercadolibre/cola.ts): qué se pide y qué había antes.

export const TIPOS_COLA: Record<string, string> = {
  stock: "Stock", estado: "Estado", precio: "Precio", descuento: "Descuento", campana: "Campaña",
  atributos: "Atributos", crear: "Publicación nueva", factura: "Factura", otro: "Otro",
};
export const ORIGENES_COLA: Record<string, string> = { automatico: "Automático", boton: "Botón", barrida: "Barrida nocturna" };
export const ESTADOS_COLA: Record<string, string> = {
  preparado: "Preparado, falta tu clic", pendiente: "Pendiente", enviando: "Enviando", ok: "Enviado", error: "Con error", descartado: "Descartado",
};
export const TONO_COLA: Record<string, "verde" | "gris" | "amarillo" | "rojo" | "azul"> = {
  preparado: "amarillo", pendiente: "azul", enviando: "azul", ok: "verde", error: "rojo", descartado: "gris",
};

const ESTADO_ML: Record<string, string> = { paused: "pausada", active: "activa", closed: "cerrada", activa: "activa", pausada: "pausada", cerrada: "cerrada" };
const n = (x: unknown) => Number(x).toLocaleString("es-AR");

/** "Pausar", "Cantidad 5", "Cantidad 4 y activar", "Precio $ 1.500"… */
export function describirCambio(tipo: string, p: Record<string, unknown> | null | undefined): string {
  if (!p) return "—";
  // Lo que arma quien preparó el cambio, ya en criollo (ej. precios en ML).
  if (typeof p.descripcion === "string" && p.descripcion) return p.descripcion;
  const partes: string[] = [];
  if (p.cantidad != null) partes.push(`cantidad ${n(p.cantidad)}`);
  if (p.estado) partes.push(p.estado === "paused" ? "pausar" : p.estado === "active" ? "activar" : p.estado === "closed" ? "cerrar" : String(p.estado));
  if (p.precio != null) partes.push(`precio $ ${n(p.precio)}`);
  if (!partes.length && Array.isArray(p.pedidos)) partes.push(`${p.pedidos.length} pedido${p.pedidos.length === 1 ? "" : "s"} a ML`);
  if (!partes.length && p.cuerpo) partes.push(TIPOS_COLA[tipo] ?? tipo);
  const t = partes.join(" y ") || (TIPOS_COLA[tipo] ?? tipo);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Lo que había: "activa, 3 u.", "$ 1.400"… */
export function describirAntes(p: Record<string, unknown> | null | undefined): string {
  if (!p) return "—";
  const partes: string[] = [];
  if (p.estado) partes.push(ESTADO_ML[String(p.estado)] ?? String(p.estado));
  if (p.cantidad != null) partes.push(`${n(p.cantidad)} u.`);
  if (p.precio != null) partes.push(`$ ${n(p.precio)}`);
  if (Array.isArray(p.escalones)) partes.push(p.escalones.length ? `volumen ${p.escalones.map((e: { cantidad: number; precio: number }) => `${e.cantidad}+ $ ${n(e.precio)}`).join(", ")}` : "sin volumen");
  return partes.join(", ") || "—";
}
