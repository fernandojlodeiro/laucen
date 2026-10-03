// Las dos diferencias que se asientan solas, sin base (se prueban en
// tests/diferencias.test.ts): la diferencia de cambio de una imputación de
// cuenta corriente y la diferencia entre lo facturado y lo recibido en una
// factura de compra vinculada a una recepción. Las usa contabilizarPendientes()
// de lib/administracion/contabilidad.ts (y registrarFactura() de compras.ts).

import type { Linea } from "@/lib/administracion/contabilidad-base";

const r2 = (x: number) => Math.round(x * 100) / 100;

// ── Diferencia de cambio ───────────────────────────────────
//
// Cada renglón de cuenta corriente quedó en la contabilidad en pesos a SU
// cotización (la factura en dólares, a la de la factura; la orden de pago, en
// pesos). Cuando una imputación cancela una parte de cada uno, la parte de la
// deuda vale en pesos (lo cancelado × la cotización de la deuda) y la del
// pago, (lo cancelado × la cotización del pago). Si no dan igual, Deudores o
// Proveedores quedaría con un resto en pesos que ya no se debe: ése es el
// ajuste por diferencia de cambio.

/** Lo que bajó un renglón en una imputación (en su moneda) y cómo quedó
 *  grabado el renglón entero: importe en su moneda e importe en pesos. */
export type LadoImputacion = { cancelado: number; importe: number; importeArs: number };

/** Lo cancelado de un renglón, en pesos a la cotización con que se registró
 *  (importe en pesos / importe en su moneda). Un renglón en pesos, tal cual. */
export function pesosDeSuFecha(l: LadoImputacion): number {
  if (!l.importe) return Math.abs(l.cancelado);
  return Math.abs(l.cancelado * (l.importeArs / l.importe));
}

/** Diferencia de cambio de una imputación, en pesos: lo que vale en pesos la
 *  parte del crédito (pago, cobro, nota de crédito) menos lo que valía la
 *  parte de la deuda. Positiva: el crédito valía más que la deuda que canceló
 *  (con un proveedor, se pagó más: pérdida; con un cliente, se cobró más:
 *  ganancia). Entre dos renglones en pesos da siempre cero. */
export function diferenciaDeCambio(debito: LadoImputacion, credito: LadoImputacion): number {
  return r2(pesosDeSuFecha(credito) - pesosDeSuFecha(debito));
}

/** El asiento de la diferencia de cambio. Con un proveedor, la orden de pago
 *  debitó Proveedores por más (o menos) de lo que la factura le acreditó:
 *  se corrige Proveedores contra la diferencia negativa (o positiva). Con un
 *  cliente, al revés con Deudores por ventas. Cero: sin renglones. */
export function lineasDiferenciaCambio(tercero: "cliente" | "proveedor", dif: number, rol: Record<string, number>): Linea[] {
  const d = r2(dif);
  if (!d) return [];
  const positiva = rol.diferencia_cambio_positiva, negativa = rol.diferencia_cambio_negativa;
  if (tercero === "proveedor") {
    return d > 0
      ? [{ cuentaId: negativa, debe: d }, { cuentaId: rol.proveedores, haber: d }]
      : [{ cuentaId: rol.proveedores, debe: -d }, { cuentaId: positiva, haber: -d }];
  }
  return d > 0
    ? [{ cuentaId: rol.deudores, debe: d }, { cuentaId: positiva, haber: d }]
    : [{ cuentaId: negativa, debe: -d }, { cuentaId: rol.deudores, haber: -d }];
}

/** Transferencia entre cuentas de fondos: si las patas en pesos no dan cero
 *  (distinta moneda), la diferencia va a diferencias de cambio. `patas` ya
 *  vienen con debe (lo que entra, positivo; lo que sale, negativo). */
export function lineaDiferenciaTransferencia(patas: Linea[], rol: Record<string, number>): Linea | null {
  const dif = r2(patas.reduce((s, l) => s + (l.debe ?? 0) - (l.haber ?? 0), 0));
  if (!dif) return null;
  // Entró más de lo que salió (en pesos): ganancia, al haber.
  return { cuentaId: dif > 0 ? rol.diferencia_cambio_positiva : rol.diferencia_cambio_negativa, debe: -dif, detalle: "Diferencia de cambio" };
}

// ── Diferencia entre lo facturado y lo recibido ────────────
//
// Una factura vinculada a una recepción pone el costo con lo FACTURADO, y el
// asiento de la compra debita Mercaderías por todo lo facturado. Pero al
// stock entró lo RECIBIDO. Si se facturó de más (faltante), Mercaderías tiene
// unidades que no están: se sacan contra "Diferencias en recepciones de
// stock" (egreso). Si se recibió de más (sobrante), hay unidades en el stock
// que no pasaron por Mercaderías: se suman a su costo de la factura contra la
// misma cuenta (la achica). Si después llega la factura de esas unidades
// (vinculada a la misma recepción), ella no encuentra nada recibido sin
// cubrir y su faltante revierte el sobrante: al final queda en cero.

export type DiferenciaRecepcion = {
  variacion_id: number; facturado: number; recibido: number;
  /** facturado − recibido: positiva = faltante (se facturó de más), negativa = sobrante. */
  diferencia: number; costo_unit_ars: number;
  /** diferencia × costo, en pesos (con su signo). */
  importe: number;
};

/** Las diferencias de cada producto de una factura vinculada a una recepción.
 *  `recibido` = lo que entró por la recepción; `cubiertoAntes` = lo que de
 *  esa recepción ya cubrieron otras facturas registradas antes. "Recibido"
 *  de esta factura es lo que queda sin cubrir (nunca negativo). El costo de
 *  un producto en varias líneas es el promedio de esas líneas. Sólo vuelven
 *  los productos con diferencia. */
export function diferenciasRecepcion(
  lineas: { variacionId: number; cantidad: number; costoUnitArs: number }[],
  recibido: Map<number, number>,
  cubiertoAntes: Map<number, number> = new Map(),
): DiferenciaRecepcion[] {
  const por = new Map<number, { cant: number; valor: number }>();
  for (const l of lineas) {
    const x = por.get(l.variacionId) ?? { cant: 0, valor: 0 };
    x.cant += l.cantidad; x.valor += l.cantidad * l.costoUnitArs;
    por.set(l.variacionId, x);
  }
  const out: DiferenciaRecepcion[] = [];
  for (const [v, x] of por) {
    const rec = Math.max(0, (recibido.get(v) ?? 0) - (cubiertoAntes.get(v) ?? 0));
    const diferencia = Math.round((x.cant - rec) * 1000) / 1000;
    if (!diferencia) continue;
    const costo = x.cant ? r2(x.valor / x.cant) : 0;
    out.push({ variacion_id: v, facturado: x.cant, recibido: rec, diferencia, costo_unit_ars: costo, importe: r2(diferencia * costo) });
  }
  return out;
}

/** Lo que una factura cubrió de la recepción, por producto: todo lo que
 *  quedaba recibido sin cubrir de los productos que factura (con faltante o
 *  sobrante, la recepción de ese producto queda cerrada por esta factura); sin
 *  diferencia, lo facturado. Sirve para `cubiertoAntes` de la próxima. */
export function cubiertoPorFactura(lineas: { variacionId: number; cantidad: number }[], difs: DiferenciaRecepcion[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of lineas) m.set(l.variacionId, (m.get(l.variacionId) ?? 0) + l.cantidad);
  for (const d of difs) m.set(d.variacion_id, d.recibido);
  return m;
}

/** El asiento: por cada producto, Diferencias en recepciones de stock contra
 *  Mercaderías (faltante: debe la diferencia, haber Mercaderías; sobrante, al
 *  revés). `detalle` = el SKU (o lo que se pase). */
export function lineasDiferenciaRecepcion(difs: (DiferenciaRecepcion & { detalle?: string })[], rol: Record<string, number>): Linea[] {
  const out: Linea[] = [];
  for (const d of difs) {
    const imp = r2(d.importe);
    if (!imp) continue;
    out.push({ cuentaId: rol.diferencias_recepcion, debe: imp, detalle: d.detalle }, { cuentaId: rol.mercaderias, haber: imp, detalle: d.detalle });
  }
  return out;
}
