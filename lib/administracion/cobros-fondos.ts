// Cobros de pedidos en Caja y bancos (pedido de Fer, 3/10, «opción a»).
//
// El asiento "Cobro de pedido" manda lo cobrado (total − comisión) a la
// cuenta contable de una cuenta de Mercado Pago: la de la cuenta de Mercado
// Libre del canal, o la de la tienda web si el pedido se pagó con el Mercado
// Pago del checkout. Para que el saldo de esa cuenta en Caja y bancos dé igual
// que su mayor, cada cobro deja también un movimiento en la cuenta de fondos.
//
// Diseño: el movimiento es la pata de fondos del MISMO asiento de cobro, como
// los movimientos de un recibo son la pata de fondos del asiento del recibo.
// Lleva referencia_tipo 'pedido' y referencia_id = el pedido (uno por pedido:
// índice único movimiento_fondos_pedido), y como los asientos de "Movimiento
// suelto" sólo salen de los de referencia_tipo 'manual', no genera otro
// asiento. Nace en la misma transacción que el asiento de cobro
// (movimientoDeCobro, desde contabilizarPendientes) y se borra cuando el
// cobro se deshace (sincronizarCobrosConFondos).
//
// Acá también se crea la cuenta de fondos del Mercado Pago de la tienda web
// (asegurarMercadoPagoTienda, desde asegurarCuentasDeCanales).

import type { PoolClient } from "pg";
import { consulta, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { pataDeFondos, nombreFondosMercadoPagoTienda, type Linea } from "@/lib/administracion/contabilidad-base";

const r2 = (x: number) => Math.round(x * 100) / 100;

/** La cuenta contable de Mercado Pago que cobra el pedido `p` ($1 = la
 *  organización), para la consulta de cobros de contabilizarPendientes:
 *  - canal de Mercado Libre: la de la cuenta de ML del canal (la conectada
 *    hoy primero);
 *  - si no, pagado con el Mercado Pago de la tienda (un pago aprobado de ese
 *    medio): la cuenta de fondos del medio de pago Mercado Pago (el del canal
 *    o, si no, el de la organización).
 *  Null: va a Cobros de canales a liquidar. */
export const SQL_CUENTA_COBRO = `coalesce(
           (select pc.id::int from cuenta_fondos f join canal c2 on c2.id = f.canal_id and c2.tipo = 'mercadolibre'
                   join plan_cuenta pc on pc.id = f.cuenta_contable_id and pc.activa and pc.imputable
              left join meli_cuenta mc on mc.canal_id = f.canal_id
             where f.organizacion_id = $1 and f.canal_id = p.canal_id and f.tipo = 'mercadopago'
             order by (f.meli_user_id = mc.meli_user_id) desc nulls last, f.activa desc, f.id desc limit 1),
           (select pc.id::int from medio_pago mp join cuenta_fondos f on f.medio_pago_id = mp.id
                   join plan_cuenta pc on pc.id = f.cuenta_contable_id and pc.activa and pc.imputable
             where mp.organizacion_id = $1 and mp.tipo = 'mercadopago' and (mp.canal_id is null or mp.canal_id = p.canal_id)
               and exists (select 1 from pago pg where pg.pedido_id = p.id and pg.medio = 'mercadopago' and pg.estado = 'aprobado')
             order by mp.canal_id nulls last, mp.activo desc, f.activa desc limit 1))`;

/** Medios de pago Mercado Pago conectados (con su access token cargado) que
 *  todavía no tienen su cuenta de fondos ($1 = la organización). */
export const SQL_MEDIOS_MP_SIN_CUENTA = `
  select mp.id, mp.nombre,
         coalesce(mp.canal_id, (select min(ca.id) from canal ca where ca.organizacion_id = $1 and ca.tipo = 'web_minorista' and ca.estado <> 'archivado'
                                having count(*) = 1)) canal_id
    from medio_pago mp join medio_pago_credencial cr on cr.medio_pago_id = mp.id and coalesce(cr.datos->>'access_token', '') <> ''
   where mp.organizacion_id = $1 and mp.tipo = 'mercadopago'
     and not exists (select 1 from cuenta_fondos f where f.organizacion_id = $1 and f.medio_pago_id = mp.id)`;

/** La cuenta de fondos del Mercado Pago de la tienda web, por cada medio de
 *  pago Mercado Pago conectado que no la tenga (adentro de la transacción de
 *  asegurarCuentasDeCanales, que después le crea su cuenta contable propia):
 *  "Mercado Pago — Tienda web" (o el nombre del medio), tipo Mercado Pago, en
 *  pesos, atada al medio y al canal de la tienda (el del medio o, si el medio
 *  es de toda la organización, la única tienda que haya). Si alguien ya había
 *  creado a mano una de Mercado Pago con ese nombre, sin dueño, se adopta. */
export async function asegurarMercadoPagoTienda(c: PoolClient, org: string) {
  const medios = (await c.query<{ id: string; nombre: string; canal_id: string | null }>(`${SQL_MEDIOS_MP_SIN_CUENTA} order by mp.id`, [org])).rows;
  for (const m of medios) {
    let nombre = nombreFondosMercadoPagoTienda(m.nombre);
    const igual = (await c.query<{ id: string; tipo: string; meli_user_id: string | null; medio_pago_id: string | null }>(
      "select id, tipo, meli_user_id, medio_pago_id from cuenta_fondos where organizacion_id = $1 and nombre = $2", [org, nombre])).rows[0];
    if (igual && igual.tipo === "mercadopago" && !igual.meli_user_id && !igual.medio_pago_id) {
      await c.query("update cuenta_fondos set medio_pago_id = $2, canal_id = coalesce(canal_id, $3) where id = $1", [igual.id, m.id, m.canal_id]);
      continue;
    }
    if (igual) nombre = `${nombre} (medio ${m.id})`;
    await c.query(`insert into cuenta_fondos (organizacion_id, nombre, tipo, moneda, medio_pago_id, canal_id)
                   values ($1, $2, 'mercadopago', 'ARS', $3, $4)`, [org, nombre, m.id, m.canal_id]);
  }
}

/** El movimiento de fondos de un asiento de cobro de pedido, si lo cobrado
 *  fue a la cuenta contable de una cuenta de fondos y el pedido todavía no
 *  tiene el suyo. Fecha y concepto, los del asiento; el importe, en la moneda
 *  de la cuenta (el asiento está en pesos). Devuelve el id o null. */
export async function movimientoDeCobro(c: PoolClient, org: string, asientoId: number): Promise<number | null> {
  const a = (await c.query<{ fecha: string; concepto: string; pedido: string }>(`
    select to_char(fecha, 'YYYY-MM-DD') fecha, concepto, referencia_id pedido from asiento
     where id = $1 and organizacion_id = $2 and origen = 'cobro_pedido' and estado = 'vigente' and referencia_id is not null`, [asientoId, org])).rows[0];
  if (!a) return null;
  const ya = await c.query("select 1 from movimiento_fondos where organizacion_id = $1 and referencia_tipo = 'pedido' and referencia_id = $2", [org, a.pedido]);
  if (ya.rowCount) return null;
  const lineas: Linea[] = (await c.query<{ cuenta_id: string; debe: string; haber: string }>(
    "select cuenta_id, debe, haber from asiento_linea where asiento_id = $1", [asientoId])).rows
    .map((l) => ({ cuentaId: Number(l.cuenta_id), debe: Number(l.debe), haber: Number(l.haber) }));
  const fondos = new Map<number, number>();
  for (const f of (await c.query<{ id: string; cuenta_contable_id: string }>(
    "select id, cuenta_contable_id from cuenta_fondos where organizacion_id = $1 and cuenta_contable_id = any($2::bigint[]) order by id",
    [org, lineas.map((l) => l.cuentaId)])).rows) {
    if (!fondos.has(Number(f.cuenta_contable_id))) fondos.set(Number(f.cuenta_contable_id), Number(f.id));
  }
  const pata = pataDeFondos(lineas, fondos);
  if (!pata) return null;
  const cta = (await c.query<{ moneda: string }>("select moneda from cuenta_fondos where id = $1", [pata.cuentaFondosId])).rows[0];
  const tc = Number((await c.query<{ v: string | null }>("select tc_del_dia($1, $2::date) v", [org, a.fecha])).rows[0]?.v ?? 0);
  if (!tc) throw new ErrorErp(`No hay tipo de cambio para el ${a.fecha.split("-").reverse().join("/")}.`);
  const ars = pata.importe, usd = r2(ars / tc);
  const r = await c.query<{ id: string }>(`
    insert into movimiento_fondos (organizacion_id, cuenta_id, fecha, importe, importe_ars, importe_usd, concepto, referencia_tipo, referencia_id)
    select $1, $2, $3, $4, $5, $6, $7, 'pedido', $8
     where not exists (select 1 from movimiento_fondos where organizacion_id = $1 and referencia_tipo = 'pedido' and referencia_id = $8)
    returning id`,
    [org, pata.cuentaFondosId, a.fecha, cta?.moneda === "USD" ? usd : ars, ars, usd, a.concepto, a.pedido]);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

/** Pone al día los movimientos de los cobros (lo llama contabilizarPendientes
 *  después de asentar los cobros). Devuelve los errores con el formato
 *  "cobro_pedido <pedido>: <motivo>" de contabilizarPendientes.
 *  1. Cobro deshecho (el pedido ya no está "Pagado", o no existe): anula el
 *     asiento de cobro y borra su movimiento. Si el movimiento ya está
 *     conciliado con el extracto, no toca nada y lo avisa.
 *  2. Movimiento de un pedido sin asiento de cobro vigente: se borra (si no
 *     está conciliado).
 *  3. Asientos de cobro vigentes sin su movimiento (los de antes de este
 *     cambio, o si la cuenta de fondos se creó después): se crea. */
export async function sincronizarCobrosConFondos(org: string, hasta = Date.now() + 30_000): Promise<{ creados: number; anulados: number; errores: string[] }> {
  let creados = 0, anulados = 0;
  const errores: string[] = [];
  const deshechos = await consulta<{ id: number; pedido: number; mov: number | null; conciliado: boolean }>(`
    select a.id::int, a.referencia_id::int pedido, m.id::int mov, coalesce(m.conciliado_ts is not null, false) conciliado
      from asiento a
      left join pedido p on p.id = a.referencia_id and p.organizacion_id = a.organizacion_id
      left join movimiento_fondos m on m.organizacion_id = a.organizacion_id and m.referencia_tipo = 'pedido' and m.referencia_id = a.referencia_id
     where a.organizacion_id = $1 and a.origen = 'cobro_pedido' and a.estado = 'vigente' and (p.id is null or p.estado_pago <> 'pagado')
     order by a.id limit 500`, [org]);
  for (const d of deshechos) {
    if (Date.now() > hasta) break;
    if (d.conciliado) {
      errores.push(`cobro_pedido ${d.pedido}: el pedido ya no está cobrado pero su movimiento en Caja y bancos está conciliado con el extracto; desunilo para que se anule el cobro.`);
      continue;
    }
    try {
      await enTransaccion(async (c) => {
        if (d.mov) await c.query("delete from movimiento_fondos where id = $1 and conciliado_ts is null", [d.mov]);
        await c.query("update asiento set estado = 'anulado' where id = $1 and estado = 'vigente'", [d.id]);
      });
      anulados++;
    } catch (e) {
      errores.push(`cobro_pedido ${d.pedido}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await consulta(`
    delete from movimiento_fondos m where m.organizacion_id = $1 and m.referencia_tipo = 'pedido' and m.conciliado_ts is null
       and not exists (select 1 from asiento a where a.organizacion_id = $1 and a.origen = 'cobro_pedido' and a.referencia_id = m.referencia_id and a.estado = 'vigente')`, [org]);
  const faltan = await consulta<{ id: number; pedido: number }>(`
    select a.id::int, a.referencia_id::int pedido from asiento a
     where a.organizacion_id = $1 and a.origen = 'cobro_pedido' and a.estado = 'vigente' and a.referencia_id is not null
       and not exists (select 1 from movimiento_fondos m where m.organizacion_id = $1 and m.referencia_tipo = 'pedido' and m.referencia_id = a.referencia_id)
       and exists (select 1 from asiento_linea l join cuenta_fondos f on f.cuenta_contable_id = l.cuenta_id and f.organizacion_id = $1
                    where l.asiento_id = a.id and l.debe > 0)
     order by a.id limit 500`, [org]);
  for (const x of faltan) {
    if (Date.now() > hasta) break;
    try {
      if (await enTransaccion((c) => movimientoDeCobro(c, org, x.id))) creados++;
    } catch (e) {
      errores.push(`cobro_pedido ${x.pedido}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { creados, anulados, errores };
}
