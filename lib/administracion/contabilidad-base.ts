// Piezas de la contabilidad que no tocan la base (se prueban solas en
// tests/contabilidad-canales.test.ts): el nombre de la cuenta de Mercado
// Pago y los renglones de los asientos de venta y de cobro de pedido, con la
// elección de la cuenta propia del canal o de la cuenta general; el nombre de
// la cuenta de Mercado Pago de la tienda y la pata de fondos de un cobro
// (tests/cobros-fondos.test.ts).

export type Linea = { cuentaId: number; debe?: number; haber?: number; detalle?: string };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Nombre de la cuenta contable de una cuenta de fondos de Mercado Pago: si
 *  ya empieza con "Mercado Pago", ése; si no, "Mercado Pago — <nombre>". */
export function nombreContableMercadoPago(nombre: string): string {
  return /^mercado\s*pago/i.test(nombre.trim()) ? nombre.trim() : `Mercado Pago — ${nombre.trim()}`;
}

/** Venta o nota de crédito: Deudores (total) contra Ventas (neto) + IVA
 *  débito. El neto va a la cuenta de ventas propia del canal del pedido si
 *  la tiene; si no, a la Ventas general. Importes ya en pesos. */
export function lineasVenta(x: { total: number; iva: number; nc: boolean }, rol: Record<string, number>, ventasCanal?: number | null): Linea[] {
  const s = x.nc ? -1 : 1;
  const total = r2(x.total), iva = r2(x.iva), neto = r2(total - iva);
  return [
    { cuentaId: rol.deudores, debe: s * total },
    { cuentaId: ventasCanal || rol.ventas, haber: s * neto },
    { cuentaId: rol.iva_debito, haber: s * iva },
  ];
}

/** Cobro de un pedido pagado por el canal: lo cobrado (total − comisión) va a
 *  la cuenta de Mercado Pago de la cuenta de ML del canal si la tiene; si no,
 *  a "Cobros de canales a liquidar". La comisión, a Comisiones de canales
 *  (nunca más que el total). Total cero o negativo: no hay asiento ([]). */
export function lineasCobroPedido(x: { total: number; comision: number }, rol: Record<string, number>, cuentaMercadoPago?: number | null): Linea[] {
  const total = r2(x.total), com = r2(Math.min(x.comision || 0, total));
  if (total <= 0) return [];
  return [
    { cuentaId: cuentaMercadoPago || rol.cobros_canal, debe: r2(total - com) },
    { cuentaId: rol.comisiones, debe: com },
    { cuentaId: rol.deudores, haber: total },
  ];
}

/** Nombre de la cuenta de fondos del Mercado Pago de la tienda web (el medio
 *  de pago Mercado Pago del checkout): con el nombre de siempre ("Mercado
 *  Pago" a secas, o vacío), "Mercado Pago — Tienda web"; con otro nombre, ése
 *  con "Mercado Pago — " adelante si no lo tiene (nombreContableMercadoPago). */
export function nombreFondosMercadoPagoTienda(nombreMedio: string | null | undefined): string {
  const n = (nombreMedio ?? "").trim();
  if (!n || /^mercado\s*pago$/i.test(n)) return "Mercado Pago — Tienda web";
  return nombreContableMercadoPago(n);
}

/** La pata de fondos de un asiento de cobro de pedido: el renglón al debe de
 *  una cuenta contable que es de una cuenta de fondos (la de Mercado Pago),
 *  con lo que tiene que entrar en esa cuenta de fondos. `fondos` dice de qué
 *  cuenta de fondos es cada cuenta contable. Si lo cobrado fue a "Cobros de
 *  canales a liquidar" (no es de ninguna cuenta de fondos) o da cero, null:
 *  no hay movimiento. */
export function pataDeFondos(lineas: Linea[], fondos: Map<number, number>): { cuentaFondosId: number; importe: number } | null {
  const l = lineas.find((x) => (x.debe ?? 0) > 0 && fondos.has(x.cuentaId));
  if (!l) return null;
  const importe = r2(lineas.filter((x) => x.cuentaId === l.cuentaId).reduce((s, x) => s + (x.debe ?? 0) - (x.haber ?? 0), 0));
  return importe > 0 ? { cuentaFondosId: fondos.get(l.cuentaId)!, importe } : null;
}
