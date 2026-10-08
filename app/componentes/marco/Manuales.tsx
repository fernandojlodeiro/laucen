"use client";

// «Manuales de ayuda» en la barra de estado, abajo a la derecha (Fer, 8/10):
// despliega hacia arriba las guías del manual (los archivos manual/guia-*.md)
// y cada una se abre para leerla en /manuales/<archivo>.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type GuiaManual = { archivo: string; titulo: string; resumen: string };

export default function Manuales({ guias }: { guias: GuiaManual[] }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);
  const ruta = usePathname();
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", cerrar); document.removeEventListener("keydown", esc); };
  }, [abierto]);
  useEffect(() => { setAbierto(false); }, [ruta]);
  if (!guias.length) return null;
  return (
    <span ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto}
        className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 font-bold bg-[#FFC94D] text-[#5A3D00] border border-[#F2B227] shadow-sm hover:bg-[#FFD76E]">
        <span aria-hidden>👇</span> Manuales de ayuda <span aria-hidden>{abierto ? "▾" : "▴"}</span>
      </button>
      {abierto && (
        <div className="absolute bottom-full right-0 mb-2 w-[26rem] max-w-[calc(100vw-1rem)] max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl border border-[#E3E9F0] bg-white text-[#1E2A32] shadow-lg p-1.5">
          <p className="px-2 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#5C6B76]">Manuales de ayuda</p>
          {guias.map((g) => (
            <Link key={g.archivo} href={`/manuales/${g.archivo}`}
              className="block rounded-lg px-2 py-1.5 hover:bg-[#FFF6DD]">
              <span className="block text-xs font-bold text-[#16577F]">📘 {g.titulo}</span>
              {g.resumen && <span className="block text-[11px] text-[#5C6B76] leading-snug">{g.resumen}</span>}
            </Link>
          ))}
        </div>
      )}
    </span>
  );
}
