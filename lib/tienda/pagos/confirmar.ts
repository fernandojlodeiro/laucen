// Confirmar un pago (de MP o Payway, o a mano una transferencia / efectivo):
// el pago queda aprobado, el pedido "pagado" (con su reserva de stock) y ML
// se entera del stock nuevo. Repetirlo no hace nada.
//
// Un pedido «A cobrar» (efectivo al retirar, ver lib/pedidos) ya reservó y
// puede estar más adelante (en preparación, preparado): ahí el pedido no se
// mueve para atrás, sólo el pago queda pagado, y se emite
// `pedido_pago_confirmado` para que la facturación automática lo facture si
// ya llegó al estado en que se factura (facturarPendientes).

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
  await c.query("update pedido set estado_pago = 'pagado' where id = $1", [pedidoId]);
  if (p.estado === "nuevo") await cambiarEstado(org, pedidoId, "pagado", quien, `pago ${d.medio}`, c);
  else if (!["cancelado", "devuelto"].includes(p.estado)) {
    // Ya venía andando («A cobrar»): el estado no cambia; la facturación se entera por este evento.
    await c.query("select emitir_evento($1, 'pedido_pago_confirmado', $2::jsonb)",
      [org, JSON.stringify({ pedido_id: pedidoId, canal_id: Number(p.canal_id), estado: p.estado, medio: d.medio, quien })]);
  }
}

/** Le avisa a ML el stock nuevo de los productos de un pedido (tras reservar o vender). */
export async function avisarStockMl(org: string, pedidoId: number) {
  const vars = await consulta<{ v: number }>("select distinct variacion_id::int v from pedido_linea where pedido_id = $1 and variacion_id is not null", [pedidoId]);
  if (vars.length) await sincronizarStockMl(org, vars.map((x) => x.v)).catch((e) => console.error("[tienda] stock a ML", e));
}

export async function confirmarPago(org: string, pedidoId: number, d: DatosPago, quien: string) {
  const p = await una<{ estado_pago: string }>("select estado_pago from pedido where id = $1 and organizacion_id = $2", [pedidoId, org]);
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (p.estado_pago === "pagado" && !d.idExterno) return;
  await enTransaccion((c) => confirmarPagoEn(c, org, pedidoId, d, quien));
  await avisarStockMl(org, pedidoId);
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
