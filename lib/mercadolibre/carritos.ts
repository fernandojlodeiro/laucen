// Unir los carritos de Mercado Libre que quedaron partidos (arreglo de una
// vez, 3/10). Antes, cada orden de un carrito (pack) entraba como un pedido
// aparte; ahora un carrito es UN pedido (ver cargarOrdenes en pedidos.ts).
// Esto junta los pedidos que ya estaban partidos: mismo canal y mismo pack_id.
// Sólo los que todavía no se tocaron: nuevos o pagados, sin factura y sin
// lote de picking. Los que no puede unir los informa con el motivo. Repetirlo
// no hace nada (ya no quedan partidos). Lo dispara Fer con un botón.

import type { PoolClient } from "pg";
import { consulta, enTransaccion } from "@/lib/erp/base";
import { cambiarEstado, sqlCarritoEnEspera } from "@/lib/pedidos";

export type CarritoUnido = { canalId: number; pack: string; pedidoId: number; absorbidos: number[] };
export type CarritoSinUnir = { canalId: number; pack: string; pedidos: number[]; motivo: string };
export type ResultadoUnion = { unidos: CarritoUnido[]; sinUnir: CarritoSinUnir[] };

type FilaPedido = {
  id: string; id_externo: string | null; estado: string; estado_pago: string; deposito_id: string | null; medio_pago: string | null;
  total_ars: string; total_usd: string; costo_envio_ars: string; comision_ars: string | null; sin_vincular: boolean;
  orden: Record<string, unknown> | null; ordenes: Record<string, unknown> | null; facturado: boolean; en_picking: boolean; afecta_stock: boolean;
  en_espera: boolean;
};

/** Los grupos de pedidos de ML (de la organización) que comparten carrito. */
async function carritosPartidos(org: string) {
  return consulta<{ canal_id: number; pack: string; ids: number[] }>(`
    select p.canal_id::int, p.envio ->> 'pack_id' pack, array_agg(p.id::int order by p.id) ids
      from pedido p join canal ca on ca.id = p.canal_id and ca.tipo = 'mercadolibre'
     where p.organizacion_id = $1 and p.envio ? 'pack_id' and coalesce(p.envio ->> 'pack_id', '') not in ('', 'null')
       and p.estado not in ('cancelado', 'devuelto')
     group by 1, 2 having count(*) > 1 order by 2`, [org]);
}

/** Cuántos carritos partidos hay (para mostrar al lado del botón). */
export async function contarCarritosPartidos(org: string): Promise<number> {
  return (await carritosPartidos(org)).length;
}

export async function unirPedidosPartidos(org: string, quien: string): Promise<ResultadoUnion> {
  const res: ResultadoUnion = { unidos: [], sinUnir: [] };
  for (const g of await carritosPartidos(org)) {
    try {
      const r = await enTransaccion((c) => unirUno(c, org, g.canal_id, g.pack, quien));
      if ("motivo" in r) res.sinUnir.push({ canalId: g.canal_id, pack: g.pack, pedidos: g.ids, motivo: r.motivo });
      else res.unidos.push({ canalId: g.canal_id, pack: g.pack, ...r });
    } catch (e) {
      res.sinUnir.push({ canalId: g.canal_id, pack: g.pack, pedidos: g.ids, motivo: (e as Error).message });
    }
  }
  return res;
}

async function unirUno(c: PoolClient, org: string, canalId: number, pack: string, quien: string): Promise<{ pedidoId: number; absorbidos: number[] } | { motivo: string }> {
  // El mismo candado que usa la entrada de órdenes: no se cruza con una notificación del carrito.
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`ml-pack:${canalId}:${pack}`]);
  const filas = (await c.query<FilaPedido>(`
    select p.id, p.id_externo, p.estado, p.estado_pago, p.deposito_id, p.medio_pago, p.total_ars, p.total_usd, p.costo_envio_ars,
           p.comision_ars, p.sin_vincular, p.afecta_stock, p.datos_externos #> '{ml,orden}' orden, p.datos_externos #> '{ml,ordenes}' ordenes,
           exists (select 1 from comprobante cb where cb.pedido_id = p.id and cb.estado <> 'rechazado') facturado,
           exists (select 1 from picking_pedido pp where pp.pedido_id = p.id) en_picking,
           ${sqlCarritoEnEspera("p")} en_espera
      from pedido p
     where p.organizacion_id = $1 and p.canal_id = $2 and p.envio ->> 'pack_id' = $3 and p.estado not in ('cancelado', 'devuelto')
     order by p.id for update of p`, [org, canalId, pack])).rows;
  if (filas.length < 2) return { motivo: "ya no está partido" };
  // Un carrito que recibió un cambio hace menos de 10 minutos no se toca (ver
  // carritoEnEspera en lib/pedidos): se une en la próxima pasada.
  const enEspera = filas.filter((f) => f.en_espera).map((f) => f.id);
  if (enEspera.length) return { motivo: `recibió un cambio de Mercado Libre hace menos de 10 min (pedido ${enEspera.join(", ")}): se puede unir pasada la espera` };
  const facturados = filas.filter((f) => f.facturado).map((f) => f.id);
  if (facturados.length) return { motivo: `ya tiene factura (pedido ${facturados.join(", ")})` };
  const enPicking = filas.filter((f) => f.en_picking).map((f) => f.id);
  if (enPicking.length) return { motivo: `ya está en un lote de picking (pedido ${enPicking.join(", ")})` };
  const avanzados = filas.filter((f) => !["nuevo", "pagado"].includes(f.estado));
  if (avanzados.length) return { motivo: `ya se está preparando o salió (pedido ${avanzados.map((f) => `${f.id}: ${f.estado}`).join(", ")})` };

  const principal = filas.find((f) => f.id_externo === pack) ?? filas[0];
  const pid = Number(principal.id);
  const otros = filas.filter((f) => f !== principal);
  const ref = String(pid);

  // Las líneas viejas no sabían de qué orden eran: la del id_externo de su pedido.
  const marcarOrden = (pedido: string, orden: string | null) => orden && orden !== pack
    ? c.query(`update pedido_linea set datos_externos = jsonb_set(datos_externos, '{ml}', coalesce(datos_externos -> 'ml', '{}') || jsonb_build_object('order_id', $2::text))
                where pedido_id = $1 and datos_externos #>> '{ml,order_id}' is null`, [pedido, orden])
    : null;
  await marcarOrden(principal.id, principal.id_externo);

  const ordenes: Record<string, unknown> = {};
  for (const f of filas) {
    if (f.orden && typeof f.orden === "object" && "id" in f.orden) ordenes[String(f.orden.id)] = f.orden;
    Object.assign(ordenes, f.ordenes ?? {});
  }

  let lineasMovidas: { variacion_id: string | null; cantidad: number }[] = [];
  for (const o of otros) {
    // Lo que el otro pedido tenía reservado se libera; se vuelve a reservar a nombre del principal.
    await c.query(`select mover_stock($1, r.variacion_id, 'liberacion', r.cantidad, r.ubicacion_id, null, 'pedido', $2, $3, $4, r.kit_variacion_id)
                     from reservado_de($1, 'pedido', $2) r`, [org, o.id, quien, `se une al pedido ${pid} (carrito de Mercado Libre)`]);
    await marcarOrden(o.id, o.id_externo);
    const movidas = (await c.query<{ variacion_id: string | null; cantidad: number }>(`
      update pedido_linea set pedido_id = $1, orden = orden + (select count(*) from pedido_linea where pedido_id = $1)
       where pedido_id = $2 returning variacion_id, cantidad`, [pid, o.id])).rows;
    lineasMovidas = lineasMovidas.concat(movidas);
    for (const t of ["envio", "meli_mensaje", "meli_conversacion", "pago", "recepcion"]) {
      await c.query(`update ${t} set pedido_id = $1 where pedido_id = $2`, [pid, o.id]);
    }
    // Sus avisos de cambio de estado ya no corresponden (los atiende el principal).
    await c.query(`update evento set procesado_ts = now(), procesado_por = 'union_carrito'
                    where organizacion_id = $1 and tipo = 'pedido_estado_cambiado' and procesado_ts is null and payload ->> 'pedido_id' = $2`, [org, o.id]);
    await c.query("delete from pedido where id = $1", [o.id]);
  }

  const suma = (k: "total_ars" | "total_usd" | "costo_envio_ars") => Math.round(filas.reduce((s, f) => s + Number(f[k] ?? 0), 0) * 100) / 100;
  const comision = filas.reduce((s, f) => s + Number(f.comision_ars ?? 0), 0);
  const libre = !(await c.query("select 1 from pedido where canal_id = $1 and id_externo = $2 and id <> $3", [canalId, pack, pid])).rowCount;
  await c.query(`
    update pedido set total_ars = $3, total_usd = $4, costo_envio_ars = $5, comision_ars = $6,
           estado_pago = $7, medio_pago = coalesce(medio_pago, $8), sin_vincular = $9,
           id_externo = case when $10 then $11 else id_externo end,
           datos_externos = datos_externos || jsonb_build_object('ml', coalesce(datos_externos -> 'ml', '{}') || jsonb_build_object('ordenes', $12::jsonb, 'pack_id', $11::text))
     where id = $1 and organizacion_id = $2`,
    [pid, org, suma("total_ars"), suma("total_usd"), suma("costo_envio_ars"), comision || null,
      filas.every((f) => f.estado_pago === "pagado") ? "pagado" : filas.some((f) => f.estado_pago === "pendiente") ? "pendiente" : principal.estado_pago,
      filas.map((f) => f.medio_pago).find(Boolean) ?? null, filas.some((f) => f.sin_vincular), libre, pack, JSON.stringify(ordenes)]);
  await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                 values ($1, $2, $3, $3, $4, $5)`,
    [org, pid, principal.estado, quien, `Se unieron los pedidos ${otros.map((o) => o.id).join(", ")} (mismo carrito de Mercado Libre, ${pack})`]);

  // El stock: si el principal ya estaba pagado, se reservan las líneas que
  // llegaron; si estaba nuevo y alguno de los otros estaba pagado, el pedido
  // unido pasa a pagado (y reserva todas sus líneas).
  if (!principal.afecta_stock) {
    // Un pedido que no mueve stock no reserva nada.
  } else if (principal.estado === "pagado") {
    const dep = principal.deposito_id;
    for (const l of lineasMovidas) {
      if (l.variacion_id && dep) await c.query("select reservar_en_deposito($1, $2, $3, $4, 'pedido', $5, $6)", [org, l.variacion_id, dep, l.cantidad, ref, quien]);
    }
  } else if (otros.some((o) => o.estado === "pagado")) {
    await cambiarEstado(org, pid, "pagado", quien, "carrito de Mercado Libre unido", c);
  }
  return { pedidoId: pid, absorbidos: otros.map((o) => Number(o.id)) };
}
