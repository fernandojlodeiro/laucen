"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { BORRAR, SUAVE } from "@/app/botones";

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
