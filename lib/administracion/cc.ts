// Cuentas corrientes de clientes y proveedores. Cada documento que genera
// deuda (factura) o la baja (cobro, pago, nota de crédito) deja un renglón en
// cc_movimiento; las imputaciones cancelan débitos con créditos (por defecto,
// de la deuda más vieja a la más nueva).

import type { PoolClient } from "pg";
import { consulta, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";

export type Tercero = "cliente" | "proveedor";

export async function movimientoCc(c: Consultor, org: string, d: {
  tercero: Tercero; terceroId: number; fecha: string; vencimiento?: string | null; tipo: string; moneda?: "ARS" | "USD";
  importe: number; importeArs: number; importeUsd: number; descripcion: string; referenciaTipo?: string | null; referenciaId?: number | null;
}): Promise<number> {
  const r = await c.query<{ id: string }>(`
    insert into cc_movimiento (organizacion_id, tercero_tipo, tercero_id, fecha, vencimiento, tipo, moneda, importe, importe_ars, importe_usd, pendiente, descripcion, referencia_tipo, referencia_id)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $8, $11, $12, $13)
    on conflict (organizacion_id, referencia_tipo, referencia_id, tercero_tipo) where referencia_tipo is not null do nothing
    returning id`,
    [org, d.tercero, d.terceroId, d.fecha, d.vencimiento ?? null, d.tipo, d.moneda ?? "ARS", d.importe, d.importeArs, d.importeUsd, d.descripcion,
      d.referenciaTipo ?? null, d.referenciaId ?? null]);
  return r.rows[0] ? Number(r.rows[0].id) : 0;
}

/** Imputa créditos contra débitos de un tercero, de lo más viejo a lo más nuevo. */
export async function imputarAutomatico(c: PoolClient, org: string, tercero: Tercero, terceroId: number) {
  const deb = (await c.query<{ id: string; pendiente: string }>(`
    select id, pendiente from cc_movimiento where organizacion_id = $1 and tercero_tipo = $2 and tercero_id = $3 and pendiente > 0
     order by coalesce(vencimiento, fecha), id for update`, [org, tercero, terceroId])).rows.map((x) => ({ id: Number(x.id), p: Number(x.pendiente) }));
  const cre = (await c.query<{ id: string; pendiente: string }>(`
    select id, pendiente from cc_movimiento where organizacion_id = $1 and tercero_tipo = $2 and tercero_id = $3 and pendiente < 0
     order by fecha, id for update`, [org, tercero, terceroId])).rows.map((x) => ({ id: Number(x.id), p: -Number(x.pendiente) }));
  let i = 0;
  for (const cr of cre) {
    while (cr.p > 0.004 && i < deb.length) {
      const d = deb[i];
      const m = Math.round(Math.min(cr.p, d.p) * 100) / 100;
      if (m > 0) {
        await c.query("insert into cc_imputacion (organizacion_id, debito_id, credito_id, importe) values ($1, $2, $3, $4)", [org, d.id, cr.id, m]);
        await c.query("update cc_movimiento set pendiente = pendiente - $2 where id = $1", [d.id, m]);
        await c.query("update cc_movimiento set pendiente = pendiente + $2 where id = $1", [cr.id, m]);
      }
      d.p -= m; cr.p -= m;
      if (d.p <= 0.004) i++;
    }
  }
}

/** Imputación a mano de un crédito contra un débito. */
export async function imputar(org: string, debitoId: number, creditoId: number, importe: number) {
  if (!(importe > 0)) throw new ErrorErp("El importe a imputar tiene que ser mayor que cero.");
  await enTransaccion(async (c) => {
    const f = (await c.query<{ id: string; pendiente: string; tercero_tipo: string; tercero_id: string }>(
      "select id, pendiente, tercero_tipo, tercero_id from cc_movimiento where organizacion_id = $1 and id in ($2, $3) for update", [org, debitoId, creditoId])).rows;
    const d = f.find((x) => Number(x.id) === debitoId), cr = f.find((x) => Number(x.id) === creditoId);
    if (!d || !cr || d.tercero_tipo !== cr.tercero_tipo || d.tercero_id !== cr.tercero_id) throw new ErrorErp("Esos movimientos no son de la misma cuenta.");
    if (Number(d.pendiente) < importe - 0.004 || -Number(cr.pendiente) < importe - 0.004) throw new ErrorErp("El importe pasa lo que queda pendiente.");
    await c.query("insert into cc_imputacion (organizacion_id, debito_id, credito_id, importe) values ($1, $2, $3, $4)", [org, debitoId, creditoId, importe]);
    await c.query("update cc_movimiento set pendiente = pendiente - $2 where id = $1", [debitoId, importe]);
    await c.query("update cc_movimiento set pendiente = pendiente + $2 where id = $1", [creditoId, importe]);
  });
}

/** Saldos por tercero (en pesos), con lo vencido. */
export function saldos(org: string, tercero: Tercero) {
  const tabla = tercero === "cliente" ? "cliente" : "proveedor";
  return consulta<{ id: number; nombre: string; saldo: number; vencido: number; ultimo: string | null }>(`
    select t.id::int, t.nombre, sum(m.importe_ars)::float saldo,
           coalesce(sum(case when m.pendiente > 0 and coalesce(m.vencimiento, m.fecha) < current_date then m.pendiente * (m.importe_ars / nullif(m.importe, 0)) end), 0)::float vencido,
           to_char(max(m.fecha), 'YYYY-MM-DD') ultimo
      from cc_movimiento m join ${tabla} t on t.id = m.tercero_id
     where m.organizacion_id = $1 and m.tercero_tipo = $2
     group by t.id, t.nombre having abs(sum(m.importe_ars)) > 0.004 or max(m.fecha) > current_date - 90
     order by sum(m.importe_ars) desc`, [org, tercero]);
}

/** El estado de cuenta de un tercero con saldo acumulado. */
export function estadoDeCuenta(org: string, tercero: Tercero, terceroId: number) {
  return consulta<{ id: number; fecha: string; vencimiento: string | null; tipo: string; descripcion: string; moneda: string; importe: number;
    importe_ars: number; pendiente: number; saldo: number; referencia_tipo: string | null; referencia_id: number | null }>(`
    select id::int, to_char(fecha, 'YYYY-MM-DD') fecha, to_char(vencimiento, 'YYYY-MM-DD') vencimiento, tipo, descripcion, moneda,
           importe::float, importe_ars::float, pendiente::float, referencia_tipo, referencia_id::int,
           sum(importe_ars) over (order by fecha, id)::float saldo
      from cc_movimiento where organizacion_id = $1 and tercero_tipo = $2 and tercero_id = $3 order by fecha, id`, [org, tercero, terceroId]);
}

/** Las ventas facturadas que van a cuenta corriente: comprobantes autorizados
 *  de clientes habilitados (cuenta_corriente) o de pedidos "a convenir" que
 *  todavía no tienen su renglón. Se llama desde las tareas periódicas. */
export async function sincronizarVentasCc(org: string): Promise<number> {
  const pend = await consulta<{ id: number; cliente_id: number; tipo_cbte: number; fecha: string; total: string; punto_venta: number; numero: string }>(`
    select cb.id::int, cb.cliente_id::int, cb.tipo_cbte, to_char(cb.fecha, 'YYYY-MM-DD') fecha, cb.importe_total total, cb.punto_venta, cb.numero
      from comprobante cb join cliente cl on cl.id = cb.cliente_id left join pedido p on p.id = cb.pedido_id
     where cb.organizacion_id = $1 and cb.estado = 'autorizado' and (cl.cuenta_corriente or p.estado_pago = 'a_convenir')
       and not exists (select 1 from cc_movimiento m where m.organizacion_id = $1 and m.referencia_tipo = 'comprobante' and m.referencia_id = cb.id)`, [org]);
  let n = 0;
  for (const cb of pend) {
    const nc = [3, 8, 13].includes(cb.tipo_cbte);
    const total = Number(cb.total) * (nc ? -1 : 1);
    await enTransaccion(async (c) => {
      const usd = Number((await c.query<{ v: string }>("select coalesce(round($2::numeric / nullif(tc_del_dia($1, $3::date), 0), 2), 0) v", [org, total, cb.fecha])).rows[0].v);
      await movimientoCc(c, org, { tercero: "cliente", terceroId: cb.cliente_id, fecha: cb.fecha, vencimiento: cb.fecha, tipo: nc ? "nota_credito" : "factura",
        importe: total, importeArs: total, importeUsd: usd, descripcion: `${nc ? "Nota de crédito" : "Factura"} ${String(cb.punto_venta).padStart(5, "0")}-${String(cb.numero).padStart(8, "0")}`,
        referenciaTipo: "comprobante", referenciaId: cb.id });
      await imputarAutomatico(c, org, "cliente", cb.cliente_id);
    });
    n++;
  }
  return n;
}
