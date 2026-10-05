// Cuentas corrientes de clientes y proveedores. Cada documento que genera
// deuda (factura) o la baja (cobro, pago, nota de crédito) deja un renglón en
// cc_movimiento; las imputaciones cancelan débitos con créditos (por defecto,
// de la deuda más vieja a la más nueva). Cada renglón lleva su pendiente en su
// moneda; entre monedas distintas se convierte con lib/administracion/cc-imputacion.ts.

import type { PoolClient } from "pg";
import { consulta, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { aplicar, repartir, type Imputacion, type RenglonCc } from "@/lib/administracion/cc-imputacion";

export type Tercero = "cliente" | "proveedor";

export async function movimientoCc(c: Consultor, org: string, d: {
  tercero: Tercero; terceroId: number; fecha: string; vencimiento?: string | null; tipo: string; moneda?: "ARS" | "USD";
  importe: number; importeArs: number; importeUsd: number; descripcion: string; referenciaTipo?: string | null; referenciaId?: number | null;
  /** La razón social cuya cuenta corriente lleva el renglón; sin ella, la principal. */
  emisorId?: number | null;
}): Promise<number> {
  const r = await c.query<{ id: string }>(`
    insert into cc_movimiento (organizacion_id, tercero_tipo, tercero_id, fecha, vencimiento, tipo, moneda, importe, importe_ars, importe_usd, pendiente, descripcion, referencia_tipo, referencia_id, emisor_id)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $8, $11, $12, $13, $14)
    on conflict (organizacion_id, referencia_tipo, referencia_id, tercero_tipo) where referencia_tipo is not null do nothing
    returning id`,
    [org, d.tercero, d.terceroId, d.fecha, d.vencimiento ?? null, d.tipo, d.moneda ?? "ARS", d.importe, d.importeArs, d.importeUsd, d.descripcion,
      d.referenciaTipo ?? null, d.referenciaId ?? null, d.emisorId ?? null]);
  return r.rows[0] ? Number(r.rows[0].id) : 0;
}

/** Lo que hace falta de cada renglón para imputar: el pendiente en su moneda
 *  y, para un crédito, la cotización con que cancela deudas de la otra moneda
 *  (el tipo de cambio de su día; ver lib/administracion/cc-imputacion.ts). */
const COLUMNAS_IMPUTAR = `id, emisor_id, moneda, pendiente, to_char(fecha, 'YYYY-MM-DD') fecha,
  coalesce(tc_del_dia(organizacion_id, fecha), abs(importe_ars / nullif(importe_usd, 0))) cot`;
type FilaImputar = { id: string; moneda: string; pendiente: string; fecha: string; cot: string | null; emisor_id: string | null };
const renglon = (x: FilaImputar, signo: 1 | -1): RenglonCc =>
  ({ id: Number(x.id), moneda: x.moneda === "USD" ? "USD" : "ARS", p: signo * Number(x.pendiente), cot: x.cot == null ? null : Number(x.cot) });

/** Graba una imputación y baja los dos pendientes, cada uno en su moneda. */
async function grabarImputacion(c: PoolClient, org: string, i: Imputacion) {
  await c.query("insert into cc_imputacion (organizacion_id, debito_id, credito_id, importe, importe_credito, cotizacion) values ($1, $2, $3, $4, $5, $6)",
    [org, i.debitoId, i.creditoId, i.debito, i.credito, i.cotizacion]);
  await c.query("update cc_movimiento set pendiente = pendiente - $2 where id = $1", [i.debitoId, i.debito]);
  await c.query("update cc_movimiento set pendiente = pendiente + $2 where id = $1", [i.creditoId, i.credito]);
}

/** Imputa créditos contra débitos de un tercero, de lo más viejo a lo más nuevo.
 *  Entre monedas distintas, el crédito cancela al tipo de cambio de su día.
 *  Cada razón social lleva su propia cuenta corriente con el tercero: un pago
 *  hecho por una empresa no cancela la deuda con la otra. */
export async function imputarAutomatico(c: PoolClient, org: string, tercero: Tercero, terceroId: number) {
  const deb = (await c.query<FilaImputar>(`
    select ${COLUMNAS_IMPUTAR} from cc_movimiento where organizacion_id = $1 and tercero_tipo = $2 and tercero_id = $3 and pendiente > 0
     order by coalesce(vencimiento, fecha), id for update`, [org, tercero, terceroId])).rows;
  const cre = (await c.query<FilaImputar>(`
    select ${COLUMNAS_IMPUTAR} from cc_movimiento where organizacion_id = $1 and tercero_tipo = $2 and tercero_id = $3 and pendiente < 0
     order by fecha, id for update`, [org, tercero, terceroId])).rows;
  for (const g of new Set([...deb, ...cre].map((x) => x.emisor_id))) {
    const d = deb.filter((x) => x.emisor_id === g).map((x) => renglon(x, 1));
    const k = cre.filter((x) => x.emisor_id === g).map((x) => renglon(x, -1));
    for (const i of repartir(d, k)) await grabarImputacion(c, org, i);
  }
}

/** Imputación a mano de un crédito contra un débito. `importe` es lo que se
 *  cancela de la deuda, en la moneda de la deuda; sin importe, lo máximo que
 *  alcance. Devuelve cuánto bajó cada lado para el aviso. */
export async function imputar(org: string, debitoId: number, creditoId: number, importe: number | null) {
  if (importe != null && !(importe > 0)) throw new ErrorErp("El importe a imputar tiene que ser mayor que cero.");
  return enTransaccion(async (c) => {
    const f = (await c.query<FilaImputar & { tercero_tipo: string; tercero_id: string }>(
      `select ${COLUMNAS_IMPUTAR}, tercero_tipo, tercero_id from cc_movimiento where organizacion_id = $1 and id in ($2, $3) for update`,
      [org, debitoId, creditoId])).rows;
    const fd = f.find((x) => Number(x.id) === debitoId), fc = f.find((x) => Number(x.id) === creditoId);
    if (!fd || !fc || fd.tercero_tipo !== fc.tercero_tipo || fd.tercero_id !== fc.tercero_id) throw new ErrorErp("Esos movimientos no son de la misma cuenta.");
    if (fd.emisor_id !== fc.emisor_id) throw new ErrorErp("Esos movimientos son de razones sociales distintas: cada una lleva su propia cuenta corriente.");
    const d = renglon(fd, 1), cr = renglon(fc, -1);
    if (!(d.p > 0.004) || !(cr.p > 0.004)) throw new ErrorErp("Elegí una deuda y un crédito que tengan algo pendiente.");
    if (d.moneda !== cr.moneda && !cr.cot)
      throw new ErrorErp(`No hay tipo de cambio para el ${fc.fecha.split("-").reverse().join("/")}: cargalo en Configuración → Tipo de cambio.`);
    const maximo = aplicar(d, cr, cr.cot ?? null);
    if (!maximo) throw new ErrorErp("Lo que queda pendiente no llega a un centavo: no hay nada para imputar.");
    if (importe != null && importe > d.p + 0.004) throw new ErrorErp("El importe pasa lo que queda pendiente.");
    if (importe != null && importe > maximo.debito + 0.004)
      throw new ErrorErp(`El crédito no alcanza: cancela hasta ${formatear(maximo.debito, d.moneda)} de esa deuda.`);
    const a = importe == null ? maximo : aplicar(d, cr, cr.cot ?? null, importe);
    if (!a) throw new ErrorErp("El importe es demasiado chico para imputar.");
    await grabarImputacion(c, org, { ...a, debitoId, creditoId });
    return { ...a, monedaDebito: d.moneda, monedaCredito: cr.moneda };
  });
}

/** Saldos por tercero (en pesos), con lo vencido. */
export function saldos(org: string, tercero: Tercero, emisorId: number | null = null) {
  const tabla = tercero === "cliente" ? "cliente" : "proveedor";
  return consulta<{ id: number; nombre: string; saldo: number; vencido: number; saldo_usd: number; vencido_usd: number; ultimo: string | null }>(`
    select t.id::int, t.nombre, sum(m.importe_ars)::float saldo, sum(m.importe_usd)::float saldo_usd,
           coalesce(sum(case when m.pendiente > 0 and coalesce(m.vencimiento, m.fecha) < current_date then m.pendiente * (m.importe_usd / nullif(m.importe, 0)) end), 0)::float vencido_usd,
           coalesce(sum(case when m.pendiente > 0 and coalesce(m.vencimiento, m.fecha) < current_date then m.pendiente * (m.importe_ars / nullif(m.importe, 0)) end), 0)::float vencido,
           to_char(max(m.fecha), 'YYYY-MM-DD') ultimo
      from cc_movimiento m join ${tabla} t on t.id = m.tercero_id
     where m.organizacion_id = $1 and m.tercero_tipo = $2 and ($3::bigint is null or m.emisor_id = $3)
     group by t.id, t.nombre having abs(sum(m.importe_ars)) > 0.004 or max(m.fecha) > current_date - 90
     order by sum(m.importe_ars) desc`, [org, tercero, emisorId]);
}

/** El estado de cuenta de un tercero con saldo acumulado (y, para imputar,
 *  la cotización de cada renglón: el tipo de cambio de su día). */
export function estadoDeCuenta(org: string, tercero: Tercero, terceroId: number, emisorId: number | null = null) {
  return consulta<{ id: number; fecha: string; vencimiento: string | null; tipo: string; descripcion: string; moneda: string; importe: number;
    importe_ars: number; importe_usd: number; pendiente: number; saldo: number; saldo_usd: number; referencia_tipo: string | null; referencia_id: number | null; cot: number | null; emisor_id: number | null }>(`
    select id::int, to_char(fecha, 'YYYY-MM-DD') fecha, to_char(vencimiento, 'YYYY-MM-DD') vencimiento, tipo, descripcion, moneda,
           importe::float, importe_ars::float, importe_usd::float, pendiente::float, referencia_tipo, referencia_id::int, emisor_id::int,
           coalesce(tc_del_dia(organizacion_id, fecha), abs(importe_ars / nullif(importe_usd, 0)))::float cot,
           sum(importe_ars) over (order by fecha, id)::float saldo, sum(importe_usd) over (order by fecha, id)::float saldo_usd
      from cc_movimiento where organizacion_id = $1 and tercero_tipo = $2 and tercero_id = $3 and ($4::bigint is null or emisor_id = $4) order by fecha, id`, [org, tercero, terceroId, emisorId]);
}

/** Las ventas facturadas que van a cuenta corriente: comprobantes autorizados
 *  de clientes habilitados (cuenta_corriente) o de pedidos "a convenir" que
 *  todavía no tienen su renglón. Se llama desde las tareas periódicas. */
export async function sincronizarVentasCc(org: string): Promise<number> {
  const pend = await consulta<{ emisor_id: number | null; id: number; cliente_id: number; tipo_cbte: number; fecha: string; total: string; punto_venta: number; numero: string }>(`
    select cb.emisor_id::int, cb.id::int, cb.cliente_id::int, cb.tipo_cbte, to_char(cb.fecha, 'YYYY-MM-DD') fecha, cb.importe_total total, cb.punto_venta, cb.numero
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
        referenciaTipo: "comprobante", referenciaId: cb.id, emisorId: cb.emisor_id });
      await imputarAutomatico(c, org, "cliente", cb.cliente_id);
    });
    n++;
  }
  return n;
}
