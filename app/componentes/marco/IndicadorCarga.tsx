"use client";

// «Cargando…» (Fer, 8/10): al buscar o filtrar, las pantallas pesadas tardan y
// parecía que no hacía nada. Los buscadores y filtros vivos avisan con el
// evento "laucen:cargando"; el cartel se va cuando cambia la dirección (llegó
// la pantalla nueva) o, por las dudas, al minuto.

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function IndicadorCarga() {
  const ruta = usePathname();
  const busqueda = useSearchParams().toString();
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    const prender = () => setCargando(true);
    window.addEventListener("laucen:cargando", prender);
    return () => window.removeEventListener("laucen:cargando", prender);
  }, []);
  useEffect(() => { setCargando(false); }, [ruta, busqueda]);
  useEffect(() => {
    if (!cargando) return;
    const t = setTimeout(() => setCargando(false), 60_000);
    return () => clearTimeout(t);
  }, [cargando]);
  if (!cargando) return null;
  return (
    <>
      <div className="fixed top-0 inset-x-0 z-50 h-1 overflow-hidden bg-[#DCE8F2] print:hidden" aria-hidden>
        <div className="h-full w-1/3 bg-[#16577F] animate-[cargando_1.1s_ease-in-out_infinite]" />
      </div>
      <div role="status" className="fixed top-12 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 rounded-full bg-[#16577F] text-white text-xs font-bold px-4 py-2 shadow-lg print:hidden">
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />
        Cargando…
      </div>
      <style>{`@keyframes cargando { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
    </>
  );
}
