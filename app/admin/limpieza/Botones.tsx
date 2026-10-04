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

type Avance = { procesados: number; asignados: number; sinResultado: number; pendientes: number; porPublicacion: number; reubicados: number;
  estados: Record<string, number>; error?: string; hecho?: boolean };

/** Detecta categorías de ML en lotes: sigue solo hasta terminar y muestra el avance.
 *  Si un lote falla (ML no contesta, se corta la conexión) lo reintenta y, si sigue
 *  fallando, se frena y lo dice: nunca queda colgado. */
export function DetectarCategorias({ pendientes }: { pendientes: number }) {
  const [corriendo, setCorriendo] = useState(false);
  const [av, setAv] = useState<Avance | null>(null);

  async function correr() {
    setCorriendo(true);
    let desde = 0, asignados = 0, sin = 0, procesados = 0, porPub = 0, reub = 0, fallos = 0;
    const estados: Record<string, number> = {};
    for (;;) {
      let r;
      try { r = await accionCategorias(desde); } catch { r = { ok: false as const, error: "se cortó la conexión con el servidor" }; }
      if (!r.ok) {
        fallos++;
        setAv((a) => ({ procesados, asignados, sinResultado: sin, pendientes: a?.pendientes ?? -1, porPublicacion: porPub, reubicados: reub, estados, error: `${r.error} (intento ${fallos} de 3)` }));
        if (fallos >= 3) break;
        continue;
      }
      fallos = 0;
      if (r.procesados === 0 && !r.hecho) break; // no avanzó: mejor frenar que dar vueltas
      desde = r.siguiente; asignados += r.asignados; sin += r.sinResultado; procesados += r.procesados;
      porPub += r.porPublicacion; reub += r.reubicados;
      for (const [k, v] of Object.entries(r.estados)) estados[k] = (estados[k] ?? 0) + v;
      setAv({ procesados, asignados, sinResultado: sin, pendientes: r.pendientes, porPublicacion: porPub, reubicados: reub, estados, hecho: r.hecho });
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
          {av.error ? <span className="text-[#C03420]">Se frenó: {av.error}. Podés apretar de nuevo y sigue donde quedó. </span> : null}
          Por su publicación de ML: {av.porPublicacion}. Reubicados en familias de ML: {av.reubicados}. Por el predictor: {av.asignados} de {av.procesados}
          {av.sinResultado ? ` (${av.sinResultado} sin resultado)` : ""}. {av.pendientes >= 0 ? `Quedan sin categoría: ${av.pendientes}.` : ""} {av.hecho ? "Terminó." : ""}
          {Object.keys(av.estados).length ? ` Respuestas de Mercado Libre: ${Object.entries(av.estados).map(([k, v]) => `${k}: ${v}`).join(", ")}.` : ""}
        </p>
      )}
    </div>
  );
}
