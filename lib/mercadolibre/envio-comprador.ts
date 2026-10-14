// El envío que pagó el comprador en una venta de Mercado Libre (Fer, 14/10: va en la factura).
// ML lo informa en cada pago de la orden: payments[].shipping_cost (total_paid_amount = importe + envío).
// En un carrito se suman las órdenes que siguen en pie; un mismo pago visto en dos órdenes cuenta una vez.

type PagoMl = { id?: number | string; status?: string; shipping_cost?: number | string | null };
type OrdenMl = { status?: string; payments?: PagoMl[] | null };

const r2 = (x: number) => Math.round(x * 100) / 100;

export function envioPagadoPorElComprador(ordenes: OrdenMl[]): number {
  const porPago = new Map<string, number>();
  ordenes.forEach((o, i) => {
    if (o.status === "cancelled") return;
    (o.payments ?? []).forEach((p, j) => {
      if (p.status !== "approved") return;
      const costo = Number(p.shipping_cost ?? 0);
      if (!(costo > 0)) return;
      const clave = p.id != null ? String(p.id) : `${i}:${j}`;
      porPago.set(clave, Math.max(porPago.get(clave) ?? 0, costo));
    });
  });
  return r2([...porPago.values()].reduce((s, x) => s + x, 0));
}
