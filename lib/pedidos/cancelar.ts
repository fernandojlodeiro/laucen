// Cancelar un pedido con todo lo que arrastra (Fer, 6/10). Después de que la
// persona confirma "¿Cancelar el pedido?" (y aparte "¿Emitir nota de
// crédito?"), en este orden:
//   1. el pedido pasa a cancelado (libera la reserva: el stock vuelve y las
//      publicaciones de ML se reactivan solas);
//   2. si tiene un envío de OCA que todavía no salió, se anula en OCA;
//   3. si se pagó con Payway, se le pide a Payway la devolución total. Es la
//      misma operación para los dos casos: si es en el día (antes del cierre
//      de lote) Payway la toma como ANULACIÓN; si es de otro día, como
//      DEVOLUCIÓN (el dinero vuelve al resumen de la tarjeta);
//   4. si se pidió, la nota de crédito por la factura autorizada.
// Cada paso que falla se avisa y no frena a los demás: el pedido queda
// cancelado igual y lo que falló se hace a mano desde su pantalla.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { cambiarEstado } from "@/lib/pedidos";
import { anularOca, envioOcaDe } from "@/lib/oca/envios";
import { devolver } from "@/lib/tienda/pagos/payway";
import { prepararNotaCredito, emitir } from "@/lib/arca/facturar";

const fechaAr = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(d));

export type QueArrastra = {
  oca: { envioId: number; tracking: string | null; anulable: boolean } | null;
  payway: { pagoId: number; idExterno: string; importe: number; mismoDia: boolean } | null;
  factura: { id: number; texto: string } | null;
};

/** Lo que va a pasar al cancelar (para mostrarlo en las preguntas). */
export async function queArrastraCancelar(org: string, pedidoId: number): Promise<QueArrastra> {
  const oca = await envioOcaDe(org, pedidoId);
  const pw = await una<{ id: number; id_externo: string; importe_ars: string; creado_ts: Date }>(`
    select id::int, id_externo, importe_ars, creado_ts from pago
     where organizacion_id = $1 and pedido_id = $2 and medio = 'payway' and estado = 'aprobado' and id_externo is not null
     order by id desc limit 1`, [org, pedidoId]);
  const f = await una<{ id: number; tipo_cbte: number; punto_venta: number; numero: string | null }>(`
    select cb.id::int, cb.tipo_cbte, cb.punto_venta, cb.numero::text from comprobante cb
     where cb.organizacion_id = $1 and cb.pedido_id = $2 and cb.tipo_cbte in (1, 6, 11) and cb.estado = 'autorizado'
       and not exists (select 1 from comprobante nc where nc.comprobante_asociado_id = cb.id and nc.estado in ('autorizado', 'pendiente', 'error'))
     order by cb.id desc limit 1`, [org, pedidoId]);
  const letra = (t: number) => ({ 1: "A", 6: "B", 11: "C" } as Record<number, string>)[t] ?? "";
  return {
    oca: oca ? { envioId: oca.id, tracking: oca.tracking, anulable: oca.estado === "ready_to_ship" && !oca.datos.en_camino } : null,
    payway: pw ? { pagoId: pw.id, idExterno: pw.id_externo, importe: Number(pw.importe_ars), mismoDia: fechaAr(pw.creado_ts) === fechaAr(new Date()) } : null,
    factura: f ? { id: f.id, texto: `Factura ${letra(f.tipo_cbte)} ${String(f.punto_venta).padStart(5, "0")}-${String(f.numero ?? "").padStart(8, "0")}` } : null,
  };
}

/** Cancela el pedido y hace lo que arrastra. Devuelve qué se hizo y qué falló, en criollo. */
export async function cancelarPedido(org: string, pedidoId: number, usuarioId: string, o: { notaCredito: boolean }): Promise<{ hecho: string[]; fallo: string[] }> {
  const p = await una<{ estado: string }>("select estado from pedido where id = $1 and organizacion_id = $2", [pedidoId, org]);
  if (!p) throw new ErrorErp("El pedido no existe.");
  if (["cancelado", "devuelto", "entregado"].includes(p.estado)) throw new ErrorErp(`El pedido está ${p.estado}: no se cancela.`);
  const q = await queArrastraCancelar(org, pedidoId);
  const hecho: string[] = [], fallo: string[] = [];
  const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));

  await cambiarEstado(org, pedidoId, "cancelado", usuarioId, "cancelado desde el pedido");
  hecho.push("Pedido cancelado (el stock vuelve)");

  if (q.oca?.anulable) {
    try { await anularOca(org, q.oca.envioId); hecho.push(`envío de OCA ${q.oca.tracking ?? ""} anulado`.trim()); }
    catch (e) { fallo.push(`OCA: ${motivo(e)}`); }
  } else if (q.oca) {
    fallo.push("OCA: el envío ya salió, no se puede anular");
  }

  if (q.payway) {
    try {
      const r = await devolver(org, pedidoId, q.payway.idExterno);
      const que = q.payway.mismoDia ? "anulado" : "devuelto";
      await consulta(`update pago set estado = 'reembolsado', actualizado_ts = now(), detalle = $2,
                             datos_externos = datos_externos || jsonb_build_object('devolucion', $3::jsonb)
                       where id = $1`, [q.payway.pagoId, q.payway.mismoDia ? "Anulado en Payway" : "Devuelto en Payway", JSON.stringify(r)]);
      await consulta("update pedido set estado_pago = 'reembolsado' where id = $1 and organizacion_id = $2", [pedidoId, org]);
      hecho.push(`pago de Payway ${que}`);
    } catch (e) { fallo.push(`Payway: ${motivo(e)}`); }
  }

  if (o.notaCredito && q.factura) {
    try {
      const nc = await prepararNotaCredito(org, q.factura.id, usuarioId);
      const r = await emitir(org, nc);
      if (r.estado === "autorizado") hecho.push(`nota de crédito de la ${q.factura.texto} emitida`);
      else fallo.push(`Nota de crédito: ${r.mensaje}`);
    } catch (e) { fallo.push(`Nota de crédito: ${motivo(e)}`); }
  }
  return { hecho, fallo };
}
