"use client";

// Sugerencia de compra: filtro por vía con casillas (Fer, 28/10: elegir más de una, por ejemplo «Avión» y «No rentable
// por avión» para revisar). Lo tildado va en la dirección (?via=avion,no_rentable); nada tildado = todas.

import { useState } from "react";
import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";

export default function Vias({ opciones, elegidas }: { opciones: { clave: string; texto: string; ayuda: string; n: number }[]; elegidas: string[] }) {
  const cambiar = usarCambiarParametro();
  const [abierto, setAbierto] = useState(false);
  const si = new Set(elegidas);
  const guardar = (ks: Set<string>) => cambiar({ via: ks.size && ks.size < opciones.length ? opciones.map((o) => o.clave).filter((k) => ks.has(k)).join(",") : null, p: null });
  const alternar = (k: string, tildada: boolean) => {
    const ks = new Set(si.size ? si : opciones.map((o) => o.clave));
    if (tildada) ks.add(k); else ks.delete(k);
    guardar(ks);
  };
  const todas = !si.size;
  return (
    <span className="relative inline-block text-xs">
      <button type="button" onClick={() => setAbierto(!abierto)} className="rounded-md border border-[#C9D3DD] bg-white px-2 py-1.5">
        Vía {todas ? "(todas)" : `(${si.size} de ${opciones.length})`} ▾
      </button>
      {abierto && (
        <span className="absolute right-0 z-30 mt-1 block w-[22rem] rounded-lg border border-[#E3E9F0] bg-white p-2 shadow-lg text-left">
          <span className="flex flex-wrap gap-2 mb-1.5">
            <button type="button" onClick={() => guardar(new Set())} className="rounded border border-[#E3E9F0] px-2 py-0.5">Todas</button>
            <button type="button" onClick={() => guardar(new Set(["avion", "barco"]))} className="rounded border border-[#E3E9F0] px-2 py-0.5">Rentables por avión</button>
            <button type="button" onClick={() => setAbierto(false)} className="ml-auto rounded border border-[#E3E9F0] px-2 py-0.5">Cerrar</button>
          </span>
          {opciones.map((o) => (
            <label key={o.clave} className="flex items-start gap-1.5 py-0.5" title={o.ayuda}>
              <input type="checkbox" checked={todas || si.has(o.clave)} onChange={(e) => alternar(o.clave, e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[#16577F]" />
              <span><b>{o.texto}</b> <span className="text-[#5C6B76]">({o.n})</span><span className="block text-[11px] text-[#5C6B76]">{o.ayuda}</span></span>
            </label>
          ))}
        </span>
      )}
    </span>
  );
}
