// El recuadro de OCA en la ficha del pedido (Fer, 6/10): sin envío, el botón
// «Despachar por OCA» (lo da de alta en OCA); con envío, el número de
// seguimiento, la etiqueta, el historial que informa OCA, «Actualizar
// seguimiento» y, mientras no salió, «Anular». Todo corre de fondo.

import { BotonTarea } from "@/app/componentes/TareasFondo";
import { PRIMARIO, SUAVE, BORRAR } from "@/app/botones";
import { accionAltaOca, accionSeguirOca, accionAnularOca } from "./acciones";

type Paso = { estado: string; motivo: string; sucursal: string; fecha: string | null };

const fechaCorta = (d: string | null) => d ? new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export default function EnvioOca({ pid, envio, sucursal }: {
  pid: number; sucursal: string | null;
  envio: { id: number; estado: string | null; tracking: string | null; datos: Record<string, unknown> } | null;
}) {
  const campos = { pedido_id: String(pid) };
  if (!envio) {
    return (
      <div className="mt-3 pt-3 border-t border-[#E3E9F0] flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[#5C6B76]">{sucursal ? `Retira en la sucursal de OCA ${sucursal}.` : "Se puede despachar por OCA."}</span>
        <BotonTarea accion={accionAltaOca} tipo={`oca-alta-${pid}`} texto="🚚 Despachar por OCA" clase={PRIMARIO} campos={campos}
          pregunta="¿Dar de alta el envío en OCA?" />
      </div>
    );
  }
  const d = envio.datos;
  const historial = ((d.historial as Paso[] | undefined) ?? []).slice().reverse();
  const error = typeof d.ultimo_error === "string" ? d.ultimo_error : null;
  return (
    <div className="mt-3 pt-3 border-t border-[#E3E9F0] grid gap-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>OCA · envío <b className="font-mono">{envio.tracking}</b>{d.orden_retiro ? <span className="text-[#5C6B76]"> · orden de retiro {String(d.orden_retiro)}</span> : null}</span>
        <span className="flex flex-wrap gap-2">
          <a href={`/ventas/pedidos/${pid}/etiqueta-oca`} target="_blank" rel="noopener" className={SUAVE}>🖨 Etiqueta de OCA</a>
          <BotonTarea accion={accionSeguirOca} tipo={`oca-seguir-${pid}`} texto="↻ Actualizar seguimiento" clase={SUAVE} campos={campos} />
          {envio.estado === "ready_to_ship" && (
            <BotonTarea accion={accionAnularOca} tipo={`oca-anular-${pid}`} texto="Anular en OCA" clase={BORRAR} campos={campos} pregunta="¿Anular el envío en OCA?" />
          )}
        </span>
      </div>
      {error && <p className="text-[11px] text-[#C03420]">La última lectura del seguimiento falló: {error}</p>}
      {historial.length > 0 ? (
        <ul className="grid gap-0.5 text-[11px]">
          {historial.slice(0, 8).map((p, i) => (
            <li key={i} className={i === 0 ? "font-semibold" : "text-[#5C6B76]"}>
              {fechaCorta(p.fecha)} · {p.estado}{p.motivo ? ` (${p.motivo})` : ""}{p.sucursal ? ` · ${p.sucursal}` : ""}
            </li>
          ))}
        </ul>
      ) : <p className="text-[11px] text-[#5C6B76]">OCA todavía no informó movimientos. El seguimiento se actualiza solo cada media hora.</p>}
    </div>
  );
}
