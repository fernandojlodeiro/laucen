"use client";

import { useState } from "react";
import Link from "next/link";
import { SUAVE } from "@/app/botones";
import { accionPrepararNotebooks } from "./actions";

type Cuenta = { id: number; nombre: string };
type Resultado = { loteId: number | null; preparadas: number; revisadas: number; quedan: number; porEstado: Record<string, number>; activas: number };

/** Una fila por cuenta: lee ML y deja preparado el lote que elimina las notebooks no activas. */
export function NotebooksMl({ cuentas }: { cuentas: Cuenta[] }) {
  return <div className="space-y-3">{cuentas.map((c) => <Fila key={c.id} cuenta={c} />)}</div>;
}

function Fila({ cuenta }: { cuenta: Cuenta }) {
  const [trabajando, setTrabajando] = useState(false);
  const [r, setR] = useState<Resultado | null>(null);
  const [error, setError] = useState("");

  async function preparar() {
    setTrabajando(true); setError(""); setR(null);
    try {
      const x = await accionPrepararNotebooks(cuenta.id);
      if (!x.ok) setError(x.error); else setR(x);
    } catch { setError("Se cortó la conexión con el servidor. Probá de nuevo (lo ya preparado no se pierde)."); }
    setTrabajando(false);
  }

  const n = (x: number) => x.toLocaleString("es-AR");
  return (
    <div className="border border-[#E3E9F0] rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold text-[#16577F]">{cuenta.nombre}</span>
        <button type="button" disabled={trabajando} onClick={preparar} className={`${SUAVE} disabled:opacity-60`}>
          {trabajando ? "Leyendo Mercado Libre… (puede tardar unos minutos, no cierres la pantalla)" : "Preparar eliminación de notebooks no activas"}
        </button>
      </div>
      {error && <p className="text-xs text-[#C03420]">{error}</p>}
      {r && (
        <p className="text-xs text-[#5C6B76]">
          Se revisaron {n(r.revisadas)} publicaciones. {r.activas ? `Notebooks activas (no se tocan): ${n(r.activas)}. ` : ""}
          {r.preparadas
            ? <><b>{n(r.preparadas)} notebooks no activas preparadas para eliminar</b> ({Object.entries(r.porEstado).map(([k, v]) => `${n(v)} ${k}`).join(", ")}).{" "}
              {r.loteId && <Link href={`/config/canales/cola?ver=lotes&lote=${r.loteId}`} className="text-[#16577F] underline font-semibold">Revisar el lote y mandarlo →</Link>}</>
            : "No hay notebooks no activas para eliminar."}
          {r.quedan > 0 && <span className="text-[#8a6100]"> No alcanzó el tiempo: quedan {n(r.quedan)} por revisar, apretá de nuevo para seguir.</span>}
        </p>
      )}
    </div>
  );
}
