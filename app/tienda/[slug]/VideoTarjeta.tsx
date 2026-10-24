"use client";

// El video de un producto en su tarjeta (listados, portada), como en Mercado Libre: en el celular
// arranca solo y sin sonido cuando la tarjeta queda bien a la vista y se frena cuando sale; en la
// compu, al pasar el mouse. Hasta entonces se ve la foto (y el video no se baja). Con ahorro de datos
// o «menos movimiento» pedido en el teléfono, sólo la foto.

import { useEffect, useRef, useState } from "react";

export default function VideoTarjeta({ video, foto, alt, apagado }: { video: string; foto: string | null; alt: string; apagado?: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [activo, setActivo] = useState(false);
  const [puede, setPuede] = useState(false);
  // El video se monta (y se baja) recién la primera vez que hace falta, y queda.
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conexion?.saveData || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPuede(true);
    if (window.matchMedia("(min-width: 1024px)").matches) return; // en la compu, con el mouse
    const el = caja.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setActivo(e.isIntersecting && e.intersectionRatio >= 0.6), { threshold: [0, 0.6, 1] });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => { if (activo) setCargado(true); }, [activo]);
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (activo) v.play().catch(() => setActivo(false));
    else v.pause();
  }, [activo, cargado]);

  return (
    <div ref={caja} className="relative h-full w-full" onMouseEnter={() => puede && setActivo(true)} onMouseLeave={() => setActivo(false)}>
      {foto ? <img src={foto} alt={alt} loading="lazy" decoding="async" className={`h-full w-full object-contain p-3 ${apagado ? "opacity-50" : ""}`} /> : <div className="h-full w-full" />}
      {puede && cargado && (
        <video ref={vid} src={video} muted loop playsInline preload="metadata" aria-hidden
          className={`absolute inset-0 h-full w-full bg-white object-contain transition-opacity duration-300 ${activo ? "opacity-100" : "opacity-0"}`} />
      )}
      {!activo && <span className="absolute bottom-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-[10px] text-white" aria-hidden>▶</span>}
    </div>
  );
}
