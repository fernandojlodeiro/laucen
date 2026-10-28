"use client";

// Los filtros adentro esperan el OK para releer la pantalla (app/componentes/filtros-pendientes.ts).

import { useState, type ReactNode } from "react";
import { usarIrA } from "@/app/componentes/BuscadorVivo";
import { FiltrosPendientes } from "@/app/componentes/filtros-pendientes";
import { PRIMARIO } from "@/app/botones";

export default function FiltrosConOk({ children }: { children: ReactNode }) {
  const ir = usarIrA();
  const [cambios, setCambios] = useState<Record<string, string | null>>({});
  const n = Object.keys(cambios).filter((k) => k !== "p").length;
  return (
    <FiltrosPendientes.Provider value={{ cambios, cambiar: (c) => setCambios((x) => ({ ...x, ...c })) }}>
      {children}
      <button type="button" disabled={!n} onClick={() => { ir({ ...cambios, p: null }); setCambios({}); }}
        title={n ? "Aplica los filtros elegidos y vuelve a leer la lista" : "Elegí los filtros y apretá OK"}
        className={`${PRIMARIO} disabled:opacity-40 ${n ? "ring-2 ring-[#F2C94C]" : ""}`}>
        OK{n ? ` (${n} cambio${n === 1 ? "" : "s"})` : ""}
      </button>
    </FiltrosPendientes.Provider>
  );
}
