// Piezas de la contabilidad que no tocan la base (se prueban solas en
// tests/contabilidad-canales.test.ts): el nombre de la cuenta de Mercado
// Pago y los renglones de los asientos de venta y de cobro de pedido, con la
// elección de la cuenta propia del canal o de la cuenta general.

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
