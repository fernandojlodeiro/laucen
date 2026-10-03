"use client";

// Carrusel horizontal de tarjetas: se desliza de costado (con el dedo o la
// rueda) y en la compu tiene flechas a los costados, como los de la portada.

import { useRef, useState, useEffect, Children } from "react";

export default function Carrusel({ children, etiqueta, ancho = "w-[46%] sm:w-[31%] md:w-[23.5%] lg:w-[18.8%]" }: {
  children: React.ReactNode; etiqueta: string; ancho?: string;
}) {
  const tira = useRef<HTMLDivElement>(null);
  const [puede, setPuede] = useState({ izq: false, der: false });

  const medir = () => {
    const el = tira.current;
    if (!el) return;
    setPuede({ izq: el.scrollLeft > 4, der: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  const mover = (dir: 1 | -1) => {
    const el = tira.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };
  const flecha = "absolute top-1/2 z-10 hidden h-16 w-8 -translate-y-1/2 place-items-center bg-white text-[var(--boton)] shadow-[0_1px_4px_rgba(0,0,0,.25)] md:grid";

  return (
    <div className="relative" role="region" aria-label={etiqueta}>
      {puede.izq && (
        <button type="button" onClick={() => mover(-1)} aria-label="Anteriores" className={`${flecha} -left-3 rounded-r-full`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
      )}
      <div ref={tira} onScroll={medir} className="-mx-1 flex snap-x snap-mandatory overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Children.map(children, (c) => <div className={`${ancho} shrink-0 snap-start pr-2 sm:pr-4`}>{c}</div>)}
      </div>
      {puede.der && (
        <button type="button" onClick={() => mover(1)} aria-label="Siguientes" className={`${flecha} -right-3 rounded-l-full`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m9 6 6 6-6 6" /></svg>
        </button>
      )}
    </div>
  );
}
