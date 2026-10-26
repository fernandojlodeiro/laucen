"use client";

// Banners de la portada: pasan solos cada 6 segundos; flechas en la compu y
// puntitos abajo. Con una sola imagen, queda fija. Cada uno puede traer su
// imagen para el celular y un link (de afuera: en otra pestaña). El pie se
// funde con el fondo de la página: la primera fila de productos sube encima.
// Nunca se recorta (Fer, 26/10: en la compu se cortaba arriba y abajo): el alto sale de la proporción de la
// imagen, con un tope en la compu; si la imagen es más angosta que la pantalla, los costados se rellenan con
// la misma imagen desenfocada. Lo de abajo de todo (el último cuarto) queda bajo el difuminado y la primera
// fila: ahí la imagen no tiene que llevar texto.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DIFUMINADO } from "./difuminado";

export type Banner = { src: string; celular?: string | null; alt: string; href?: string | null };

/** El alto máximo en la compu: más que esto empuja los productos fuera de la pantalla. */
const ALTO_MAXIMO = 420;

export default function Banners({ banners }: { banners: Banner[] }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  // Ancho / alto de la primera imagen (la que eligió el navegador: la de la compu o la del celular).
  const [proporcion, setProporcion] = useState(3);
  const primera = useRef<HTMLImageElement>(null);
  const medir = (img: HTMLImageElement | null) => { if (img?.naturalWidth && img.naturalHeight) setProporcion(img.naturalWidth / img.naturalHeight); };
  useEffect(() => { if (primera.current?.complete) medir(primera.current); }, []);
  const n = banners.length;
  useEffect(() => {
    if (n < 2 || pausa) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(id);
  }, [n, pausa]);
  if (!n) return null;
  const flecha = "absolute top-1/2 z-10 hidden h-16 w-10 -translate-y-1/2 place-items-center bg-white/90 text-[var(--boton)] opacity-0 shadow transition group-hover:opacity-100 md:grid";

  return (
    // En su proporción, entero: a todo el ancho, y en una pantalla muy ancha, hasta ALTO_MAXIMO de alto.
    <div className="group relative w-full overflow-hidden" style={{ height: `min(${ALTO_MAXIMO}px, calc(100vw / ${proporcion.toFixed(4)}))` }}
      onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}
      role="region" aria-roledescription="carrusel" aria-label="Novedades de la tienda">
      {banners.map((b, k) => {
        const fuente = b.celular ? <source media="(max-width: 767px)" srcSet={b.celular} /> : null;
        const img = (
          <span className="relative block h-full w-full">
            {/* Los costados, si sobran: la misma imagen, agrandada y desenfocada. */}
            <picture aria-hidden>
              {fuente}
              <img src={b.src} alt="" loading={k === 0 ? "eager" : "lazy"} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />
            </picture>
            <picture>
              {fuente}
              <img ref={k === 0 ? primera : undefined} onLoad={k === 0 ? (e) => medir(e.currentTarget) : undefined}
                src={b.src} alt={b.alt} loading={k === 0 ? "eager" : "lazy"} className="relative h-full w-full object-contain" />
            </picture>
          </span>
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[30%]" style={{ background: DIFUMINADO }} />
      {n > 1 && (
        <>
          <button type="button" aria-label="Anterior" onClick={() => setI((i - 1 + n) % n)} className={`${flecha} left-0 rounded-r-full`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <button type="button" aria-label="Siguiente" onClick={() => setI((i + 1) % n)} className={`${flecha} right-0 rounded-l-full`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m9 6 6 6-6 6" /></svg>
          </button>
          <div className="absolute bottom-[32%] left-1/2 z-10 flex -translate-x-1/2 gap-2">
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
