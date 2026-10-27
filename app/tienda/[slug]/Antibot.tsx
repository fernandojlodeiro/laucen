"use client";

// Los campos del antibot en un formulario de la tienda (lib/tienda/antibot.ts):
// el campo trampa (oculto: una persona no lo ve ni lo llena), la hora firmada de
// cuando se dibujó y, si la organización cargó Turnstile, el desafío de
// Cloudflare (casi siempre invisible; deja su token en "cf-turnstile-response").
// Render explícito, como en CadaMes: cada vez que se monta tiene su widget.
// El pase de Turnstile sirve una sola vez (Fer, 27/10: en el checkout, después de un error el formulario seguía
// con el pase ya usado y cada reintento se rechazaba). `vuelta`: cuando cambia, se pide un pase nuevo. Si se vence
// o falla, Turnstile lo renueva solo.

import { useEffect, useRef } from "react";
import { CAMPO_MARCA, CAMPO_TRAMPA } from "@/lib/tienda/antibot-campos";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void; reset: (id: string) => void } }
}

let cargando: Promise<void> | null = null;
function cargar(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  cargando ??= new Promise((ok) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = () => ok();
    document.head.appendChild(s);
  });
  return cargando;
}

export default function Antibot({ marca, siteKey, vuelta = 0 }: { marca: string; siteKey: string | null; vuelta?: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  useEffect(() => {
    if (!siteKey) return;
    let vivo = true;
    cargar().then(() => {
      if (vivo && caja.current && window.turnstile)
        widget.current = window.turnstile.render(caja.current, { sitekey: siteKey, size: "flexible", "refresh-expired": "auto", "refresh-timeout": "auto", retry: "auto" });
    });
    return () => { vivo = false; if (widget.current && window.turnstile) window.turnstile.remove(widget.current); widget.current = null; };
  }, [siteKey]);
  // Un intento que falló gastó el pase: se pide otro.
  useEffect(() => { if (vuelta > 0 && widget.current && window.turnstile) window.turnstile.reset(widget.current); }, [vuelta]);
  return (
    <>
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>Sitio web<input type="text" name={CAMPO_TRAMPA} tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
      <input type="hidden" name={CAMPO_MARCA} value={marca} />
      {siteKey && <div ref={caja} className="min-h-[65px]" />}
    </>
  );
}
