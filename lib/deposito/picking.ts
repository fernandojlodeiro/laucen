// Picking (sesión 4): preparar pedidos de a uno o en lote, recorriendo el
// depósito por orden de ubicación y escaneando cada unidad.
//
// Los ítems salen de lo que cada pedido ya tiene reservado (reservado_de):
// la reserva, hecha al pagarse el pedido, ya dice de qué ubicación sale cada
// cosa (y un kit, sus componentes). Al armar el lote los pedidos pasan a
// "en preparación"; al terminar, los completos pasan a "preparado".

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { cambiarEstado, exigirCarritoLibre, sqlCarritoEnEspera } from "@/lib/pedidos";

export type PedidoParaPreparar = {
  id: number; id_externo: string | null; fecha: Date; canal: string; cliente: string | null; estado: string;
  unidades: number; lineas: number; despachar_antes: Date | null; logistica: string | null; deposito_id: number | null;
  /** Carrito de ML en espera (ver carritoEnEspera): se muestra, pero no se puede preparar todavía. */
  carrito_ultimo_evento_ts: Date | null; en_espera: boolean;
};

/** Los pedidos que hay que preparar en un depósito: pagados (o que quedaron
 *  en preparación de un lote cancelado), que mueven stock, no de Full, y que
 *  no están en un lote abierto. Lo más urgente primero. Los carritos de ML
 *  en espera (cambio hace menos de 10 min) vienen con en_espera: la pantalla
 *  los muestra sin poder tildarlos, y crearLote los rechaza. */
export function pedidosParaPreparar(org: string, depositoId: number) {
  return consulta<PedidoParaPreparar>(`
    select p.id::int, p.id_externo, p.fecha, ca.nombre canal, cl.nombre cliente, p.estado,
           (select coalesce(sum(cantidad), 0)::int from pedido_linea where pedido_id = p.id and variacion_id is not null) unidades,
           (select count(*)::int from pedido_linea where pedido_id = p.id and variacion_id is not null) lineas,
           e.despachar_antes, e.logistica, p.deposito_id::int, p.carrito_ultimo_evento_ts, ${sqlCarritoEnEspera("p")} en_espera
      from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
      left join lateral (select despachar_antes, logistica from envio where pedido_id = p.id order by id desc limit 1) e on true
     where p.organizacion_id = $1 and p.deposito_id = $2 and p.afecta_stock and p.estado in ('pagado', 'en_preparacion')
       and coalesce(e.logistica, '') <> 'fulfillment'
       and not exists (select 1 from picking_pedido pp join picking_lote l on l.id = pp.lote_id where pp.pedido_id = p.id and l.estado = 'abierto')
     order by e.despachar_antes nulls last, p.fecha`, [org, depositoId]);
}

/** Arma un lote con esos pedidos. Devuelve su id. */
export async function crearLote(org: string, depositoId: number, pedidoIds: number[], usuarioId: string): Promise<number> {
  if (!pedidoIds.length) throw new ErrorErp("Elegí al menos un pedido.");
  return enTransaccion(async (c) => {
    const ok = await c.query<{ id: string; estado: string; deposito_id: string | null }>(`
      select id, estado, deposito_id from pedido where organizacion_id = $1 and id = any($2::bigint[]) for update`, [org, pedidoIds]);
    if (ok.rowCount !== pedidoIds.length) throw new ErrorErp("Algún pedido no existe.");
    // Un carrito de ML al que todavía le puede llegar un ítem no se prepara.
    await exigirCarritoLibre(org, pedidoIds, c);
    for (const p of ok.rows) {
      if (!["pagado", "en_preparacion"].includes(p.estado)) throw new ErrorErp(`El pedido ${p.id} está ${p.estado}: no se prepara.`);
      if (Number(p.deposito_id) !== depositoId) throw new ErrorErp(`El pedido ${p.id} sale de otro depósito.`);
    }
    const ocupado = await c.query(`select pp.pedido_id from picking_pedido pp join picking_lote l on l.id = pp.lote_id
                                    where pp.pedido_id = any($1::bigint[]) and l.estado = 'abierto' limit 1`, [pedidoIds]);
    if (ocupado.rowCount) throw new ErrorErp(`El pedido ${ocupado.rows[0].pedido_id} ya está en otro picking abierto.`);
    const lote = Number((await c.query<{ id: string }>(
      "insert into picking_lote (organizacion_id, deposito_id, usuario_id) values ($1, $2, $3) returning id", [org, depositoId, usuarioId])).rows[0].id);
    for (const pid of pedidoIds) {
      await c.query("insert into picking_pedido (organizacion_id, lote_id, pedido_id) values ($1, $2, $3)", [org, lote, pid]);
      // Lo reservado de cada pedido, por ubicación.
      await c.query(`
        insert into picking_item (organizacion_id, lote_id, pedido_id, variacion_id, ubicacion_id, kit_variacion_id, cantidad)
        select $1, $2, $3, r.variacion_id, r.ubicacion_id, r.kit_variacion_id, r.cantidad from reservado_de($1, 'pedido', $4) r`,
        [org, lote, pid, String(pid)]);
    }
    // Orden de recorrido: por ubicación (orden_recorrido, código) y SKU.
    await c.query(`
      update picking_item i set orden = o.n from (
        select i2.id, row_number() over (order by u.orden_recorrido, u.codigo, v.sku, i2.pedido_id) n
          from picking_item i2 join ubicacion u on u.id = i2.ubicacion_id join variacion v on v.id = i2.variacion_id
         where i2.lote_id = $1) o
       where i.id = o.id`, [lote]);
    const items = await c.query("select 1 from picking_item where lote_id = $1 limit 1", [lote]);
    if (!items.rowCount) throw new ErrorErp("Esos pedidos no tienen nada reservado para preparar (¿productos sin vincular?).");
    for (const p of ok.rows) if (p.estado === "pagado") await cambiarEstado(org, Number(p.id), "en_preparacion", usuarioId, `picking #${lote}`, c);
    return lote;
  });
}

export type ItemPicking = {
  id: number; pedido_id: number; variacion_id: number; sku: string; titulo: string; codigo_barras: string | null; foto: string | null;
  ubicacion: string; deposito: string; kit: string | null; cantidad: number; escaneado: number; faltante: number; orden: number;
};

export function itemsDelLote(org: string, loteId: number) {
  return consulta<ItemPicking>(`
    select i.id::int, i.pedido_id::int, i.variacion_id::int, v.sku, titulo_variacion(v.id) titulo, v.codigo_barras,
           coalesce((select url from variacion_foto where variacion_id = v.id order by orden limit 1),
                    (select url from producto_foto where producto_id = v.producto_id order by orden limit 1)) foto,
           u.codigo ubicacion, d.nombre deposito, k.sku kit, i.cantidad, i.escaneado, i.faltante, i.orden
      from picking_item i join variacion v on v.id = i.variacion_id join ubicacion u on u.id = i.ubicacion_id
      join deposito d on d.id = u.deposito_id left join variacion k on k.id = i.kit_variacion_id
     where i.lote_id = $1 and i.organizacion_id = $2 order by i.orden, i.id`, [loteId, org]);
}

/** Un escaneo: busca el código (de barras o SKU) entre lo que falta del
 *  lote y suma una unidad (o `cantidad`). */
export async function escanear(org: string, loteId: number, codigo: string, cantidad = 1): Promise<{ item: ItemPicking; completo: boolean }> {
  const t = codigo.trim();
  if (!t) throw new ErrorErp("No llegó ningún código.");
  const lote = await una<{ estado: string }>("select estado from picking_lote where id = $1 and organizacion_id = $2", [loteId, org]);
  if (!lote) throw new ErrorErp("Ese picking no existe.");
  if (lote.estado !== "abierto") throw new ErrorErp("Ese picking ya está cerrado.");
  const r = await una<{ id: string }>(`
    update picking_item set escaneado = escaneado + $4
     where id = (select i.id from picking_item i join variacion v on v.id = i.variacion_id
                  where i.lote_id = $1 and i.organizacion_id = $2 and (v.codigo_barras = $3 or lower(v.sku) = lower($3))
                    and i.escaneado + i.faltante + $4 <= i.cantidad
                  order by i.orden limit 1 for update)
    returning id`, [loteId, org, t, cantidad]);
  if (!r) {
    const esta = await una(`select 1 from picking_item i join variacion v on v.id = i.variacion_id
                            where i.lote_id = $1 and (v.codigo_barras = $2 or lower(v.sku) = lower($2))`, [loteId, t]);
    throw new ErrorErp(esta ? `Ya están todas las unidades de ${t}: ese sobra.` : `El código ${t} no es de este picking.`);
  }
  const item = (await itemsDelLote(org, loteId)).find((i) => i.id === Number(r.id))!;
  return { item, completo: item.escaneado + item.faltante >= item.cantidad };
}

/** Corrige a mano un ítem: unidades escaneadas y faltantes. */
export async function corregirItem(org: string, itemId: number, escaneado: number, faltante: number) {
  const r = await consulta(`update picking_item set escaneado = $3, faltante = $4
                             where id = $1 and organizacion_id = $2 and $3 + $4 <= cantidad and $3 >= 0 and $4 >= 0
                               and lote_id in (select id from picking_lote where estado = 'abierto') returning id`,
    [itemId, org, escaneado, faltante]);
  if (!r.length) throw new ErrorErp("No se pudo corregir: las unidades escaneadas más las faltantes no pueden pasar de lo pedido.");
}

/** Cierra el lote: los pedidos completos pasan a "preparado"; los que tienen
 *  faltantes quedan "en preparación" (para un próximo picking cuando haya). */
export async function terminarLote(org: string, loteId: number, usuarioId: string): Promise<{ preparados: number[]; incompletos: number[]; enEspera: number[] }> {
  return enTransaccion(async (c: PoolClient) => {
    const l = (await c.query<{ estado: string }>("select estado from picking_lote where id = $1 and organizacion_id = $2 for update", [loteId, org])).rows[0];
    if (!l) throw new ErrorErp("Ese picking no existe.");
    if (l.estado !== "abierto") throw new ErrorErp("Ese picking ya está cerrado.");
    const estado = await c.query<{ pedido_id: string; completo: boolean }>(`
      select pedido_id, bool_and(escaneado >= cantidad) completo from picking_item where lote_id = $1 group by pedido_id`, [loteId]);
    const preparados: number[] = [], incompletos: number[] = [], enEspera: number[] = [];
    // Un carrito de ML que recibió un cambio mientras se preparaba (le llegó o
    // se le canceló un ítem) no pasa a preparado: queda en preparación y vuelve
    // a la lista, para prepararlo de nuevo pasada la espera.
    const esperando = new Set((await c.query<{ id: string }>(`select id from pedido where id = any($1::bigint[]) and ${sqlCarritoEnEspera("pedido")}`,
      [estado.rows.map((p) => p.pedido_id)])).rows.map((p) => String(p.id)));
    for (const p of estado.rows) {
      if (esperando.has(String(p.pedido_id))) enEspera.push(Number(p.pedido_id));
      else if (p.completo) {
        await cambiarEstado(org, Number(p.pedido_id), "preparado", usuarioId, `picking #${loteId}`, c);
        preparados.push(Number(p.pedido_id));
      } else incompletos.push(Number(p.pedido_id));
    }
    await c.query("update picking_lote set estado = 'terminado', terminado_ts = now() where id = $1", [loteId]);
    return { preparados, incompletos, enEspera };
  });
}

/** Cancela un lote sin preparar (los pedidos quedan "en preparación" y
 *  vuelven a la lista para armar otro). */
export async function cancelarLote(org: string, loteId: number) {
  const r = await consulta("update picking_lote set estado = 'cancelado', terminado_ts = now() where id = $1 and organizacion_id = $2 and estado = 'abierto' returning id", [loteId, org]);
  if (!r.length) throw new ErrorErp("Ese picking no está abierto.");
}
