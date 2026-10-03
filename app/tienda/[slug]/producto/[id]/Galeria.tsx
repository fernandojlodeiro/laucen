"use client";

// Galería de la ficha.
// - Compu: miniaturas en columna a la izquierda (pasar el mouse cambia la
//   foto) y la foto grande con zoom: al pasar el mouse se agranda donde apunta.
// - Celular: la foto se desliza de costado, con el contador "2 / 5".

import { useEffect, useRef, useState } from "react";

export default function Galeria({ fotos, titulo }: { fotos: string[]; titulo: string }) {
  const [actual, setActual] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const tira = useRef<HTMLDivElement>(null);
  const clave = fotos.join("|");

  // Otra variación, otras fotos: volver a la primera.
  useEffect(() => { setActual(0); tira.current?.scrollTo({ left: 0 }); }, [clave]);

  if (!fotos.length) {
    return <div className="grid aspect-square w-full place-items-center rounded bg-black/[.03] text-sm text-black/30">Sin foto</div>;
  }

  const mover = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  return (
    <div>
      {/* Compu */}
      <div className="hidden gap-3 md:flex">
        {fotos.length > 1 && (
          <div className="flex max-h-[480px] w-[52px] shrink-0 flex-col gap-2 overflow-y-auto [scrollbar-width:none]">
            {fotos.map((f, i) => (
              <button key={f + i} type="button" onMouseEnter={() => setActual(i)} onFocus={() => setActual(i)} onClick={() => setActual(i)}
                aria-label={`Ver foto ${i + 1}`} aria-current={i === actual ? "true" : undefined}
                className={`h-[52px] w-[52px] shrink-0 overflow-hidden rounded-md border bg-white p-0.5 ${i === actual ? "border-2 border-[var(--boton)]" : "border-black/25 hover:border-[var(--boton)]"}`}>
                <img src={f} alt="" className="h-full w-full object-contain" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        <div className="relative flex-1 cursor-zoom-in overflow-hidden" onMouseMove={mover} onMouseLeave={() => setZoom(null)}>
          <img src={fotos[actual]} alt={`${titulo}: foto ${actual + 1}`} loading="eager"
            style={zoom ? { transform: "scale(2.2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            className="mx-auto aspect-square max-h-[480px] w-full object-contain transition-transform duration-75" />
        </div>
      </div>

      {/* Celular */}
      <div className="relative md:hidden">
        <div ref={tira} onScroll={(e) => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (i !== actual) setActual(i); }}
          className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {fotos.map((f, i) => (
            <img key={f + i} src={f} alt={`${titulo}: foto ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full shrink-0 snap-center object-contain" />
          ))}
        </div>
        {fotos.length > 1 && (
          <span className="absolute left-3 top-3 rounded-full bg-black/[.07] px-2.5 py-0.5 text-xs text-[var(--texto)]">{actual + 1} / {fotos.length}</span>
        )}
      </div>
    </div>
  );
}
