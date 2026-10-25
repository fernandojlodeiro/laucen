"use client";

// Galería de la ficha.
// - Compu: miniaturas en columna a la izquierda (pasar el mouse cambia la
//   foto) y la foto grande con zoom: al pasar el mouse se agranda donde apunta.
// - Celular: la foto se desliza de costado, con el contador "2 / 5".
// - El video del producto (si tiene) va después de la primera foto, como en Mercado Libre: en la
//   miniatura, un ▶ sobre la primera foto; elegido, se reproduce solo y sin sonido (con controles).

import { useEffect, useRef, useState } from "react";

type Item = { tipo: "foto" | "video"; src: string };

export default function Galeria({ fotos, titulo, video }: { fotos: string[]; titulo: string; video?: string | null }) {
  const items: Item[] = fotos.map((src) => ({ tipo: "foto" as const, src }));
  if (video) items.splice(Math.min(1, items.length), 0, { tipo: "video", src: video });
  const [actual, setActual] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const tira = useRef<HTMLDivElement>(null);
  const clave = items.map((x) => x.src).join("|");

  // Otra variación, otras fotos: volver a la primera.
  useEffect(() => { setActual(0); tira.current?.scrollTo({ left: 0 }); }, [clave]);

  if (!items.length) {
    return <div className="grid aspect-square w-full place-items-center rounded bg-black/[.03] text-sm text-black/30">Sin foto</div>;
  }

  const mover = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  const elegido = items[Math.min(actual, items.length - 1)];
  const play = (
    <span className="absolute inset-0 grid place-items-center">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-black/60 text-[10px] text-white">▶</span>
    </span>
  );

  return (
    <div>
      {/* Compu */}
      <div className="hidden gap-3 md:flex">
        {items.length > 1 && (
          <div className="flex max-h-[480px] w-[52px] shrink-0 flex-col gap-2 overflow-y-auto [scrollbar-width:none]">
            {items.map((f, i) => (
              <button key={f.src + i} type="button" onMouseEnter={() => setActual(i)} onFocus={() => setActual(i)} onClick={() => setActual(i)}
                aria-label={f.tipo === "video" ? "Ver el video" : `Ver foto ${i + 1}`} aria-current={i === actual ? "true" : undefined}
                className={`relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-md border bg-white p-0.5 ${i === actual ? "border-2 border-[var(--boton)]" : "border-black/25 hover:border-[var(--boton)]"}`}>
                {f.tipo === "video"
                  ? <>{fotos[0] ? <img src={fotos[0]} alt="" className="h-full w-full object-contain opacity-60" loading="lazy" /> : <span className="block h-full w-full bg-black/80" />}{play}</>
                  : <img src={f.src} alt="" className="h-full w-full object-contain" loading="lazy" />}
              </button>
            ))}
          </div>
        )}
        {elegido.tipo === "video" ? (
          <div className="flex-1">
            <video key={elegido.src} src={elegido.src} controls autoPlay muted loop playsInline className="mx-auto aspect-square max-h-[480px] w-full bg-black object-contain" />
          </div>
        ) : (
          <div className="relative flex-1 cursor-zoom-in overflow-hidden" onMouseMove={mover} onMouseLeave={() => setZoom(null)}>
            <img src={elegido.src} alt={`${titulo}: foto ${actual + 1}`} loading="eager"
              style={zoom ? { transform: "scale(2.2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              className="mx-auto aspect-square max-h-[480px] w-full object-contain transition-transform duration-75" />
          </div>
        )}
      </div>

      {/* Celular */}
      <div className="relative md:hidden">
        <div ref={tira} onScroll={(e) => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (i !== actual) setActual(i); }}
          className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((f, i) => f.tipo === "video" ? (
            <video key={f.src + i} src={f.src} controls muted loop playsInline preload="metadata" poster={fotos[0]} className="h-full w-full shrink-0 snap-center bg-black object-contain" />
          ) : (
            <img key={f.src + i} src={f.src} alt={`${titulo}: foto ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full shrink-0 snap-center object-contain" />
          ))}
        </div>
        {items.length > 1 && (
          <span className="absolute left-3 top-3 rounded-full bg-black/[.07] px-2.5 py-0.5 text-xs text-[var(--texto)]">{actual + 1} / {items.length}</span>
        )}
      </div>
    </div>
  );
}
