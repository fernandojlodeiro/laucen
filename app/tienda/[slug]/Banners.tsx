"use client";

// Banners de la portada: pasan solos cada 6 segundos; flechas en la compu y
// puntitos abajo. Con una sola imagen, queda fija. Cada uno puede traer su
// imagen para el celular y un link (de afuera: en otra pestaña). El pie se
// funde con el fondo de la página: la primera fila de productos sube encima.

import { useEffect, useState } from "react";
import Link from "next/link";

export type Banner = { src: string; celular?: string | null; alt: string; href?: string | null };

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
    // En su proporción (3 a 1, la de los archivos): en el celular entero, sin cortes ni alto de más; en
    // la compu, con alto fijo (se recorta arriba y abajo: lo importante va en la franja del medio).
    <div className="group relative aspect-[3/1] w-full overflow-hidden lg:aspect-auto lg:h-[340px]" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}
      role="region" aria-roledescription="carrusel" aria-label="Novedades de la tienda">
      {banners.map((b, k) => {
        const img = (
          <picture>
            {b.celular && <source media="(max-width: 767px)" srcSet={b.celular} />}
            <img src={b.src} alt={b.alt} loading={k === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />
          </picture>
        );
        const afuera = !!b.href && /^https?:\/\//.test(b.href);
        return (
          <div key={b.src + k} aria-hidden={k !== i} className={`absolute inset-0 transition-opacity duration-700 ${k === i ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            {!b.href ? img : afuera
              ? <a href={b.href} target="_blank" rel="noopener" tabIndex={k === i ? 0 : -1} className="block h-full">{img}</a>
              : <Link href={b.href} tabIndex={k === i ? 0 : -1} className="block h-full">{img}</Link>}
          </div>
        );
      })}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-10 bg-gradient-to-t from-[var(--fondo)] to-transparent lg:h-28" />
      {n > 1 && (
        <>
          <button type="button" aria-label="Anterior" onClick={() => setI((i - 1 + n) % n)} className={`${flecha} left-0 rounded-r-full`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <button type="button" aria-label="Siguiente" onClick={() => setI((i + 1) % n)} className={`${flecha} right-0 rounded-l-full`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m9 6 6 6-6 6" /></svg>
          </button>
          <div className="absolute bottom-9 left-1/2 z-10 flex -translate-x-1/2 gap-2 lg:bottom-[100px]">
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
