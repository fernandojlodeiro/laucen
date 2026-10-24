"use client";

// Los campos del antibot en un formulario de la tienda (lib/tienda/antibot.ts):
// el campo trampa (oculto: una persona no lo ve ni lo llena), la hora firmada de
// cuando se dibujó y, si la organización cargó Turnstile, el desafío de
// Cloudflare (casi siempre invisible; deja su token en "cf-turnstile-response").
// Render explícito, como en CadaMes: cada vez que se monta tiene su widget.

import { useEffect, useRef } from "react";
import { CAMPO_MARCA, CAMPO_TRAMPA } from "@/lib/tienda/antibot-campos";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: { sitekey: string; size?: string }) => string; remove: (id: string) => void } }
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

export default function Antibot({ marca, siteKey }: { marca: string; siteKey: string | null }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey) return;
    let id: string | null = null, vivo = true;
    cargar().then(() => { if (vivo && caja.current && window.turnstile) id = window.turnstile.render(caja.current, { sitekey: siteKey, size: "flexible" }); });
    return () => { vivo = false; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey]);
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
