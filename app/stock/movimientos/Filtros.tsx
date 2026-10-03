"use client";

// Filtro de fecha (desde / hasta) que cambia la dirección al elegir, sin botón
// "Buscar"; vuelve a la primera página.

import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";

export function FiltroFecha({ parametro, etiqueta, valor }: { parametro: string; etiqueta: string; valor: string }) {
  const cambiar = usarCambiarParametro();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      {etiqueta}
      <input type="date" defaultValue={valor} onChange={(e) => cambiar({ [parametro]: e.target.value || null, p: null })}
        className="border border-[#E3E9F0] rounded-lg px-2 py-1 text-xs bg-white" />
    </label>
  );
}
