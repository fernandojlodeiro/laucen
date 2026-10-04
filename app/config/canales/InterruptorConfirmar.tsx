"use client";

// Un interruptor de la tabla de canales (Fer, 4/10: "Stock a ML" y
// "Facturas a ML" ahí mismo, también al editar la fila). Como un clic en una
// tabla se escapa fácil, pregunta ahí mismo "Sí / No" antes de mandar.

import { useState } from "react";
import { BORRAR, SUAVE, VERDE } from "@/app/botones";

export default function InterruptorConfirmar({ accion, prendido, campos, etiqueta, preguntaPrender, preguntaApagar }: {
  accion: (fd: FormData) => Promise<void>;
  prendido: boolean;
  campos: Record<string, string>;
  etiqueta: string;
  preguntaPrender: string;
  preguntaApagar: string;
}) {
  const [preguntando, setPreguntando] = useState(false);
  const llave = (
    <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${prendido ? "bg-[#167655]" : "bg-[#C9D3DD]"}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${prendido ? "translate-x-4" : "translate-x-0.5"}`} />
    </span>
  );
  if (!preguntando) {
    return (
      <button type="button" role="switch" aria-checked={prendido} aria-label={etiqueta} title={`${etiqueta}: ${prendido ? "prendido" : "apagado"}`}
        onClick={() => setPreguntando(true)} className="inline-flex items-center">
        {llave}
      </button>
    );
  }
  return (
    <form action={accion} className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="valor" value={prendido ? "0" : "1"} />
      <span>{prendido ? preguntaApagar : preguntaPrender}</span>
      <button className={prendido ? BORRAR : VERDE}>Sí</button>
      <button type="button" onClick={() => setPreguntando(false)} className={SUAVE}>No</button>
    </form>
  );
}
