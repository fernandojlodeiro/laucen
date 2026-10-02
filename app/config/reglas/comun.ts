// Reglas comerciales: las formas de condición y acción que ofrece la
// pantalla (en la base son jsonb: ver db/tienda.sql) y cómo se cuentan en
// criollo ("3 o más de Familia Placas → 10 % de descuento").

// Sin imports de servidor: lo usa también CamposRegla (navegador).
import { formatearNumero } from "@/lib/numeros";

const pesos = (n: number) => `$ ${formatearNumero(n, "pesos")}`;

export const CONDICIONES = {
  cantidad_producto: "Comprando N o más unidades de un producto",
  cantidad_familia: "Comprando N o más unidades de una familia",
  cantidad_cualquiera: "Comprando N o más unidades (de cualquier producto)",
  monto_minimo: "Compras desde $ X",
  medio_pago: "Pagando con un medio",
} as const;
export type FormaCondicion = keyof typeof CONDICIONES;

export const ACCIONES = {
  descuento_pct: "% de descuento",
  descuento_fijo: "$ de descuento",
  envio_bonificado: "Envío gratis",
} as const;
export type TipoAccion = keyof typeof ACCIONES;

export type Condicion = { tipo: string; cantidad?: number; producto_id?: number; familia_id?: number; monto?: number; medio?: string };
export type Accion = { tipo: string; valor?: number };

/** De la condición guardada, la forma que muestra el selector. */
export function formaDe(c: Condicion): FormaCondicion {
  if (c.tipo === "cantidad_minima") return c.producto_id ? "cantidad_producto" : c.familia_id ? "cantidad_familia" : "cantidad_cualquiera";
  return c.tipo === "medio_pago" ? "medio_pago" : "monto_minimo";
}

const num = (n: number | undefined, dec = 0) => (n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: dec });

/** "3 o más de Familia Placas → 10 % de descuento" */
export function enCriollo(c: Condicion, a: Accion, nombres: { producto?: string | null; familia?: string | null; medio?: string | null }) {
  const forma = formaDe(c);
  const cond = forma === "cantidad_producto" ? `${num(c.cantidad)} o más de ${nombres.producto ?? "un producto que ya no existe"}`
    : forma === "cantidad_familia" ? `${num(c.cantidad)} o más de Familia ${nombres.familia ?? "(borrada)"}`
    : forma === "cantidad_cualquiera" ? `${num(c.cantidad)} o más unidades`
    : forma === "medio_pago" ? `Pagando con ${nombres.medio ?? c.medio}`
    : `Compras desde ${pesos(c.monto ?? 0)}`;
  const acc = a.tipo === "descuento_pct" ? `${num(a.valor, 1)} % de descuento`
    : a.tipo === "descuento_fijo" ? `${pesos(a.valor ?? 0)} de descuento`
    : "Envío gratis";
  return `${cond} → ${acc}`;
}
