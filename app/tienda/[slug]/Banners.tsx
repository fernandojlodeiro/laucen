"use client";

// Banners de la portada: pasan solos cada 6 segundos; flechas en la compu y
// puntitos abajo. Con una sola imagen, queda fija.

import { useEffect, useState } from "react";
import Link from "next/link";

export type Banner = { src: string; alt: string; href?: string };

export default function Banners({ banners }: { banners: Banner[] }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const n = banners.length;
  useEffect(() => {
    if (n < 2 || pausa) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(id);
  }, [n, pausa]);
  if (!n) return null;
  const flecha = "absolute top-1/2 z-10 hidden h-16 w-10 -translate-y-1/2 place-items-center bg-white/90 text-[var(--boton)] opacity-0 shadow transition group-hover:opacity-100 md:grid";

  return (
    <div className="group relative h-[150px] w-full overflow-hidden sm:h-[260px] lg:h-[340px]" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}
      role="region" aria-roledescription="carrusel" aria-label="Novedades de la tienda">
      {banners.map((b, k) => {
        const img = <img src={b.src} alt={b.alt} loading={k === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />;
        return (
          <div key={b.src + k} aria-hidden={k !== i} className={`absolute inset-0 transition-opacity duration-700 ${k === i ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            {b.href ? <Link href={b.href} tabIndex={k === i ? 0 : -1}>{img}</Link> : img}
          </div>
        );
      })}
      {/* Se funde con el fondo de la página, como la portada de los marketplaces. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[var(--fondo)] to-transparent" />
      {n > 1 && (
        <>
          <button type="button" aria-label="Anterior" onClick={() => setI((i - 1 + n) % n)} className={`${flecha} left-0 rounded-r-full`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <button type="button" aria-label="Siguiente" onClick={() => setI((i + 1) % n)} className={`${flecha} right-0 rounded-l-full`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m9 6 6 6-6 6" /></svg>
          </button>
          <div className="absolute bottom-[18%] left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {banners.map((_, k) => (
              <button key={k} type="button" aria-label={`Ver banner ${k + 1}`} aria-current={k === i ? "true" : undefined} onClick={() => setI(k)}
                className={`h-2 w-2 rounded-full ${k === i ? "bg-white" : "bg-white/50"} shadow`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
