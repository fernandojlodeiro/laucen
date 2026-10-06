"use client";

// Buscador al tipear (pedido de Fer): filtra desde la segunda letra, sin botón
// Buscar; la X adentro del cuadro borra todo. "Comienza por" (tildada salvo
// ?contiene=1) busca al principio del texto. Todo ABM lleva su buscador
// (AGENTS.md): éste es el de siempre.

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AYUDA_BUSQUEDA } from "@/lib/busqueda";

/** Cambia un parámetro de la dirección sin recargar la página entera. Todo
 *  cambio de búsqueda o filtro vuelve a la primera página (saca ?p= si es un
 *  número de página; en Contabilidad ?p= es la pestaña y queda). */
export function usarCambiarParametro() {
  const router = useRouter();
  return (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(window.location.search);
    if (!("p" in cambios) && /^\d+$/.test(p.get("p") ?? "")) p.delete("p");
    for (const [k, v] of Object.entries(cambios)) if (v) p.set(k, v); else p.delete(k);
    const s = p.toString();
    router.replace(s ? `${window.location.pathname}?${s}` : window.location.pathname, { scroll: false });
  };
}

/** Búsqueda al tipear (desde 2 letras), con una X para borrar, y las cajas
 *  "Comienza por" y "Mostrar inactivos" (ésta sólo si se pasa `inactivos`).
 *  Al buscar se sacan de la dirección los parámetros de `limpiar` (ej. la fila abierta).
 *  Con dos buscadores en la misma pantalla, el segundo usa otro `parametro`
 *  (y su "Comienza por" va en `${parametro}contiene`). */
export default function BuscadorVivo({ q, comienza, inactivos, placeholder, autoFocus = false, limpiar = [], parametro = "q", sinComienza = false }: {
  q: string; comienza: boolean; inactivos?: boolean; placeholder: string; autoFocus?: boolean; limpiar?: string[]; parametro?: string;
  /** Sin la caja "Comienza por" (buscadores que siempre buscan en cualquier parte, ej. número o cliente). */
  sinComienza?: boolean;
}) {
  const contiene = parametro === "q" ? "contiene" : `${parametro}contiene`;
  const cambiar = usarCambiarParametro();
  const [texto, setTexto] = useState(q);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = (t: string) => {
    setTexto(t);
    if (espera.current) clearTimeout(espera.current);
    const limpio = t.trim();
    if (limpio.length === 1) return; // con una sola letra no busca todavía
    espera.current = setTimeout(() => cambiar({ [parametro]: limpio || null, ...Object.fromEntries(limpiar.map((k) => [k, null])) }), 300);
  };

  return (
    <>
      <span className="relative inline-flex">
        <input value={texto} onChange={(e) => buscar(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder={placeholder} autoFocus={autoFocus} title={AYUDA_BUSQUEDA}
          className="border border-[#E3E9F0] rounded-lg pl-2 pr-7 py-1.5 text-xs bg-white w-72" />
        {texto && (
          <button type="button" onClick={() => buscar("")} aria-label="Borrar la búsqueda"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>
        )}
      </span>
      {/* El globito con cómo se busca (lib/busqueda.ts), igual en todo el panel. */}
      <span title={AYUDA_BUSQUEDA} aria-label={AYUDA_BUSQUEDA} tabIndex={0}
        className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-[#9AA7B3] text-[10px] font-bold text-[#5C6B76] cursor-help shrink-0 self-center">?</span>
      {!sinComienza && <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] py-1.5 whitespace-nowrap">
        <input type="checkbox" defaultChecked={comienza} onChange={(e) => cambiar({ [contiene]: e.target.checked ? null : "1" })}
          className="h-4 w-4 accent-[#16577F]" />
        Comienza por
      </label>}
      {inactivos !== undefined && <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] py-1.5 whitespace-nowrap">
        <input type="checkbox" defaultChecked={inactivos} onChange={(e) => cambiar({ inactivos: e.target.checked ? "1" : null })}
          className="h-4 w-4 accent-[#16577F]" />
        Mostrar inactivos
      </label>}
    </>
  );
}

/** Desplegable de filtro que cambia la dirección al elegir (va al lado del
 *  buscador, sin botón Buscar). Las <option> van de hijos. */
export function FiltroVivo({ parametro, valor, etiqueta, children, limpiar = [] }: {
  parametro: string; valor: string; etiqueta: string; children: ReactNode; limpiar?: string[];
}) {
  const cambiar = usarCambiarParametro();
  return (
    <select defaultValue={valor} aria-label={etiqueta} onChange={(e) => cambiar({ [parametro]: e.target.value || null, ...Object.fromEntries(limpiar.map((k) => [k, null])) })}
      className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white">
      {children}
    </select>
  );
}

/** Caja para tildar de filtro (pone `parametro=1` o lo saca). */
export function CasillaViva({ parametro, activo, etiqueta }: { parametro: string; activo: boolean; etiqueta: string }) {
  const cambiar = usarCambiarParametro();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] py-1.5 whitespace-nowrap">
      <input type="checkbox" defaultChecked={activo} onChange={(e) => cambiar({ [parametro]: e.target.checked ? "1" : null })}
        className="h-4 w-4 accent-[#16577F]" />
      {etiqueta}
    </label>
  );
}
