// La factura en la venta de Mercado Libre: estado (subida el … / pendiente /
// con error) y el botón "Subir factura a Mercado Libre" (clic de Fer: va a
// la cola aunque el interruptor del canal esté apagado). Para la ficha del
// comprobante; la del pedido usa su propia acción.

import Link from "next/link";
import { SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { Estado } from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import { ESTADO_FACTURA_ML } from "@/lib/mercadolibre/facturas";

export type EstadoFacturaMl = { estado: string | null; subida_ts: Date | null; documento_id: string | null; error: string | null; cola_id: number | null };

/** "Subida el 03/10 14:20", "Pendiente de subir", "Con error: …". */
export function TextoFacturaMl({ x }: { x: EstadoFacturaMl }) {
  const clave = x.estado ?? "falta";
  const e = ESTADO_FACTURA_ML[clave] ?? ESTADO_FACTURA_ML.falta;
  return (
    <span className="text-xs">
      <Estado texto={x.subida_ts ? `Subida el ${fechaHora(x.subida_ts)}` : e.texto} tono={e.tono} />
      {clave === "error" && x.error && <span className="text-[#C03420]"> {x.error}</span>}
      {x.cola_id && !x.subida_ts && (
        <> · <Link href={`/config/canales/cola?ver=${clave === "error" ? "errores" : clave === "preparado" ? "lotes" : "pendientes"}`} className="text-[#16577F] hover:underline">ver en la cola</Link></>
      )}
    </span>
  );
}

/** El botón se ofrece si todavía no está subida ni en camino. */
export const puedeSubir = (x: EstadoFacturaMl) => !x.subida_ts && !["preparado", "pendiente", "enviando", "ok"].includes(x.estado ?? "");

export function BotonFacturaMl({ accion, campos }: { accion: (fd: FormData) => Promise<void>; campos: Record<string, string> }) {
  return (
    <form action={accion}>
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <BotonEnviar clase={SUAVE} corriendo="Encolando…">Subir factura a Mercado Libre</BotonEnviar>
    </form>
  );
}
