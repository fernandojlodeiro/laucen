// Esquema de cuotas y descuentos de la tienda web (Fer, 24/10), en
// canal.config.financiacion. Se carga en Configuración › Tienda web › Cuotas y
// descuentos (/config/tienda/financiacion). Prendido, reemplaza los planes por
// familia o producto (Configuración › Cuotas) en la tienda:
//
//   - Planes por escala de precio: cada plan (3, 6, 12 cuotas…) se ofrece a los
//     productos que cuestan "desde" su monto. La tarjeta muestra el plan más
//     largo que le toca; la ficha y el checkout, todos los que le tocan.
//   - interes_pct: lo que paga el comprador por financiar (0 = sin interés: el
//     costo del plan lo absorbe el precio). Con Payway se cobra de verdad: se
//     elige en el checkout y queda en el total del pedido (lib/tienda/cotizar.ts).
//   - codigo_payway: lo que se le manda a Payway como "installments" para ese plan. Payway
//     distingue el programa por ese número (Cuotas MiPyME: 13 = 3 cuotas, 16 = 6 cuotas,
//     "Opción en terminal" de su tabla); vacío = la cantidad de cuotas.
//   - costo_pct: lo que cobra el banco por ese plan. Sólo informativo (avisa si
//     el interés no lo cubre).
//   - Descuento por pago contado: un % para transferencia, efectivo y/o débito
//     (débito = Payway con tarjeta de débito, en un pago).

import type { Tienda } from "@/lib/tienda/tienda";

export type PlanEscala = { cuotas: number; desde: number; costo_pct: number; interes_pct: number; codigo_payway: number | null };
export type MedioContado = "transferencia" | "efectivo" | "debito";
export type Financiacion = { activo: boolean; planes: PlanEscala[]; descuento_pct: number; medios_descuento: MedioContado[] };

export const MEDIOS_CONTADO: { clave: MedioContado; nombre: string }[] = [
  { clave: "transferencia", nombre: "Transferencia" }, { clave: "efectivo", nombre: "Efectivo" }, { clave: "debito", nombre: "Tarjeta de débito" },
];

/** Marcas de débito de Payway (payment_method_id): con descuento de débito, sólo éstas y en un pago. */
export const MARCAS_DEBITO = [31, 105, 108];

const num = (x: unknown, min: number, max: number) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};

/** Lo guardado, limpio: planes de 2 a 24 cuotas sin repetir, ordenados. */
export function financiacionDe(x: unknown): Financiacion {
  const f = (x ?? {}) as Partial<Financiacion>;
  const vistos = new Set<number>();
  const planes = (Array.isArray(f.planes) ? f.planes : [])
    .map((p) => ({ cuotas: Math.trunc(num(p?.cuotas, 0, 24)), desde: num(p?.desde, 0, 1e12), costo_pct: num(p?.costo_pct, 0, 300), interes_pct: num(p?.interes_pct, 0, 300),
      codigo_payway: Number.isInteger(Number(p?.codigo_payway)) && Number(p?.codigo_payway) > 0 && Number(p?.codigo_payway) < 1000 ? Number(p?.codigo_payway) : null }))
    .filter((p) => p.cuotas >= 2 && !vistos.has(p.cuotas) && vistos.add(p.cuotas))
    .sort((a, b) => a.cuotas - b.cuotas);
  const medios = (Array.isArray(f.medios_descuento) ? f.medios_descuento : []).filter((m): m is MedioContado => MEDIOS_CONTADO.some((x) => x.clave === m));
  return { activo: !!f.activo, planes, descuento_pct: num(f.descuento_pct, 0, 90), medios_descuento: medios };
}

export const financiacionTienda = (t: Tienda) => financiacionDe(t.config.financiacion);

/** Los planes (cuotas e interés) que le tocan a ese precio: los de "desde" menor o igual. */
export function planesParaPrecio(f: Financiacion, precio: number) {
  return f.planes.filter((p) => precio >= p.desde).map((p) => ({ cuotas: p.cuotas, interes_pct: p.interes_pct }));
}

/** El plan que se muestra en la tarjeta: el más largo que le toca a ese precio. */
export function planDeEscala(f: Financiacion, precio: number) {
  return planesParaPrecio(f, precio).at(-1) ?? null;
}

/** El % de descuento de un medio de pago con el esquema prendido (null = el esquema no lo decide). */
export function descuentoContado(f: Financiacion, medio: string): number | null {
  if (!f.activo) return null;
  const clave = medio === "payway_debito" ? "debito" : medio;
  if (clave !== "transferencia" && clave !== "efectivo" && clave !== "debito") return null;
  return f.medios_descuento.includes(clave) ? f.descuento_pct : 0;
}

/** "con transferencia", "con débito o transferencia", "con transferencia, efectivo o débito". */
export function textoContado(medios: MedioContado[]): string {
  const n = medios.map((m) => (m === "debito" ? "débito" : m));
  return `con ${n.length > 1 ? `${n.slice(0, -1).join(", ")} o ${n.at(-1)}` : n[0]}`;
}

/** El "installments" que se manda a Payway para pagar en esas cuotas: el código del plan si lo tiene
 *  (con el esquema prendido), si no la cantidad de cuotas. */
export function codigoPayway(f: Financiacion, cuotas: number): number {
  if (!f.activo || cuotas <= 1) return cuotas;
  return f.planes.find((p) => p.cuotas === cuotas)?.codigo_payway ?? cuotas;
}
