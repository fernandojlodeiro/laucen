"use client";

// «Corregir a la IA» (lib/correccion-ia.ts): debajo de una respuesta que mandó la IA. Se escribe qué estuvo mal, la IA
// muestra qué va a cambiar (datos técnicos del producto y/o una regla nueva) y recién con «Grabar» queda.

import { useState } from "react";
import type { OrigenCorreccion, Propuesta } from "@/lib/correccion-ia";
import { accionGrabarCorreccion, accionProponerCorreccion } from "./acciones-corregir-ia";

const BOTON = "text-[11px] font-bold rounded-lg px-2.5 py-1 border disabled:opacity-60";
const SUAVE = `${BOTON} bg-[#EEF3F8] border-[#E3E9F0] text-[#16577F]`;
const PRIMARIO = `${BOTON} bg-[#16577F] border-[#16577F] text-white`;
const MARCO = "whitespace-pre-wrap break-words rounded-lg border border-[#E3E9F0] bg-[#FAFBFC] px-2 py-1.5 max-h-48 overflow-auto";

export default function CorregirIa({ origen, id }: { origen: OrigenCorreccion; id: string }) {
  const [paso, setPaso] = useState<"cerrado" | "escribir" | "ver" | "listo">("cerrado");
  const [texto, setTexto] = useState("");
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const proponer = async () => {
    setTrabajando(true); setError("");
    const r = await accionProponerCorreccion(origen, id, texto).catch(() => ({ error: "No se pudo pedir la corrección. Probá de nuevo." }));
    setTrabajando(false);
    if ("error" in r) return setError(r.error);
    setPropuesta(r.ok); setPaso("ver");
  };
  const grabar = async () => {
    if (!propuesta) return;
    setTrabajando(true); setError("");
    const r = await accionGrabarCorreccion(origen, propuesta.id).catch(() => ({ error: "No se pudo grabar. Probá de nuevo." }));
    setTrabajando(false);
    if ("error" in r) return setError(r.error);
    setAviso(r.ok); setPaso("listo");
  };
  const cancelar = () => { setPaso("cerrado"); setPropuesta(null); setError(""); };

  if (paso === "cerrado") {
    return <button type="button" className={SUAVE} onClick={() => setPaso("escribir")} title="Decile a la IA qué estuvo mal en esta respuesta">Corregir a la IA</button>;
  }
  if (paso === "listo") return <p className="text-[11px] text-[#167655] font-semibold">{aviso}</p>;
  return (
    <div className="mt-1 rounded-lg border border-[#E3E9F0] bg-white p-2 text-xs space-y-2 text-left text-[#1F2D3A]">
      {paso === "escribir" ? (
        <>
          <label className="block">
            <span className="block text-[11px] text-[#5C6B76] mb-0.5">¿Qué estuvo mal? (qué dijo y cuál es lo correcto)</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} autoFocus
              placeholder="ej. No tiene Zigbee: sólo Wi-Fi y Bluetooth. / Nunca ofrezcas envío en el día."
              className="w-full border border-[#E3E9F0] rounded-lg px-2 py-1.5 bg-white" />
          </label>
          <div className="flex gap-2">
            <button type="button" className={PRIMARIO} onClick={proponer} disabled={trabajando || !texto.trim()}>{trabajando ? "Pensando…" : "Ver la propuesta antes de grabar"}</button>
            <button type="button" className={SUAVE} onClick={cancelar} disabled={trabajando}>Cancelar</button>
          </div>
        </>
      ) : propuesta && (
        <>
          {propuesta.resumen && <p className="font-semibold">{propuesta.resumen}</p>}
          {propuesta.producto && (
            <div>
              <span className="block text-[11px] text-[#5C6B76]">Datos técnicos de «{propuesta.producto.titulo}», quedan así:</span>
              <div className={MARCO}>{propuesta.producto.despues}</div>
            </div>
          )}
          {propuesta.regla && (
            <div>
              <span className="block text-[11px] text-[#5C6B76]">Regla nueva para la IA (vale para todas las respuestas):</span>
              <div className={MARCO}>{propuesta.regla}</div>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className={PRIMARIO} onClick={grabar} disabled={trabajando}>{trabajando ? "Grabando…" : "Grabar"}</button>
            <button type="button" className={SUAVE} onClick={() => setPaso("escribir")} disabled={trabajando}>Cambiar lo que escribí</button>
            <button type="button" className={SUAVE} onClick={cancelar} disabled={trabajando}>Cancelar</button>
          </div>
        </>
      )}
      {error && <p className="text-[11px] text-[#C03420]">{error}</p>}
    </div>
  );
}
