"use client";

// Confirmación arriba de la tabla (Fer, 12/10): el botón de una fila no se convierte en la pregunta (desarma la fila y
// tapa los datos); la pregunta aparece en un renglón que se abre arriba de la tabla, con Sí / No, y la tabla queda igual.
// Uso: <PreguntaArriba accion={…} /> arriba de la tabla y <BotonPreguntar … /> en cada fila (se hablan por un evento).
// Con dos acciones distintas en la pantalla, cada par lleva su `grupo`.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BotonEnviar } from "@/app/radar/Cliente";
import { VERDE, SUAVE } from "@/app/botones";

type Pregunta = { pregunta: string; campos: Record<string, string>; corriendo: string; grupo?: string };
const EVENTO = "laucen:preguntar-arriba";

export function BotonPreguntar({ clase, texto, ...p }: Pregunta & { clase: string; texto: string }) {
  return (
    <button type="button" className={clase}
      onClick={() => window.dispatchEvent(new CustomEvent<Pregunta>(EVENTO, { detail: p }))}>{texto}</button>
  );
}

export default function PreguntaArriba({ accion, grupo = "" }: { accion: (fd: FormData) => Promise<void>; grupo?: string }) {
  const [p, setP] = useState<Pregunta | null>(null);
  // La acción vuelve a la pantalla con el aviso (?ok= / ?error=): ahí se cierra la pregunta.
  const sp = useSearchParams().toString();
  useEffect(() => setP(null), [sp]);
  useEffect(() => {
    // Una pregunta nueva reemplaza a la abierta; la de otro grupo cierra ésta.
    const oir = (e: Event) => { const d = (e as CustomEvent<Pregunta>).detail; setP((d.grupo ?? "") === grupo ? d : null); };
    window.addEventListener(EVENTO, oir);
    return () => window.removeEventListener(EVENTO, oir);
  }, [grupo]);
  if (!p) return null;
  return (
    <form action={accion}
      className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-[#F1D9A6] bg-[#FFF8E6] px-3 py-2 text-xs">
      {Object.entries(p.campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <span className="flex-1 min-w-[240px]">{p.pregunta}</span>
      <BotonEnviar clase={VERDE} corriendo={p.corriendo}>Sí</BotonEnviar>
      <button type="button" onClick={() => setP(null)} className={SUAVE}>No</button>
    </form>
  );
}
