"use client";

import { useState } from "react";
import { BORRAR, SUAVE } from "@/app/botones";
import { accionBorrarFantasmas, accionRevisarFantasmas } from "./actions";

type Cuenta = { id: number; nombre: string; enLaucen: number };
type Revision = { enLaucen: number; enMl: number; faltan: number; ejemplos: { item_id: string; titulo: string | null; sku: string | null; estado: string | null }[];
  confiable: boolean; motivo?: string };

/** Una fila por cuenta de ML: "Revisar" compara con Mercado Libre (sólo lectura);
 *  si faltan publicaciones, "Borrar de Laucen" pregunta ahí mismo ¿Seguro? Sí / No. */
export function Fantasmas({ cuentas }: { cuentas: Cuenta[] }) {
  return (
    <div className="space-y-3">
      {cuentas.map((c) => <FilaCuenta key={c.id} cuenta={c} />)}
    </div>
  );
}

function FilaCuenta({ cuenta }: { cuenta: Cuenta }) {
  const [trabajando, setTrabajando] = useState<"" | "revisando" | "borrando">("");
  const [rev, setRev] = useState<Revision | null>(null);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");
  const [pidiendo, setPidiendo] = useState(false);

  async function revisar() {
    setTrabajando("revisando"); setError(""); setHecho(""); setRev(null); setPidiendo(false);
    try {
      const r = await accionRevisarFantasmas(cuenta.id);
      if (!r.ok) setError(r.error); else setRev(r);
    } catch { setError("Se cortó la conexión con el servidor. Probá de nuevo."); }
    setTrabajando("");
  }

  async function borrar() {
    setTrabajando("borrando"); setError(""); setPidiendo(false);
    try {
      const r = await accionBorrarFantasmas(cuenta.id);
      if (!r.ok) setError(r.error);
      else { setHecho(`Borradas de Laucen: ${r.filas.toLocaleString("es-AR")} filas y ${r.publicaciones.toLocaleString("es-AR")} vínculos con productos.`); setRev(null); }
    } catch { setError("Se cortó la conexión con el servidor. Probá de nuevo."); }
    setTrabajando("");
  }

  return (
    <div className="border border-[#E3E9F0] rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold text-[#16577F]">{cuenta.nombre}</span>
        <button type="button" disabled={trabajando !== ""} onClick={revisar} className={`${SUAVE} disabled:opacity-60`}>
          {trabajando === "revisando" ? "Leyendo Mercado Libre… (no cierres la pantalla)" : "Revisar contra Mercado Libre"}
        </button>
      </div>
      {error && <p className="text-xs text-[#C03420]">{error}</p>}
      {hecho && <p className="text-xs text-[#167655]">{hecho}</p>}
      {rev && (
        <div className="space-y-2">
          <p className="text-xs text-[#5C6B76]">
            Laucen tiene {rev.enLaucen.toLocaleString("es-AR")} publicaciones y Mercado Libre {rev.enMl.toLocaleString("es-AR")}.{" "}
            {rev.confiable
              ? rev.faltan ? <b>{rev.faltan.toLocaleString("es-AR")} están en Laucen y ya no existen en Mercado Libre.</b> : "Coinciden: no hay nada para borrar."
              : <span className="text-[#C03420]">{rev.motivo}</span>}
          </p>
          {rev.confiable && rev.ejemplos.length > 0 && (
            <ul className="text-xs text-[#5C6B76] list-disc pl-5">
              {rev.ejemplos.map((e) => <li key={e.item_id}>{e.item_id}{e.sku ? ` · ${e.sku}` : ""} — {e.titulo ?? "sin título"}{e.estado ? ` (${e.estado})` : ""}</li>)}
              {rev.faltan > rev.ejemplos.length && <li>…y {(rev.faltan - rev.ejemplos.length).toLocaleString("es-AR")} más</li>}
            </ul>
          )}
          {rev.confiable && rev.faltan > 0 && (
            trabajando === "borrando" ? <span className="text-xs text-[#5C6B76]">Borrando…</span>
            : !pidiendo ? <button type="button" onClick={() => setPidiendo(true)} className={BORRAR}>Borrar de Laucen las que ya no existen</button>
            : (
              <span className="inline-flex items-center gap-2 text-xs text-[#C03420] font-semibold">
                ¿Seguro?
                <button type="button" onClick={borrar} className={BORRAR}>Sí</button>
                <button type="button" onClick={() => setPidiendo(false)} className={SUAVE}>No</button>
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}
