"use client";

// Que una tabla ancha entre en la pantalla (Fer, 6/10: a 1920×1080 el
// tablero no entraba y no se podía correr de costado). Mide cuánto ocupa a
// tamaño normal y la achica (zoom) lo justo para que entre en el ancho
// disponible, sin pasar de `maximo`. Se vuelve a medir si cambia el ancho de
// la ventana. Deja el zoom en la variable CSS --zoom (para lo fijo con sticky).

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const usarEfecto = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function AjusteAncho({ maximo = 1, minimo = 0.6, className = "", children }: {
  maximo?: number; minimo?: number; className?: string; children: React.ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);

  const ajustar = useCallback(() => {
    const el = caja.current, padre = el?.parentElement;
    if (!el || !padre) return;
    // A tamaño normal y sin tope, cuánto mide; después, el zoom que hace falta.
    el.style.setProperty("zoom", "1");
    el.style.maxWidth = "none";
    const natural = el.scrollWidth;
    el.style.maxWidth = "";
    const disponible = padre.clientWidth;
    const z = natural > 0 ? Math.max(minimo, Math.min(maximo, disponible / natural)) : maximo;
    el.style.setProperty("zoom", String(Math.floor(z * 1000) / 1000));
    el.style.setProperty("--zoom", String(z));
  }, [maximo, minimo]);

  usarEfecto(() => {
    ajustar();
    const padre = caja.current?.parentElement;
    const ro = padre ? new ResizeObserver(() => ajustar()) : null;
    if (padre) ro!.observe(padre);
    window.addEventListener("resize", ajustar);
    return () => { ro?.disconnect(); window.removeEventListener("resize", ajustar); };
  }, [ajustar]);

  return <div ref={caja} className={className} style={{ zoom: maximo, ["--zoom" as string]: maximo }}>{children}</div>;
}
