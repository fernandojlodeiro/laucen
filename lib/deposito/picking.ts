// Picking (sesión 4): preparar pedidos de a uno o en lote, recorriendo el
// depósito por orden de ubicación y escaneando cada unidad.
//
// Los ítems salen de lo que cada pedido ya tiene reservado (reservado_de):
// la reserva, hecha al pagarse el pedido, ya dice de qué ubicación sale cada
// cosa (y un kit, sus componentes). Al armar el lote los pedidos pasan a
// "en preparación"; al terminar, los completos pasan a "preparado".
//
// Los «A cobrar» (efectivo al retirar, o a convenir; ver lib/pedidos) entran
// estando 'nuevo', sin esperar el pago: ya reservaron al crearse, y los
// viejos que nacieron sin reserva reservan al armar el lote (reservar_pedido
// es idempotente).

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { cambiarEstado, exigirCarritoLibre, sqlCarritoEnEspera, sqlACobrar, sqlSinEsperarPago } from "@/lib/pedidos";

/** SQL: el pedido (alias `p`) se prepara: pagado o en preparación, o «A cobrar» / a convenir estando nuevo. */
const SQL_PARA_PREPARAR = `(p.estado in ('pagado', 'en_preparacion') or (p.estado = 'nuevo' and ${sqlSinEsperarPago("p")}))`;
/** SQL: el depósito de donde sale (el suyo, o el que le tocaría si todavía no reservó). */
const SQL_DEPOSITO = "deposito_para_pedido(p.organizacion_id, p.canal_id, p.deposito_id)";

export type PedidoParaPreparar = {
  id: number; id_externo: string | null; fecha: Date; canal: string; cliente: string | null; estado: string;
  unidades: number; lineas: number; despachar_antes: Date | null; logistica: string | null; deposito_id: number | null;
  /** Carrito de ML en espera (ver carritoEnEspera): se muestra, pero no se puede preparar todavía. */
  carrito_ultimo_evento_ts: Date | null; en_espera: boolean;
  /** «A cobrar»: se cobra al entregar (efectivo al retirar). */
  a_cobrar: boolean; total_ars: number;
  /** Cómo sale (para filtrar el picking por tipo de envío): el tipo de canal, el método de envío de la tienda y su nombre. */
  canal_tipo: string; metodo_tipo: string | null; metodo_nombre: string | null; retira: boolean;
};

export type GrupoEnvio = "meli" | "oca" | "retiro" | "otros";
/** Los grupos del filtro del picking, con el texto corto de su pestaña (se usa en el celular). */
export const GRUPOS_ENVIO: { clave: GrupoEnvio; texto: string }[] = [
  { clave: "meli", texto: "Meli" }, { clave: "oca", texto: "OCA" }, { clave: "retiro", texto: "Retiran" }, { clave: "otros", texto: "Otros" },
];
const LOGISTICA_CORTA: Record<string, string> = {
  self_service: "Flex", cross_docking: "Colecta", xd_drop_off: "Colecta", drop_off: "Correo", custom: "A convenir", not_specified: "A convenir",
};

/** Por dónde sale un pedido (Fer, 6/10): su grupo y una marca corta ("Colecta", "Flex", "OCA sucursal", "Retira"…). */
export function envioDe(p: Pick<PedidoParaPreparar, "canal_tipo" | "logistica" | "metodo_tipo" | "metodo_nombre" | "retira">): { grupo: GrupoEnvio; marca: string } {
  if (p.canal_tipo === "mercadolibre") return { grupo: "meli", marca: LOGISTICA_CORTA[p.logistica ?? ""] ?? "Meli" };
  if (p.logistica === "oca" || p.metodo_tipo === "oca" || p.metodo_tipo === "oca_sucursal") {
    return { grupo: "oca", marca: p.metodo_tipo === "oca_sucursal" ? "OCA sucursal" : "OCA domicilio" };
  }
  if (p.retira || p.metodo_tipo === "retiro") return { grupo: "retiro", marca: "Retira" };
  return { grupo: "otros", marca: p.metodo_tipo === "a_convenir" ? "A convenir" : p.metodo_nombre ? p.metodo_nombre.slice(0, 18) : "Envío" };
}

/** Los pedidos que hay que preparar en un depósito: pagados (o que quedaron
 *  en preparación de un lote cancelado) o «A cobrar» / a convenir estando
 *  nuevos, que mueven stock, no de Full, y que
 *  no están en un lote abierto. Lo más urgente primero. Los carritos de ML
 *  en espera (cambio hace menos de 10 min) vienen con en_espera: la pantalla
 *  los muestra sin poder tildarlos, y crearLote los rechaza. */
export function pedidosParaPreparar(org: string, depositoId: number) {
  return consulta<PedidoParaPreparar>(`
    select p.id::int, p.id_externo, p.fecha, ca.nombre canal, cl.nombre cliente, p.estado,
           (select coalesce(sum(cantidad), 0)::int from pedido_linea where pedido_id = p.id and variacion_id is not null) unidades,
           (select count(*)::int from pedido_linea where pedido_id = p.id and variacion_id is not null) lineas,
           e.despachar_antes, e.logistica, ${SQL_DEPOSITO}::int deposito_id, p.carrito_ultimo_evento_ts, ${sqlCarritoEnEspera("p")} en_espera,
           ${sqlACobrar("p")} a_cobrar, p.total_ars::float total_ars,
           ca.tipo canal_tipo, me.tipo metodo_tipo, me.nombre metodo_nombre, coalesce(p.envio ->> 'metodo' = 'Retira', false) retira
      from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id
      left join metodo_envio me on me.id = p.metodo_envio_id
      left join lateral (select despachar_antes, logistica from envio where pedido_id = p.id and coalesce(estado, '') <> 'cancelled' order by id desc limit 1) e on true
     where p.organizacion_id = $1 and ${SQL_DEPOSITO} = $2 and p.afecta_stock and ${SQL_PARA_PREPARAR}
       and coalesce(e.logistica, '') <> 'fulfillment'
       and not exists (select 1 from picking_pedido pp join picking_lote l on l.id = pp.lote_id where pp.pedido_id = p.id and l.estado = 'abierto')
     order by e.despachar_antes nulls last, p.fecha`, [org, depositoId]);
}

/** Arma un lote con esos pedidos. Devuelve su id. */
export type ModoLote = "recorrido" | "hojas" | "empacar";
export const esModoLote = (x: unknown): x is ModoLote => x === "recorrido" || x === "hojas" || x === "empacar";

export async function crearLote(org: string, depositoId: number, pedidoIds: number[], usuarioId: string, modo: ModoLote = "recorrido", cx?: PoolClient): Promise<number> {
  if (!pedidoIds.length) throw new ErrorErp("Elegí al menos un pedido.");
  const correr = async (c: PoolClient) => {
    const ok = await c.query<{ id: string; estado: string; deposito_id: string | null; preparable: boolean }>(`
      select p.id, p.estado, ${SQL_DEPOSITO} deposito_id, ${SQL_PARA_PREPARAR} preparable
        from pedido p where p.organizacion_id = $1 and p.id = any($2::bigint[]) for update`, [org, pedidoIds]);
    if (ok.rowCount !== pedidoIds.length) throw new ErrorErp("Algún pedido no existe.");
    // Un carrito de ML al que todavía le puede llegar un ítem no se prepara.
    await exigirCarritoLibre(org, pedidoIds, c);
    for (const p of ok.rows) {
      if (!p.preparable) {
        throw new ErrorErp(p.estado === "nuevo" ? `El pedido ${p.id} espera el pago: no se prepara todavía.` : `El pedido ${p.id} está ${p.estado}: no se prepara.`);
      }
      if (Number(p.deposito_id) !== depositoId) throw new ErrorErp(`El pedido ${p.id} sale de otro depósito.`);
    }
    const ocupado = await c.query(`select pp.pedido_id from picking_pedido pp join picking_lote l on l.id = pp.lote_id
                                    where pp.pedido_id = any($1::bigint[]) and l.estado = 'abierto' limit 1`, [pedidoIds]);
    if (ocupado.rowCount) throw new ErrorErp(`El pedido ${ocupado.rows[0].pedido_id} ya está en otro picking abierto.`);
    const lote = Number((await c.query<{ id: string }>(
      "insert into picking_lote (organizacion_id, deposito_id, usuario_id, modo) values ($1, $2, $3, $4) returning id", [org, depositoId, usuarioId, modo])).rows[0].id);
    // Un «A cobrar» viejo que nació sin reserva reserva ahora (si ya reservó, no hace nada).
    for (const p of ok.rows) if (p.estado === "nuevo") await c.query("select reservar_pedido($1, $2, $3)", [org, p.id, usuarioId]);
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
    for (const p of ok.rows) if (p.estado === "pagado" || p.estado === "nuevo") await cambiarEstado(org, Number(p.id), "en_preparacion", usuarioId, `picking #${lote}`, c);
    return lote;
  };
  return cx ? correr(cx) : enTransaccion(correr);
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

/** Lo que se cargó con el código o el SKU de un kit (pack, combo). */
export type CargaKit = { sku: string; titulo: string; cantidad: number; pedidoId: number; unidades: number };

/** El código (de barras o SKU) de un kit del lote: carga `cantidad` kits en
 *  los renglones de sus componentes (cada componente, por las unidades que
 *  lleva el kit). En «empacar» (`unPedido`) van todos al pedido más viejo
 *  que lo necesita; si no, se reparten por orden (lo más viejo primero).
 *  Devuelve null si el código no es de un kit del lote. */
async function cargarKit(c: PoolClient, org: string, loteId: number, codigo: string, cantidad: number, unPedido: boolean): Promise<CargaKit | null> {
  const kit = (await c.query<{ id: string; sku: string; titulo: string }>(`
    select k.id, k.sku, titulo_variacion(k.id) titulo from picking_item i join variacion k on k.id = i.kit_variacion_id
     where i.lote_id = $1 and i.organizacion_id = $2 and (k.codigo_barras = $3 or lower(k.sku) = lower($3)) limit 1`, [loteId, org, codigo])).rows[0];
  if (!kit) return null;
  const comps = (await c.query<{ id: string; sku: string; por_kit: number }>(`
    select kc.variacion_componente_id id, v.sku, kc.cantidad::int por_kit from kit_componente kc join variacion v on v.id = kc.variacion_componente_id
     where kc.variacion_kit_id = $1`, [kit.id])).rows;
  let items = (await c.query<{ id: string; pedido_id: string; variacion_id: string; resto: number }>(`
    select i.id, i.pedido_id, i.variacion_id, (i.cantidad - i.escaneado - i.faltante)::int resto
      from picking_item i join pedido p on p.id = i.pedido_id
      join picking_pedido pp on pp.lote_id = i.lote_id and pp.pedido_id = i.pedido_id
     where i.lote_id = $1 and i.organizacion_id = $2 and i.kit_variacion_id = $3
       and i.escaneado + i.faltante < i.cantidad and pp.preparado_ts is null
     order by p.fecha, p.id, i.orden, i.id for update of i`, [loteId, org, kit.id])).rows;
  if (!items.length || !comps.length) throw new ErrorErp(`Ya están todos los ${kit.sku} que pide este ${unPedido ? "lote" : "picking"}: ése sobra.`);
  // Cuántos kits enteros entran en esos renglones.
  const entran = (xs: typeof items) => Math.min(...comps.map((k) => Math.floor(xs.filter((i) => String(i.variacion_id) === String(k.id)).reduce((a, i) => a + i.resto, 0) / k.por_kit)));
  const pedidoId = Number(items[0].pedido_id);
  if (unPedido) items = items.filter((i) => Number(i.pedido_id) === pedidoId);
  const hay = entran(items);
  if (hay < cantidad) {
    throw new ErrorErp(unPedido ? `Al pedido ${pedidoId} le ${hay === 1 ? "falta 1" : `faltan ${hay}`} de ${kit.sku}: cargá ${hay}${hay > 1 ? " (o menos)" : ""} y el resto, aparte.`
      : `De ${kit.sku} ${hay === 1 ? "falta 1" : `faltan ${hay}`} en este picking: cargá ${hay}${hay > 1 ? " (o menos)" : ""}.`);
  }
  let unidades = 0;
  for (const k of comps) {
    let falta = cantidad * k.por_kit;
    for (const i of items.filter((x) => String(x.variacion_id) === String(k.id))) {
      if (!falta) break;
      const n = Math.min(falta, i.resto);
      await c.query("update picking_item set escaneado = escaneado + $2 where id = $1", [i.id, n]);
      falta -= n; unidades += n;
    }
  }
  return { sku: kit.sku, titulo: kit.titulo, cantidad, pedidoId, unidades };
}

/** Un escaneo: busca el código (de barras o SKU) entre lo que falta del
 *  lote y suma una unidad (o `cantidad`). El código de un kit carga sus
 *  componentes (`kit` dice cuánto). */
export async function escanear(org: string, loteId: number, codigo: string, cantidad = 1): Promise<{ item: ItemPicking; completo: boolean; kit?: CargaKit }> {
  const t = codigo.trim();
  if (!t) throw new ErrorErp("No llegó ningún código.");
  if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorErp("La cantidad tiene que ser un número entero mayor que cero.");
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
    const kit = await enTransaccion((c) => cargarKit(c, org, loteId, t, cantidad, false));
    if (kit) {
      const item = (await itemsDelLote(org, loteId)).find((i) => i.pedido_id === kit.pedidoId && i.kit === kit.sku)!;
      return { item, completo: item.escaneado + item.faltante >= item.cantidad, kit };
    }
    const esta = await una(`select 1 from picking_item i join variacion v on v.id = i.variacion_id
                            where i.lote_id = $1 and (v.codigo_barras = $2 or lower(v.sku) = lower($2))`, [loteId, t]);
    if (!esta) throw new ErrorErp(`El código ${t} no es de este picking.`);
    throw new ErrorErp(cantidad > 1 ? `No hay un renglón de ${t} al que le falten ${cantidad}: cargá menos (mirá cuántas faltan en la lista).` : `Ya están todas las unidades de ${t}: ese sobra.`);
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
/** Desarmar el lote (Fer, 6/10): queda cancelado y sus pedidos sin preparar
 *  vuelven a la lista como estaban: si el lote los había pasado a "en
 *  preparación", vuelven al estado de antes (pagado, o nuevo si era «A cobrar»).
 *  La reserva de stock no cambia (en los dos estados está reservado). Los ya
 *  preparados quedan preparados. */
export async function cancelarLote(org: string, loteId: number, quien = "sistema") {
  await enTransaccion(async (c) => {
    const r = await c.query("update picking_lote set estado = 'cancelado', terminado_ts = now() where id = $1 and organizacion_id = $2 and estado = 'abierto' returning id", [loteId, org]);
    if (!r.rowCount) throw new ErrorErp("Ese picking no está abierto.");
    const volver = await c.query<{ id: string; anterior: string }>(`
      select p.id, h.estado_anterior anterior
        from picking_pedido pp join pedido p on p.id = pp.pedido_id
        join lateral (select estado_anterior from pedido_estado_historial
                       where pedido_id = p.id and estado_nuevo = 'en_preparacion' order by id desc limit 1) h on true
       where pp.lote_id = $1 and pp.preparado_ts is null and p.estado = 'en_preparacion' and h.estado_anterior in ('nuevo', 'pagado')
         and not exists (select 1 from picking_pedido o join picking_lote ol on ol.id = o.lote_id
                          where o.pedido_id = p.id and ol.estado = 'abierto' and ol.id <> $1)`, [loteId]);
    for (const p of volver.rows) {
      await c.query("update pedido set estado = $2 where id = $1", [p.id, p.anterior]);
      await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                     values ($1, $2, 'en_preparacion', $3, $4, $5)`, [org, p.id, p.anterior, quien, `lote #${loteId} desarmado`]);
      await c.query("select emitir_evento($1, 'pedido_estado_cambiado', $2::jsonb)",
        [org, JSON.stringify({ pedido_id: Number(p.id), anterior: "en_preparacion", nuevo: p.anterior, quien })]);
    }
  });
}

// ── Etiqueta + hoja de preparación (Fer, 3/10) ──────────────────────────
// El camino principal: se tildan pedidos y se imprime un PDF con la etiqueta
// y la hoja de cada uno (lib/deposito/hojas.ts). Al imprimir, los pedidos
// entran en un lote modo 'hojas' (en preparación) para que no se impriman
// dos veces sin querer; cada pedido se cierra con "Preparado" o escaneando el
// código de barras de su hoja.

/** Los pedidos de un lote, con lo que hace falta para cerrarlos. */
export type PedidoDelLote = {
  id: number; id_externo: string | null; cliente: string | null; apodo: string | null; canal: string; estado: string; fecha: Date;
  despachar_antes: Date | null; unidades: number; escaneadas: number; impreso_ts: Date | null; impresiones: number; preparado_ts: Date | null;
  carrito_ultimo_evento_ts: Date | null; en_espera: boolean; a_cobrar: boolean; total_ars: number;
};

export function pedidosDelLote(org: string, loteId: number) {
  return consulta<PedidoDelLote>(`
    select p.id::int, p.id_externo, cl.nombre cliente, cl.apodo_ml apodo, ca.nombre canal, p.estado, p.fecha, e.despachar_antes,
           coalesce(i.unidades, 0)::int unidades, coalesce(i.escaneadas, 0)::int escaneadas,
           pp.impreso_ts, pp.impresiones, pp.preparado_ts, p.carrito_ultimo_evento_ts, ${sqlCarritoEnEspera("p")} en_espera,
           ${sqlACobrar("p")} a_cobrar, p.total_ars::float total_ars
      from picking_pedido pp join pedido p on p.id = pp.pedido_id join canal ca on ca.id = p.canal_id
      left join cliente cl on cl.id = p.cliente_id
      left join lateral (select despachar_antes from envio where pedido_id = p.id order by id desc limit 1) e on true
      left join lateral (select sum(cantidad) unidades, sum(least(escaneado, cantidad)) escaneadas from picking_item
                          where lote_id = pp.lote_id and pedido_id = p.id) i on true
     where pp.lote_id = $1 and pp.organizacion_id = $2
     order by p.fecha, p.id`, [loteId, org]);
}

/** Antes de imprimir: los pedidos tildados que todavía no están en un lote
 *  abierto (pagados o en preparación, o «A cobrar» nuevos; de un depósito, no de Full) entran en
 *  uno nuevo modo 'hojas', uno por depósito. Los demás se imprimen igual
 *  (reimpresión) sin tocarlos. Un carrito de ML en espera frena todo. */
export async function prepararImpresion(org: string, pedidoIds: number[], usuarioId: string): Promise<{ lotes: number[]; enLote: number[] }> {
  const ids = [...new Set(pedidoIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) throw new ErrorErp("Elegí al menos un pedido.");
  return enTransaccion(async (c) => {
    await exigirCarritoLibre(org, ids, c);
    const nuevos = (await c.query<{ id: string; deposito_id: string }>(`
      select p.id, ${SQL_DEPOSITO} deposito_id from pedido p
        left join lateral (select logistica from envio where pedido_id = p.id order by id desc limit 1) e on true
       where p.organizacion_id = $1 and p.id = any($2::bigint[]) and p.afecta_stock and ${SQL_PARA_PREPARAR}
         and ${SQL_DEPOSITO} is not null and coalesce(e.logistica, '') <> 'fulfillment'
         and not exists (select 1 from picking_pedido pp join picking_lote l on l.id = pp.lote_id where pp.pedido_id = p.id and l.estado = 'abierto')
       order by p.fecha, p.id`, [org, ids])).rows;
    const porDeposito = new Map<number, number[]>();
    for (const p of nuevos) porDeposito.set(Number(p.deposito_id), [...(porDeposito.get(Number(p.deposito_id)) ?? []), Number(p.id)]);
    const lotes: number[] = [];
    for (const [dep, ps] of porDeposito) lotes.push(await crearLote(org, dep, ps, usuarioId, "hojas", c));
    return { lotes, enLote: nuevos.map((p) => Number(p.id)) };
  });
}

/** Después de imprimir: la etiqueta de ML de cada pedido queda impresa y, en
 *  su lote abierto, cuándo y cuántas veces se imprimió su hoja. */
export async function marcarImpreso(org: string, pedidoIds: number[], c?: PoolClient) {
  const q = (sql: string, v: unknown[]) => (c ? c.query(sql, v) : consulta(sql, v));
  await q(`update envio set etiqueta_impresa_ts = now(), actualizado_ts = now()
            where organizacion_id = $1 and pedido_id = any($2::bigint[]) and id_externo is not null and coalesce(logistica, '') <> 'fulfillment'`, [org, pedidoIds]);
  await q(`update picking_pedido pp set impreso_ts = coalesce(pp.impreso_ts, now()), impresiones = pp.impresiones + 1
             from picking_lote l where l.id = pp.lote_id and l.estado = 'abierto' and pp.organizacion_id = $1 and pp.pedido_id = any($2::bigint[])`, [org, pedidoIds]);
}

/** "#123", "P123" o "123" → 123 (el código de la hoja es el N.º de pedido). */
export function leerCodigoPedido(codigo: string): number | null {
  const t = String(codigo ?? "").trim().replace(/^(#|p|pedido)\s*/i, "");
  return /^\d{1,15}$/.test(t) ? Number(t) : null;
}

/** El pedido de ese código, si es de este lote (para confirmar antes de cerrarlo). */
export async function pedidoDelLotePorCodigo(org: string, loteId: number, codigo: string): Promise<PedidoDelLote> {
  const n = leerCodigoPedido(codigo);
  if (n == null) throw new ErrorErp(`"${codigo.trim()}" no es un número de pedido.`);
  const p = (await pedidosDelLote(org, loteId)).find((x) => x.id === n);
  if (!p) throw new ErrorErp(`El pedido ${n} no es de este lote.`);
  return p;
}

/** Lo que dice el código de barras (o el QR) de una etiqueta: el QR de ML es un
 *  JSON con el id del envío; el código de barras, el número tal cual. */
export function leerCodigoEtiqueta(codigo: string): { texto: string; digitos: string } {
  let t = String(codigo ?? "").trim();
  if (t.startsWith("{")) {
    try { const j = JSON.parse(t) as { id?: unknown }; if (j?.id != null) t = String(j.id); } catch { /* no era JSON */ }
  }
  return { texto: t.toUpperCase(), digitos: t.replace(/\D/g, "") };
}

// Un envío con etiqueta de transportista: la de Mercado Libre (no Full) o la de OCA.
const SQL_CON_ETIQUETA = `e.estado is distinct from 'cancelled' and coalesce(e.estado, '') <> 'cancelado'
  and ((e.id_externo is not null and coalesce(e.logistica, '') not in ('fulfillment', 'oca')) or (e.logistica = 'oca' and coalesce(e.tracking, e.datos_externos #>> '{oca,numero_envio}') is not null))`;

// El envío `e` es el de la etiqueta escaneada ($t: el texto en mayúsculas; $d: sólo sus números):
// de ML, su id (el código de barras o el QR) o su tracking; de OCA, su número de envío o un código
// que lo trae adentro (el de la pieza o el QR, aunque cambie la cantidad de ceros del medio).
const sqlEtiquetaEs = (t: string, d: string) => `(upper(e.tracking) = ${t}
         or (e.logistica is distinct from 'oca' and ${d} <> '' and e.id_externo = ${d})
         or (e.logistica = 'oca' and ${d} <> '' and (
               e.datos_externos #>> '{oca,numero_envio}' = ${d}
            or (length(coalesce(e.datos_externos #>> '{oca,numero_envio}', e.tracking)) >= 8
                and (${d} like '%' || regexp_replace(coalesce(e.datos_externos #>> '{oca,numero_envio}', e.tracking), '\\D', '', 'g') || '%'
                  -- El QR de OCA trae el número con otro relleno de ceros y la pieza al final:
                  -- envío 4960400000000012762 → QR 0170104960400000000001276 21 (Fer, 6/10).
                  or ${d} ~ (regexp_replace(regexp_replace(coalesce(e.datos_externos #>> '{oca,numero_envio}', e.tracking), '\\D', '', 'g'),
                                            '^([0-9]*?[1-9])0{3,}([1-9][0-9]*)$', '\\10+\\2') || '[0-9]{0,3}$'))))))`;

/** Cerrar un pedido del lote escaneando la ETIQUETA (Fer, 6/10): así el paquete
 *  que se cierra es el que lleva la etiqueta de su comprador. Vale el código de
 *  barras o el QR de la etiqueta de Mercado Libre (id del envío o su tracking) y
 *  el de OCA (número de envío; el de la pieza lo trae adentro). Un carrito de ML
 *  con varios pedidos lleva una sola etiqueta: devuelve todos los de esa etiqueta.
 *  El N.º de pedido (la hoja) sirve sólo para los pedidos sin etiqueta de
 *  transportista (retiro, envío propio, venta del local). */
export async function pedidosDelLotePorEtiqueta(org: string, loteId: number, codigo: string): Promise<{ pedidos: PedidoDelLote[]; etiqueta: "ml" | "oca" | null }> {
  const { texto, digitos } = leerCodigoEtiqueta(codigo);
  if (!texto) throw new ErrorErp("No llegó ningún código.");
  const del = await pedidosDelLote(org, loteId);
  const enLote = del.map((p) => p.id);
  const hallados = await consulta<{ pedido_id: number; oca: boolean }>(`
    select distinct e.pedido_id::int, e.logistica = 'oca' oca from envio e
     where e.organizacion_id = $1 and e.pedido_id = any($2::bigint[]) and ${SQL_CON_ETIQUETA}
       and ${sqlEtiquetaEs("$3", "$4")}`,
    [org, enLote, texto, digitos]);
  if (hallados.length) {
    const ids = new Set(hallados.map((h) => h.pedido_id));
    return { pedidos: del.filter((p) => ids.has(p.id)), etiqueta: hallados.some((h) => h.oca) ? "oca" : "ml" };
  }
  const n = leerCodigoPedido(codigo);
  const p = n == null ? null : del.find((x) => x.id === n);
  if (!p) throw new ErrorErp(`"${String(codigo).trim()}" no es la etiqueta de ningún pedido de este lote.`);
  const con = await una<{ oca: boolean }>(`select e.logistica = 'oca' oca from envio e where e.organizacion_id = $1 and e.pedido_id = $2 and ${SQL_CON_ETIQUETA} limit 1`, [org, p.id]);
  if (con) throw new ErrorErp(`El pedido ${p.id} lleva etiqueta de ${con.oca ? "OCA" : "Mercado Libre"}: escaneá el código de barras de la etiqueta, no el de la hoja.`);
  return { pedidos: [p], etiqueta: null };
}

/** Cierra un pedido del lote: queda "preparado" (todo lo suyo, juntado). Si
 *  era el último del lote, el lote se termina solo. */
export async function marcarPreparado(org: string, loteId: number, pedidoId: number, usuarioId: string, cx?: PoolClient): Promise<{ loteTerminado: boolean }> {
  const correr = async (c: PoolClient) => {
    const l = (await c.query<{ estado: string }>("select estado from picking_lote where id = $1 and organizacion_id = $2 for update", [loteId, org])).rows[0];
    if (!l) throw new ErrorErp("Ese lote no existe.");
    if (l.estado !== "abierto") throw new ErrorErp("Ese lote ya está cerrado.");
    const pp = (await c.query<{ preparado_ts: Date | null }>("select preparado_ts from picking_pedido where lote_id = $1 and pedido_id = $2", [loteId, pedidoId])).rows[0];
    if (!pp) throw new ErrorErp(`El pedido ${pedidoId} no es de este lote.`);
    if (pp.preparado_ts) throw new ErrorErp(`El pedido ${pedidoId} ya está preparado.`);
    await exigirCarritoLibre(org, pedidoId, c);
    await c.query("update picking_item set escaneado = cantidad, faltante = 0 where lote_id = $1 and pedido_id = $2", [loteId, pedidoId]);
    await cambiarEstado(org, pedidoId, "preparado", usuarioId, `lote #${loteId}`, c);
    await c.query("update picking_pedido set preparado_ts = now() where lote_id = $1 and pedido_id = $2", [loteId, pedidoId]);
    const quedan = (await c.query("select 1 from picking_pedido where lote_id = $1 and preparado_ts is null limit 1", [loteId])).rowCount;
    if (!quedan) await c.query("update picking_lote set estado = 'terminado', terminado_ts = now() where id = $1", [loteId]);
    return { loteTerminado: !quedan };
  };
  return cx ? correr(cx) : enTransaccion(correr);
}

export type FaltaEmpacar = { sku: string; titulo: string; ubicacion: string; faltan: number };
export type ResultadoEmpacar = {
  pedidoId: number; sku: string; titulo: string; completo: boolean; preparado: boolean;
  /** Si quedó completo pero no se pudo cerrar (ej. carrito en espera). */
  aviso: string | null; faltan: FaltaEmpacar[]; loteTerminado: boolean;
  /** Si se cargó con el código de un kit: cuántos y cuántas unidades. */
  kit?: CargaKit | null;
};

/** Lo que le falta a un pedido del lote. */
export async function faltanDelPedido(org: string, loteId: number, pedidoId: number, c?: PoolClient): Promise<FaltaEmpacar[]> {
  const sql = `select v.sku, titulo_variacion(v.id) titulo, u.codigo ubicacion, (i.cantidad - i.escaneado - i.faltante)::int faltan
                 from picking_item i join variacion v on v.id = i.variacion_id join ubicacion u on u.id = i.ubicacion_id
                where i.lote_id = $1 and i.organizacion_id = $2 and i.pedido_id = $3 and i.escaneado + i.faltante < i.cantidad order by i.orden, i.id`;
  return c ? (await c.query<FaltaEmpacar>(sql, [loteId, org, pedidoId])).rows : consulta<FaltaEmpacar>(sql, [loteId, org, pedidoId]);
}

/** Empacar escaneando (el camino alternativo): en la mesa se escanea un
 *  producto y va al primer pedido del lote que lo necesita (el más viejo de
 *  los que siguen incompletos). Si con eso el pedido queda completo, se
 *  cierra (preparado) y la pantalla imprime sólo su etiqueta. */
export async function empacar(org: string, loteId: number, codigo: string, usuarioId: string, cantidad = 1): Promise<ResultadoEmpacar> {
  const t = codigo.trim();
  if (!t) throw new ErrorErp("No llegó ningún código.");
  if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorErp("La cantidad tiene que ser un número entero mayor que cero.");
  return enTransaccion(async (c) => {
    const l = (await c.query<{ estado: string }>("select estado from picking_lote where id = $1 and organizacion_id = $2 for update", [loteId, org])).rows[0];
    if (!l) throw new ErrorErp("Ese lote no existe.");
    if (l.estado !== "abierto") throw new ErrorErp("Ese lote ya está cerrado.");
    // El primer pedido (el más viejo) que necesita ese producto. Con una
    // cantidad, van todas a ese pedido: si le faltan menos, avisa.
    const cual = (await c.query<{ id: string; pedido_id: string; resto: number }>(`
      select i.id, i.pedido_id, (i.cantidad - i.escaneado - i.faltante)::int resto
        from picking_item i join variacion v on v.id = i.variacion_id join pedido p on p.id = i.pedido_id
        join picking_pedido pp on pp.lote_id = i.lote_id and pp.pedido_id = i.pedido_id
       where i.lote_id = $1 and i.organizacion_id = $2 and (v.codigo_barras = $3 or lower(v.sku) = lower($3))
         and i.escaneado + i.faltante < i.cantidad and pp.preparado_ts is null
       order by p.fecha, p.id, i.orden, i.id limit 1 for update of i`, [loteId, org, t])).rows[0];
    if (cual && cual.resto < cantidad) {
      throw new ErrorErp(`Al pedido ${cual.pedido_id} le faltan ${cual.resto} de ${t}: cargá ${cual.resto}${cual.resto === 1 ? "" : " (o menos)"} y el resto, aparte.`);
    }
    let r = cual ? (await c.query<{ id: string; pedido_id: string; sku: string; titulo: string }>(`
      update picking_item set escaneado = escaneado + $2 where id = $1
      returning id, pedido_id, (select sku from variacion where id = variacion_id) sku, titulo_variacion(variacion_id) titulo`, [cual.id, cantidad])).rows[0] : undefined;
    // El código de un kit: sus componentes, todos al mismo pedido.
    let kit: CargaKit | null = null;
    if (!r) {
      kit = await cargarKit(c, org, loteId, t, cantidad, true);
      if (kit) r = { id: "", pedido_id: String(kit.pedidoId), sku: kit.sku, titulo: kit.titulo };
    }
    if (!r) {
      const esta = (await c.query(`select 1 from picking_item i join variacion v on v.id = i.variacion_id
                                    where i.lote_id = $1 and (v.codigo_barras = $2 or lower(v.sku) = lower($2)) limit 1`, [loteId, t])).rowCount;
      throw new ErrorErp(esta ? `Ya están todas las unidades de ${t} que pide este lote: ésa sobra, dejala aparte.` : `El código ${t} no es de ningún pedido de este lote.`);
    }
    const pedidoId = Number(r.pedido_id);
    const faltan = await faltanDelPedido(org, loteId, pedidoId, c);
    const completo = faltan.length === 0
      && !(await c.query("select 1 from picking_item where lote_id = $1 and pedido_id = $2 and escaneado < cantidad limit 1", [loteId, pedidoId])).rowCount;
    let preparado = false, aviso: string | null = null, loteTerminado = false;
    if (completo) {
      const espera = (await c.query(`select 1 from pedido p where p.id = $1 and ${sqlCarritoEnEspera("p")}`, [pedidoId])).rowCount;
      if (espera) aviso = `El pedido ${pedidoId} está completo, pero es un carrito de Mercado Libre que recibió un cambio hace menos de 10 min: cerralo con "Preparado" pasada la espera.`;
      else { loteTerminado = (await marcarPreparado(org, loteId, pedidoId, usuarioId, c)).loteTerminado; preparado = true; }
    } else if (faltan.length === 0) aviso = `El pedido ${pedidoId} tiene faltantes marcados: no se cierra solo.`;
    return { pedidoId, sku: r.sku, titulo: r.titulo, completo, preparado, aviso, faltan, loteTerminado, kit };
  });
}

/** El pedido de un número escrito o escaneado (el N.º de Laucen, con o sin
 *  "#", o el número del canal, ej. el de la venta de Mercado Libre), para el
 *  «preparado rápido». */
export async function pedidoPorNumero(org: string, codigo: string): Promise<{ id: number; cliente: string | null; estado: string; unidades: number; deposito_id: number | null; lote: number | null; preparable: boolean; full: boolean }> {
  const t = String(codigo ?? "").trim();
  if (!t) throw new ErrorErp("Escribí el número de pedido.");
  const n = leerCodigoPedido(t);
  const p = await una<{ id: number; cliente: string | null; estado: string; unidades: number; deposito_id: number | null; lote: number | null; preparable: boolean; full: boolean }>(`
    select p.id::int, cl.nombre cliente, p.estado, ${SQL_DEPOSITO}::int deposito_id, ${SQL_PARA_PREPARAR} preparable,
           coalesce((select logistica from envio where pedido_id = p.id order by id desc limit 1), '') = 'fulfillment' "full",
           (select coalesce(sum(cantidad), 0)::int from pedido_linea where pedido_id = p.id and variacion_id is not null) unidades,
           (select pp.lote_id::int from picking_pedido pp join picking_lote l on l.id = pp.lote_id
             where pp.pedido_id = p.id and l.estado = 'abierto' limit 1) lote
      from pedido p left join cliente cl on cl.id = p.cliente_id
     where p.organizacion_id = $1 and (p.id_externo = $2 or ($3::bigint is not null and p.id = $3::bigint)
       -- O la etiqueta del envío (ML u OCA, código de barras o QR; Fer, 6/10).
       or p.id = (select e.pedido_id from envio e where e.organizacion_id = $1 and e.pedido_id is not null
                   and ${SQL_CON_ETIQUETA} and ${sqlEtiquetaEs("$4", "$5")} order by e.id desc limit 1))
     order by (p.id = $3::bigint) desc nulls last, p.id desc limit 1`,
    [org, t, n != null && n <= Number.MAX_SAFE_INTEGER ? n : null, leerCodigoEtiqueta(t).texto, leerCodigoEtiqueta(t).digitos]);
  if (!p) throw new ErrorErp(`No hay ningún pedido con el número o la etiqueta ${t}.`);
  if (p.full) throw new ErrorErp(`El pedido ${p.id} es de Full: lo prepara Mercado Libre.`);
  return p;
}

/** «Preparado rápido» (provisorio, con el permiso picking_sin_escanear):
 *  el pedido queda preparado de una, con todos sus ítems tildados. Si ya
 *  está en un lote abierto se cierra ahí; si no, se arma un lote con él solo
 *  (que queda terminado). */
export async function prepararRapido(org: string, codigo: string, usuarioId: string): Promise<{ pedidoId: number; loteId: number }> {
  const p = await pedidoPorNumero(org, codigo);
  return enTransaccion(async (c) => {
    let lote = p.lote;
    if (!lote) {
      if (p.estado === "preparado") throw new ErrorErp(`El pedido ${p.id} ya está preparado.`);
      if (!p.deposito_id) throw new ErrorErp(`El pedido ${p.id} no tiene de qué depósito salir.`);
      lote = await crearLote(org, p.deposito_id, [p.id], usuarioId, "hojas", c);
    }
    await marcarPreparado(org, lote, p.id, usuarioId, c);
    return { pedidoId: p.id, loteId: lote };
  });
}
