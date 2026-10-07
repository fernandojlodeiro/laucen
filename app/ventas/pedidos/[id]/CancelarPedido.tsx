"use client";

// "Cancelar pedido" con lo que arrastra (Fer, 6/10): primero pregunta ahí
// mismo "¿Cancelar el pedido?" diciendo qué más va a pasar (se anula el envío
// de OCA, se anula o devuelve el pago de Payway); si el pedido tiene factura,
// después pregunta aparte "¿Emitir nota de crédito?". Lo hace de fondo
// (lib/pedidos/cancelar.ts).

import { useState } from "react";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { BORRAR, SUAVE } from "@/app/botones";
import { accionCancelarPedido } from "./acciones";

export default function CancelarPedido({ pid, oca, payway, factura, presupuesto = false }: {
  pid: number;
  /** Un presupuesto (Fer, 7/10): dice «presupuesto» y no habla de stock (no tiene nada reservado). */
  presupuesto?: boolean;
  oca: { tracking: string | null; anulable: boolean } | null;
  payway: { importe: string; mismoDia: boolean } | null;
  factura: string | null;
}) {
  const [paso, setPaso] = useState<0 | 1 | 2>(0);
  const tipo = `cancelar-${pid}`;
  const tambien = [
    presupuesto ? "No toca el stock (un presupuesto no reserva)." : "Libera el stock reservado.",
    oca && (oca.anulable ? `Anula en OCA el envío ${oca.tracking ?? ""}.` : "El envío de OCA ya salió: no se puede anular."),
    payway && (payway.mismoDia ? `Anula en Payway el pago de ${payway.importe} (es del día).` : `Devuelve en Payway el pago de ${payway.importe} (es de otro día: vuelve al resumen de la tarjeta).`),
  ].filter(Boolean).join(" ");

  if (paso === 0) return <button type="button" onClick={() => setPaso(1)} className={BORRAR}>{presupuesto ? "Cancelar presupuesto" : "Cancelar pedido"}</button>;
  if (paso === 1) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-xs">
        <b>{presupuesto ? "¿Cancelar el presupuesto?" : "¿Cancelar el pedido?"}</b> <span className="text-[#5C6B76]">{tambien}</span>
        {factura
          ? <button type="button" onClick={() => setPaso(2)} className={BORRAR}>Sí</button>
          : <BotonTarea accion={accionCancelarPedido} tipo={tipo} texto="Sí" clase={BORRAR} campos={{ pedido_id: String(pid), nc: "0" }} />}
        <button type="button" onClick={() => setPaso(0)} className={SUAVE}>No</button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <b>¿Emitir la nota de crédito de la {factura}?</b>
      <BotonTarea accion={accionCancelarPedido} tipo={tipo} texto="Sí, cancelar con nota de crédito" clase={BORRAR} campos={{ pedido_id: String(pid), nc: "1" }} />
      <BotonTarea accion={accionCancelarPedido} tipo={tipo} texto="No, cancelar sin nota de crédito" clase={SUAVE} campos={{ pedido_id: String(pid), nc: "0" }} />
      <button type="button" onClick={() => setPaso(0)} className={SUAVE}>No cancelar</button>
    </span>
  );
}
