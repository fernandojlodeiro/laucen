// Stock (orden 136, §7). `moverStock` es el ÚNICO camino para cambiar stock:
// envuelve mover_stock() de la base (db/stock.sql), que inserta el
// movimiento y actualiza `stock` en la misma transacción, resuelve kits y
// emite `stock_bajo_umbral` en la tabla `evento`.

import { consulta, una, ErrorErp, type Consultor } from "@/lib/erp/base";

export type TipoMovimiento =
  | "ingreso" | "egreso" | "transferencia" | "ajuste" | "reserva" | "liberacion" | "venta" | "devolucion";

export const TIPOS_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso", egreso: "Egreso", transferencia: "Transferencia", ajuste: "Ajuste",
  reserva: "Reserva", liberacion: "Liberación", venta: "Venta", devolucion: "Devolución",
};

export type Movimiento = {
  variacionId: number;
  tipo: TipoMovimiento;
  /** Siempre positiva. Para un ajuste que resta, se pasa `origenId`. */
  cantidad: number;
  origenId?: number | null;
  destinoId?: number | null;
  referencia?: { tipo: string; id: string | number } | null;
  /** Id del usuario, o 'sistema'. */
  usuarioId?: string | null;
  nota?: string | null;
};

/** Mueve stock. Devuelve los ids de los movimientos (más de uno si era un kit). */
export async function moverStock(org: string, m: Movimiento, c?: Consultor): Promise<number[]> {
  if (!Number.isInteger(m.cantidad) || m.cantidad <= 0) throw new ErrorErp("La cantidad tiene que ser un entero mayor que cero.");
  const sql = `select mover_stock($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) id`;
  const valores = [org, m.variacionId, m.tipo, m.cantidad, m.origenId ?? null, m.destinoId ?? null,
    m.referencia?.tipo ?? null, m.referencia ? String(m.referencia.id) : null, m.usuarioId ?? null, m.nota ?? null];
  const filas = c ? (await c.query<{ id: string }>(sql, valores)).rows : await consulta<{ id: string }>(sql, valores);
  return filas.map((f) => Number(f.id));
}

/** Disponible (cantidad − reservado) de una variación para un canal: suma de
 *  sus depósitos. Un kit se calcula desde sus componentes. */
export async function disponibleCanal(org: string, variacionId: number, canalId: number): Promise<number> {
  const r = await una<{ n: number }>("select stock_disponible_canal($1, $2, $3) n", [org, variacionId, canalId]);
  return r?.n ?? 0;
}

export async function disponibleDeposito(org: string, variacionId: number, depositoId: number): Promise<number> {
  const r = await una<{ n: number }>("select stock_disponible_deposito($1, $2, $3) n", [org, variacionId, depositoId]);
  return r?.n ?? 0;
}

/** La ubicación general (default) de un depósito. */
export async function ubicacionGeneral(org: string, depositoId: number): Promise<number | null> {
  const r = await una<{ id: string }>("select id from ubicacion where organizacion_id = $1 and deposito_id = $2 and es_default", [org, depositoId]);
  return r ? Number(r.id) : null;
}
