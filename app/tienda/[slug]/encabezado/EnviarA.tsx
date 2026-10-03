"use client";

// "Enviar a …" del encabezado: muestra la localidad y el código postal (de la
// dirección del comprador con cuenta, o el que cargó acá) y abre una cajita
// para cargar el código postal. Se guarda en una cookie de la tienda.

import { useEffect, useRef, useState } from "react";
import { guardarCodigoPostal } from "../acciones";

export default function EnviarA({ slug, linea1, linea2, cp }: { slug: string; linea1: string; linea2: string; cp: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);

  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto}
        className="flex items-center gap-1 text-left text-[var(--marca-texto)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
        </svg>
        <span className="leading-tight">
          <span className="block text-xs opacity-60">{linea1}</span>
          <span className="block max-w-[150px] truncate text-sm">{linea2}</span>
        </span>
      </button>
      {abierto && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[300px] rounded-md bg-white p-5 text-[var(--texto)] shadow-[0_6px_16px_rgba(0,0,0,.25)]">
          <p className="mb-1 text-base font-semibold">Elegí dónde recibir tus compras</p>
          <p className="mb-3 text-sm text-[var(--texto-2)]">Así sabemos cómo te llega y cuánto cuesta el envío.</p>
          <form action={async (fd) => { await guardarCodigoPostal(fd); setAbierto(false); }} className="space-y-3">
            <input type="hidden" name="slug" value={slug} />
            <label htmlFor="cp-encabezado" className="block text-sm">Código postal</label>
            <input id="cp-encabezado" name="cp" defaultValue={cp} required maxLength={8} inputMode="text" autoComplete="postal-code" placeholder="Ej. 5000"
              className="h-11 w-full rounded-md border border-[rgba(0,0,0,.25)] px-3 text-base outline-none focus:border-[var(--boton)] focus:ring-1 focus:ring-[var(--boton)]" />
            <button type="submit" className="h-11 w-full rounded-md bg-[var(--boton)] font-semibold text-white hover:bg-[var(--boton-hover)]">Usar</button>
          </form>
        </div>
      )}
    </div>
  );
}
