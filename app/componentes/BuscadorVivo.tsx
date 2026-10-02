"use client";

// Buscador al tipear (pedido de Fer): filtra desde la segunda letra, sin botón
// Buscar; la X adentro del cuadro borra todo. "Comienza por" (tildada salvo
// ?contiene=1) busca al principio del texto. Todo ABM lleva su buscador
// (AGENTS.md): éste es el de siempre.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Cambia un parámetro de la dirección sin recargar la página entera. */
export function usarCambiarParametro() {
  const router = useRouter();
  return (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(cambios)) if (v) p.set(k, v); else p.delete(k);
    const s = p.toString();
    router.replace(s ? `${window.location.pathname}?${s}` : window.location.pathname, { scroll: false });
  };
}

/** Búsqueda al tipear (desde 2 letras), con una X para borrar, y las cajas
 *  "Comienza por" y "Mostrar inactivos" (ésta sólo si se pasa `inactivos`).
 *  Al buscar se sacan de la dirección los parámetros de `limpiar` (ej. la fila abierta). */
export default function BuscadorVivo({ q, comienza, inactivos, placeholder, autoFocus = false, limpiar = [] }: {
  q: string; comienza: boolean; inactivos?: boolean; placeholder: string; autoFocus?: boolean; limpiar?: string[];
}) {
  const cambiar = usarCambiarParametro();
  const [texto, setTexto] = useState(q);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = (t: string) => {
    setTexto(t);
    if (espera.current) clearTimeout(espera.current);
    const limpio = t.trim();
    if (limpio.length === 1) return; // con una sola letra no busca todavía
    espera.current = setTimeout(() => cambiar({ q: limpio || null, ...Object.fromEntries(limpiar.map((k) => [k, null])) }), 300);
  };

  return (
    <>
      <span className="relative inline-flex">
        <input value={texto} onChange={(e) => buscar(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder={placeholder} autoFocus={autoFocus}
          className="border border-[#E3E9F0] rounded-lg pl-2 pr-7 py-1.5 text-xs bg-white w-72" />
        {texto && (
          <button type="button" onClick={() => buscar("")} aria-label="Borrar la búsqueda"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>
        )}
      </span>
      <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] py-1.5 whitespace-nowrap">
        <input type="checkbox" defaultChecked={comienza} onChange={(e) => cambiar({ contiene: e.target.checked ? null : "1" })}
          className="h-4 w-4 accent-[#16577F]" />
        Comienza por
      </label>
      {inactivos !== undefined && <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] py-1.5 whitespace-nowrap">
        <input type="checkbox" defaultChecked={inactivos} onChange={(e) => cambiar({ inactivos: e.target.checked ? "1" : null })}
          className="h-4 w-4 accent-[#16577F]" />
        Mostrar inactivos
      </label>}
    </>
  );
}
