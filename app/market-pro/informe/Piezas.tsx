"use client";
// El tacho de una sección agregada (pregunta ahí mismo Sí / No) y la pantalla que se actualiza sola cuando el asistente
// agrega algo o el informe se está escribiendo.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import IconoTacho from "@/app/componentes/IconoTacho";
import { accionBorrarExtra } from "./acciones";

export function TachoExtra({ id }: { id: number }) {
  const [preguntando, setPreguntando] = useState(false);
  const [pendiente, empezar] = useTransition();
  if (preguntando) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        ¿Borrar?
        <button type="button" disabled={pendiente} onClick={() => empezar(() => accionBorrarExtra(id))} className="rounded-md border border-[#C03420] text-[#C03420] px-2 py-0.5">Sí</button>
        <button type="button" onClick={() => setPreguntando(false)} className="rounded-md border border-[#E3E9F0] px-2 py-0.5">No</button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setPreguntando(true)} title="Borrar esta sección" aria-label="Borrar esta sección" className="text-[#5C6B76] hover:text-[#C03420]">
      <IconoTacho />
    </button>
  );
}

export function Refrescar({ trabajando }: { trabajando: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const f = () => router.refresh();
    window.addEventListener("informe-agregado", f);
    const t = trabajando ? setInterval(f, 15_000) : null;
    return () => { window.removeEventListener("informe-agregado", f); if (t) clearInterval(t); };
  }, [router, trabajando]);
  return null;
}
