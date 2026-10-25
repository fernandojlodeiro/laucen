// Esquema de cuotas y descuentos de la tienda web (Fer, 24/10), en
// canal.config.financiacion. Se carga en Configuración › Tienda web › Cuotas y
// descuentos (/config/tienda/financiacion). Prendido, reemplaza los planes por
// familia o producto (Configuración › Cuotas) en la tienda:
//
//   - Planes (3, 6, 12 cuotas…): al pagar se ofrecen todos, cueste lo que cueste la compra
//     (Fer, 24/10). "desde" decide sólo qué se muestra en la tarjeta: el de Payway sin interés
//     más largo cuyo "desde" llega al precio; los de Mercado Pago, la cucarda "Hasta N cuotas".
//   - interes_pct: lo que paga el comprador por financiar (0 = sin interés: el
//     costo del plan lo absorbe el precio). Con Payway se cobra de verdad: se
//     elige en el checkout y queda en el total del pedido (lib/tienda/cotizar.ts).
//   - codigo_payway: lo que se le manda a Payway como "installments" para ese plan. Payway
//     distingue el programa por ese número (Cuotas MiPyME: 13 = 3 cuotas, 16 = 6 cuotas,
//     "Opción en terminal" de su tabla); vacío = la cantidad de cuotas.
//   - costo_pct: lo que cobra el banco por ese plan. Sólo informativo (avisa si
//     el interés no lo cubre).
//   - medio: por dónde se cobra el plan. "payway" (de entrada): lo de arriba. "mercadopago": el
//     comprador paga en Mercado Pago, hasta esas cuotas, con el interés que cobra Mercado Pago (no se
//     suma nada de este lado); la cuota que se muestra es de referencia (lib/tienda/tasas-mp.ts).
//   - Descuento por pago contado: un % para transferencia, efectivo y/o débito
//     (débito = Payway con tarjeta de débito, en un pago).

import type { Tienda } from "@/lib/tienda/tienda";

export type MedioPlan = "payway" | "mercadopago";
export type PlanEscala = { cuotas: number; desde: number; costo_pct: number; interes_pct: number; codigo_payway: number | null; medio: MedioPlan };
export type MedioContado = "transferencia" | "efectivo" | "debito";
export type Financiacion = { activo: boolean; planes: PlanEscala[]; descuento_pct: number; medios_descuento: MedioContado[] };

export const MEDIOS_CONTADO: { clave: MedioContado; nombre: string }[] = [
  { clave: "transferencia", nombre: "Transferencia" }, { clave: "efectivo", nombre: "Efectivo" }, { clave: "debito", nombre: "Tarjeta de débito" },
];

/** Marcas de débito de Payway (payment_method_id): con descuento de débito, sólo éstas y en un pago. */
export const MARCAS_DEBITO = [31, 105, 108];
/** Las que aceptan los planes de cuotas sin interés de Payway: Visa y Mastercard de crédito (Fer, 25/10:
 *  la promo de cuotas es sólo con ésas; con otra tarjeta, en cuotas, va por Mercado Pago). */
export const MARCAS_CUOTAS = [1, 104];

/** Qué tarjetas se ofrecen al pagar con Payway: débito → sólo débito; en cuotas → Visa y Master de
 *  crédito; en un pago con crédito → las de crédito (si el débito tiene su opción, con descuento). Sin el
 *  esquema de cuotas prendido, todas. */
export function marcasPermitidas(f: Financiacion, debito: boolean, cuotas: number | null | undefined): (id: number) => boolean {
  if (debito) return (id) => MARCAS_DEBITO.includes(id);
  if (!f.activo) return () => true;
  if ((cuotas ?? 1) > 1) return (id) => MARCAS_CUOTAS.includes(id);
  return f.medios_descuento.includes("debito") ? (id) => !MARCAS_DEBITO.includes(id) : () => true;
}

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
      codigo_payway: Number.isInteger(Number(p?.codigo_payway)) && Number(p?.codigo_payway) > 0 && Number(p?.codigo_payway) < 1000 ? Number(p?.codigo_payway) : null,
      medio: (p?.medio === "mercadopago" ? "mercadopago" : "payway") as MedioPlan }))
    .filter((p) => p.cuotas >= 2 && !vistos.has(p.cuotas) && vistos.add(p.cuotas))
    .sort((a, b) => a.cuotas - b.cuotas);
  const medios = (Array.isArray(f.medios_descuento) ? f.medios_descuento : []).filter((m): m is MedioContado => MEDIOS_CONTADO.some((x) => x.clave === m));
  return { activo: !!f.activo, planes, descuento_pct: num(f.descuento_pct, 0, 90), medios_descuento: medios };
}

export const financiacionTienda = (t: Tienda) => financiacionDe(t.config.financiacion);

/** Los planes que se pueden elegir al pagar: todos, cueste lo que cueste la compra ("desde" sólo
 *  decide qué se muestra en la tarjeta). Con `medio`, sólo los que se cobran por ahí. En los de
 *  Mercado Pago, el interés es la tasa de referencia de `tasasMp` (si se sabe). */
export function planesDisponibles(f: Financiacion, o: { medio?: MedioPlan; tasasMp?: Map<number, number> | null } = {}) {
  return f.planes.filter((p) => !o.medio || p.medio === o.medio).map((p) => p.medio === "mercadopago"
    ? { cuotas: p.cuotas, interes_pct: o.tasasMp?.get(p.cuotas) ?? 0, medio: p.medio, referencia: !!o.tasasMp?.has(p.cuotas) }
    : { cuotas: p.cuotas, interes_pct: p.interes_pct, medio: p.medio });
}

/** El plan que se muestra en la tarjeta: el de Payway más largo con "desde" menor o igual al precio,
 *  prefiriendo los sin interés ("6 cuotas sin interés de $ …"). */
export function planDeEscala(f: Financiacion, precio: number) {
  const planes = planesDisponibles(f, { medio: "payway" }).filter((p) => precio >= (f.planes.find((x) => x.cuotas === p.cuotas)?.desde ?? 0));
  return planes.filter((p) => p.interes_pct === 0).at(-1) ?? planes.at(-1) ?? null;
}

/** "Hasta 12 cuotas": el plan de Mercado Pago más largo con "desde" menor o igual al precio (la cucarda de la tarjeta). */
export function cuotasMpDe(f: Financiacion, precio: number): number | null {
  return f.planes.filter((p) => p.medio === "mercadopago" && precio >= p.desde).at(-1)?.cuotas ?? null;
}

export const hayPlanMp = (f: Financiacion) => f.activo && f.planes.some((p) => p.medio === "mercadopago");

/** El % de descuento de un medio de pago con el esquema prendido (null = el esquema no lo decide). */
export function descuentoContado(f: Financiacion, medio: string): number | null {
  if (!f.activo) return null;
  const clave = medio === "payway_debito" ? "debito" : medio;
  if (clave !== "transferencia" && clave !== "efectivo" && clave !== "debito") return null;
  return f.medios_descuento.includes(clave) ? f.descuento_pct : 0;
}

/** "con transferencia", "con débito o transferencia", "con transferencia, efectivo o débito". Con
 *  `corto`, sin efectivo si hay otro (la tarjeta, para que entre en una línea). */
export function textoContado(medios: MedioContado[], corto = false): string {
  const n = (corto && medios.length > 1 ? medios.filter((m) => m !== "efectivo") : medios).map((m) => (m === "debito" ? "débito" : m));
  return `con ${n.length > 1 ? `${n.slice(0, -1).join(", ")} o ${n.at(-1)}` : n[0]}`;
}

/** El "installments" que se manda a Payway para pagar en esas cuotas: el código del plan si lo tiene
 *  (con el esquema prendido), si no la cantidad de cuotas. */
export function codigoPayway(f: Financiacion, cuotas: number): number {
  if (!f.activo || cuotas <= 1) return cuotas;
  return f.planes.find((p) => p.cuotas === cuotas)?.codigo_payway ?? cuotas;
}
