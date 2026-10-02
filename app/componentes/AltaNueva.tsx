"use client";

// Convención (AGENTS.md): ningún ABM da de alta algo sin apretar antes un
// botón "Nuevo …". El formulario de alta queda escondido hasta entonces, así
// nadie lo confunde con un buscador y crea algo sin querer.

import { useState, type ReactNode } from "react";
import { PRIMARIO, SUAVE } from "@/app/botones";

export default function AltaNueva({ texto, children, className = "" }: { texto: string; children: ReactNode; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <div className={className}><button type="button" onClick={() => setAbierto(true)} className={PRIMARIO}>+ {texto}</button></div>;
  return (
    <div className={`rounded-lg border border-[#E3E9F0] bg-[#FAFBFC] p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold">{texto}</span>
        <button type="button" onClick={() => setAbierto(false)} className={SUAVE}>Cancelar</button>
      </div>
      {children}
    </div>
  );
}
