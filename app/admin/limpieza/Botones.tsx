"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { BORRAR, PRIMARIO, SUAVE } from "@/app/botones";
import { accionCategorias } from "./actions";

/** Botón de borrar que pregunta ahí mismo "¿Seguro? Sí / No" (convención de borrar). */
export function BotonBorrar({ texto, trabajando }: { texto: string; trabajando: string }) {
  const [pidiendo, setPidiendo] = useState(false);
  const { pending } = useFormStatus();
  if (pending) return <span className="text-xs text-[#5C6B76]">{trabajando}</span>;
  if (!pidiendo) return <button type="button" onClick={() => setPidiendo(true)} className={BORRAR}>{texto}</button>;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-[#C03420] font-semibold">
      ¿Seguro?
      <button className={BORRAR}>Sí</button>
      <button type="button" onClick={() => setPidiendo(false)} className={SUAVE}>No</button>
    </span>
  );
}

type Avance = { procesados: number; asignados: number; sinResultado: number; pendientes: number; porPublicacion: number; reubicados: number; error?: string; hecho?: boolean };

/** Detecta categorías de ML en lotes: sigue solo hasta terminar y muestra el avance. */
export function DetectarCategorias({ pendientes }: { pendientes: number }) {
  const [corriendo, setCorriendo] = useState(false);
  const [av, setAv] = useState<Avance | null>(null);

  async function correr() {
    setCorriendo(true);
    let desde = 0, asignados = 0, sin = 0, procesados = 0, porPub = 0, reub = 0;
    for (;;) {
      const r = await accionCategorias(desde);
      if (!r.ok) { setAv({ procesados, asignados, sinResultado: sin, pendientes: -1, porPublicacion: porPub, reubicados: reub, error: r.error }); break; }
      desde = r.siguiente; asignados += r.asignados; sin += r.sinResultado; procesados += r.procesados;
      porPub += r.porPublicacion; reub += r.reubicados;
      setAv({ procesados, asignados, sinResultado: sin, pendientes: r.pendientes, porPublicacion: porPub, reubicados: reub, hecho: r.hecho });
      if (r.hecho) break;
    }
    setCorriendo(false);
  }

  return (
    <div className="space-y-2">
      <button type="button" disabled={corriendo} onClick={correr} className={`${PRIMARIO} disabled:opacity-60`}>
        {corriendo ? "Detectando… (no cierres la pantalla)" : pendientes ? "Detectar categorías" : "Revisar familias"}
      </button>
      {av && (
        <p className="text-xs text-[#5C6B76]">
          {av.error ? <span className="text-[#C03420]">Se cortó: {av.error}. Podés apretar de nuevo y sigue donde quedó. </span> : null}
          Por su publicación de ML: {av.porPublicacion}. Reubicados en familias de ML: {av.reubicados}. Por el predictor: {av.asignados} de {av.procesados}
          {av.sinResultado ? ` (${av.sinResultado} sin resultado)` : ""}. {av.pendientes >= 0 ? `Quedan sin categoría: ${av.pendientes}.` : ""} {av.hecho ? "Terminó." : ""}
        </p>
      )}
    </div>
  );
}
