// Confirmar un pago (de MP o Payway, o a mano una transferencia / efectivo):
// el pago queda aprobado, el pedido "pagado" (con su reserva de stock), ML
// se entera del stock nuevo y, si va por OCA, el envío se da de alta solo.
// Repetirlo no hace nada.
//
// Un pedido «A cobrar» (efectivo al retirar, ver lib/pedidos) ya reservó y
// puede estar más adelante (en preparación, preparado): ahí el pedido no se
// mueve para atrás, sólo el pago queda pagado, y se emite
// `pedido_pago_confirmado` para que la facturación automática lo facture si
// ya llegó al estado en que se factura (facturarPendientes).

import { after } from "next/server";
import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { cambiarEstado } from "@/lib/pedidos";
import { sincronizarStockMl } from "@/lib/mercadolibre/stock";

type DatosPago = { medio: string; idExterno?: string | null; importe: number; cuotas?: number; detalle?: string | null; crudo?: unknown };

/** Lo mismo que confirmarPago, dentro de la transacción `c` (sin avisar a ML). */
async function confirmarPagoEn(c: PoolClient, org: string, pedidoId: number, d: DatosPago, quien: string) {
  const p = (await c.query<{ estado: string; estado_pago: string; canal_id: string }>(
    "select estado, estado_pago, canal_id from pedido where id = $1 and organizacion_id = $2 for update", [pedidoId, org])).rows[0];
  if (!p) throw new ErrorErp("El pedido no existe.");
  // Ya pagado y sin un pago nuevo identificable: no hay nada que hacer.
  if (p.estado_pago === "pagado" && !d.idExterno) return;
  if (d.idExterno) {
    const ya = await c.query("select id from pago where medio = $1 and id_externo = $2", [d.medio, d.idExterno]);
    if (ya.rowCount) {
      await c.query("update pago set estado = 'aprobado', actualizado_ts = now() where medio = $1 and id_externo = $2", [d.medio, d.idExterno]);
    } else {
      // El pago "pendiente" que dejó el checkout se completa (o se crea uno).
      const pend = await c.query<{ id: string }>("select id from pago where pedido_id = $1 and medio = $2 and estado = 'pendiente' and id_externo is null order by id limit 1", [pedidoId, d.medio]);
      if (pend.rows[0]) {
        await c.query(`update pago set estado = 'aprobado', id_externo = $2, importe_ars = $3, cuotas = $4, detalle = $5, datos_externos = $6::jsonb, usuario_id = $7, actualizado_ts = now() where id = $1`,
          [pend.rows[0].id, d.idExterno, d.importe, d.cuotas ?? 1, d.detalle ?? null, JSON.stringify(d.crudo ?? {}), quien]);
      } else {
        await c.query(`insert into pago (organizacion_id, pedido_id, medio, estado, importe_ars, cuotas, id_externo, detalle, datos_externos, usuario_id)
                       values ($1, $2, $3, 'aprobado', $4, $5, $6, $7, $8::jsonb, $9)`,
          [org, pedidoId, d.medio, d.importe, d.cuotas ?? 1, d.idExterno, d.detalle ?? null, JSON.stringify(d.crudo ?? {}), quien]);
      }
    }
  } else {
    const r = await c.query("update pago set estado = 'aprobado', usuario_id = $3, detalle = coalesce($4, detalle), actualizado_ts = now() where pedido_id = $1 and organizacion_id = $2 and estado = 'pendiente' returning id",
      [pedidoId, org, quien, d.detalle ?? null]);
    if (!r.rowCount) await c.query(`insert into pago (organizacion_id, pedido_id, medio, estado, importe_ars, detalle, usuario_id) values ($1, $2, $3, 'aprobado', $4, $5, $6)`,
      [org, pedidoId, d.medio, d.importe, d.detalle ?? null, quien]);
  }
  // Preventa con seña (Fer, 5/11): mientras lo cobrado no llega al total, el pedido no queda pago. La seña le saca el
  // vencimiento de la reserva (ya no se cancela solo) y queda esperando su orden; el saldo se paga cuando llega.
  const cuentas = (await c.query<{ preventa: boolean; total: number; cobrado: number }>(`
    select p.preventa_orden_id is not null preventa, p.total_ars::float8 total,
           coalesce((select sum(importe_ars) from pago where pedido_id = p.id and estado = 'aprobado'), 0)::float8 cobrado
      from pedido p where p.id = $1`, [pedidoId])).rows[0];
  if (cuentas.preventa && cuentas.cobrado < cuentas.total - 0.5) {
    await c.query("update pedido set reserva_hasta = null, reserva_vence_ts = null where id = $1", [pedidoId]);
    await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                   values ($1, $2, $3, $3, $4, $5)`, [org, pedidoId, p.estado, quien,
      `seña de preventa cobrada (${d.medio}): $ ${Math.round(d.importe).toLocaleString("es-AR")}; queda el saldo de $ ${Math.round(cuentas.total - cuentas.cobrado).toLocaleString("es-AR")}`]);
    return;
  }
  await c.query("update pedido set estado_pago = 'pagado', preventa_saldo_hasta = null where id = $1", [pedidoId]);
  if (p.estado === "nuevo") await cambiarEstado(org, pedidoId, "pagado", quien, `pago ${d.medio}`, c);
  else if (!["cancelado", "devuelto"].includes(p.estado)) {
    // Ya venía andando («A cobrar»): el estado no cambia; la facturación se entera por este evento.
    await c.query("select emitir_evento($1, 'pedido_pago_confirmado', $2::jsonb)",
      [org, JSON.stringify({ pedido_id: pedidoId, canal_id: Number(p.canal_id), estado: p.estado, medio: d.medio, quien })]);
  }
}

/** Le avisa a ML el stock nuevo de los productos de un pedido (tras reservar o vender). */
export async function avisarStockMl(org: string, pedidoId: number) {
  // Después de contestar (Fer, 25/10: la pasarela de Payway tardaba en abrir): actualizar el stock en
  // Mercado Libre puede llevar varios segundos y el comprador no tiene por qué esperarlo. Fuera de un
  // pedido web (un proceso suelto, una prueba), en el momento.
  try { after(() => sincronizarDelPedido(org, pedidoId)); } catch { await sincronizarDelPedido(org, pedidoId); }
}

async function sincronizarDelPedido(org: string, pedidoId: number) {
  const vars = await consulta<{ v: number }>("select distinct variacion_id::int v from pedido_linea where pedido_id = $1 and variacion_id is not null", [pedidoId]);
  if (vars.length) await sincronizarStockMl(org, vars.map((x) => x.v)).catch((e) => console.error("[tienda] stock a ML", e));
}

export async function confirmarPago(org: string, pedidoId: number, d: DatosPago, quien: string) {
  const p = await una<{ estado_pago: string }>("select estado_pago from pedido where id = $1 and organizacion_id = $2", [pedidoId, org]);
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (p.estado_pago === "pagado" && !d.idExterno) return;
  // Un carrito de la tienda que mezclaba productos en stock y en preventa se partió en dos pedidos que se pagan juntos
  // (Fer, 5/11): el pago del primero salda también los que van «junto» con él.
  const juntos = (await consulta<{ id: number; resto: number }>(`
    select x.id::int, (x.total_ars - coalesce((select sum(importe_ars) from pago where pedido_id = x.id and estado = 'aprobado'), 0))::float8 resto
      from pedido p cross join lateral jsonb_array_elements_text(coalesce(p.datos_externos #> '{tienda,junto}', '[]'::jsonb)) j(id)
      join pedido x on x.id = j.id::bigint and x.organizacion_id = p.organizacion_id
     where p.id = $1 and p.organizacion_id = $2 and x.estado_pago <> 'pagado' and x.estado <> 'cancelado'`, [pedidoId, org]));
  // Lo que se cobró de más que lo de este pedido es lo de los que van junto: cada pago queda con lo suyo.
  const deJuntos = juntos.reduce((t, j) => t + Math.max(0, j.resto), 0);
  const propio = juntos.length ? { ...d, importe: Math.max(0, Math.round((d.importe - deJuntos) * 100) / 100) } : d;
  await enTransaccion(async (c) => {
    await confirmarPagoEn(c, org, pedidoId, propio, quien);
    for (const j of juntos) {
      await confirmarPagoEn(c, org, j.id, { medio: d.medio, importe: Math.max(0, j.resto), detalle: `pagado junto con el pedido #${pedidoId}` }, quien);
    }
  });
  await avisarStockMl(org, pedidoId);
  await altaOcaAlPagar(org, pedidoId);
  for (const j of juntos) { await avisarStockMl(org, j.id); await altaOcaAlPagar(org, j.id); }
}

/** Lo que falta cobrar de un pedido (Fer, 5/11): una preventa con seña sin nada cobrado, la seña; si no, el total menos
 *  lo cobrado. Con los pedidos que se pagan junto con éste (un carrito partido en dos). */
export async function importeAPagar(org: string, pedidoId: number): Promise<{ importe: number; sena: boolean; saldo: boolean }> {
  const r = await una<{ total: number; cobrado: number; sena: number | null; juntos: number }>(`
    select p.total_ars::float8 total, coalesce((select sum(importe_ars) from pago where pedido_id = p.id and estado = 'aprobado'), 0)::float8 cobrado,
           p.preventa_sena_ars::float8 sena,
           coalesce((select sum(x.total_ars - coalesce((select sum(importe_ars) from pago where pedido_id = x.id and estado = 'aprobado'), 0))
                       from jsonb_array_elements_text(coalesce(p.datos_externos #> '{tienda,junto}', '[]'::jsonb)) j(id)
                       join pedido x on x.id = j.id::bigint and x.organizacion_id = p.organizacion_id and x.estado_pago <> 'pagado' and x.estado <> 'cancelado'), 0)::float8 juntos
      from pedido p where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]);
  if (!r) return { importe: 0, sena: false, saldo: false };
  if (r.sena && r.cobrado <= 0) return { importe: Math.round(r.sena * 100) / 100, sena: true, saldo: false };
  return { importe: Math.round((r.total - r.cobrado + r.juntos) * 100) / 100, sena: false, saldo: r.cobrado > 0 };
}

/** Si va por OCA, el envío se da de alta solo (lib/oca/envios.ts, altaOcaAutomatica): después de contestar, porque
 *  OCA puede tardar; fuera de un pedido web (el reintento de los comprobantes, un proceso suelto), en el momento. */
async function altaOcaAlPagar(org: string, pedidoId: number) {
  const alta = async () => {
    const { altaOcaAutomatica } = await import("@/lib/oca/envios");
    await altaOcaAutomatica(org, pedidoId).catch((e) => console.error("[oca] alta al pagar", pedidoId, e));
  };
  try { after(alta); } catch { await alta(); }
}

/** «Entregado y cobrado» (retiro de un pedido «A cobrar» ya preparado): en
 *  un solo paso confirma el cobro y lo marca entregado (el stock reservado
 *  pasa a vendido). */
export async function entregarYCobrar(org: string, pedidoId: number, medio: string, quien: string) {
  await enTransaccion(async (c) => {
    const p = (await c.query<{ estado: string; estado_pago: string; total_ars: string }>(
      "select estado, estado_pago, total_ars from pedido where id = $1 and organizacion_id = $2 for update", [pedidoId, org])).rows[0];
    if (!p) throw new ErrorErp("El pedido no existe.");
    if (p.estado !== "preparado") throw new ErrorErp("Sólo se entrega y cobra un pedido preparado.");
    if (p.estado_pago !== "pagado") await confirmarPagoEn(c, org, pedidoId, { medio, importe: Number(p.total_ars) }, quien);
    await cambiarEstado(org, pedidoId, "entregado", quien, `entregado y cobrado (${medio})`, c);
  });
  await avisarStockMl(org, pedidoId);
}

/** Marca un pago como rechazado/cancelado (el pedido sigue "nuevo", se puede reintentar). */
export async function pagoFallido(org: string, pedidoId: number, medio: string, idExterno: string | null, estado: "rechazado" | "cancelado", detalle: string, crudo?: unknown) {
  await consulta(`insert into pago (organizacion_id, pedido_id, medio, estado, importe_ars, id_externo, detalle, datos_externos)
                  select $1, $2, $3, $4, total_ars, $5, $6, $7::jsonb from pedido where id = $2 and organizacion_id = $1
                  on conflict (medio, id_externo) where id_externo is not null do update set estado = excluded.estado, detalle = excluded.detalle, actualizado_ts = now()`,
    [org, pedidoId, medio, estado, idExterno, detalle, JSON.stringify(crudo ?? {})]);
}
