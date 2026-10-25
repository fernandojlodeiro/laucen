"use client";

// El encabezado en el celular, como en Mercado Libre: queda pegado arriba, se esconde al bajar
// por la página y vuelve ni bien se sube un poco. En la compu, se va con la página como siempre.
// Se mueve con `top` (no con transform: un transform rompería el menú lateral, que es fixed).

import { useEffect, useRef, useState } from "react";

export default function Flotante({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [oculto, setOculto] = useState(false);
  const [alto, setAlto] = useState(0);
  useEffect(() => {
    let ultimo = window.scrollY;
    const medir = () => { setAlto(ref.current?.offsetHeight ?? 0); setOculto(false); };
    const alMover = () => {
      const y = window.scrollY, h = ref.current?.offsetHeight ?? 0;
      if (Math.abs(y - ultimo) < 6) return;
      setOculto(y > ultimo && y > h && !window.matchMedia("(min-width: 1024px)").matches);
      ultimo = y;
    };
    medir();
    window.addEventListener("scroll", alMover, { passive: true });
    window.addEventListener("resize", medir);
    return () => { window.removeEventListener("scroll", alMover); window.removeEventListener("resize", medir); };
  }, []);
  return (
    <header ref={ref} style={{ top: oculto ? -alto : 0 }}
      className={`sticky z-40 transition-[top] duration-200 lg:relative ${className}`}>
      {children}
    </header>
  );
}
