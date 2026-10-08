"use client";

// Eliminar una publicación en Mercado Libre (Fer, 8/10): la X de la fila.
// Pregunta ahí mismo «¿Eliminar en ML?» Sí / No y, si en Laucen hay stock
// para venderla, una segunda vez avisando cuánto. Una activa no se puede
// eliminar (la pantalla no muestra la X; la acción también lo controla).

import { useState } from "react";
import { BotonEnviar } from "@/app/radar/Cliente";
import { BORRAR, SUAVE } from "@/app/botones";

const CHICO = "text-[11px] font-bold rounded-md px-1.5 py-0.5";

export default function BotonEliminar({ accion, campos, disponible }: {
  accion: (fd: FormData) => Promise<void>; campos: Record<string, string>; disponible: number;
}) {
  const [paso, setPaso] = useState<0 | 1 | 2>(0);
  if (paso === 0) {
    return <button type="button" onClick={() => setPaso(1)} title="Eliminar en Mercado Libre" aria-label="Eliminar en Mercado Libre"
      className={`${CHICO} bg-white border border-[#EFD3CE] text-[#C03420] leading-none`}>✕</button>;
  }
  const no = <button type="button" onClick={() => setPaso(0)} className={`${SUAVE} !px-2 !py-1`}>No</button>;
  if (paso === 1 && disponible > 0) {
    return <span className="inline-flex items-center gap-1 text-xs">¿Eliminar en ML? <button type="button" onClick={() => setPaso(2)} className={`${BORRAR} !px-2 !py-1`}>Sí</button>{no}</span>;
  }
  return (
    <form action={accion} className="inline-flex items-center gap-1 text-xs">
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <span className={paso === 2 ? "text-[#C03420] font-semibold whitespace-normal max-w-56 text-left" : ""}>
        {paso === 2 ? `Ojo: tenés ${disponible} para vender en esta cuenta. ¿Seguro que la eliminás?` : "¿Eliminar en ML?"}
      </span>
      <BotonEnviar clase={`${BORRAR} !px-2 !py-1`} corriendo="Eliminando…">Sí</BotonEnviar>
      {no}
    </form>
  );
}
