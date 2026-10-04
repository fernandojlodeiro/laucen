"use client";

// El interruptor "Todas" al lado del canal de Mercado Libre (Fer, 4/10):
// prendido, la lista junta las publicaciones de todas las cuentas
// (?todas=1) y suma la columna Canal.

import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";

export default function Todas({ prendido }: { prendido: boolean }) {
  const cambiar = usarCambiarParametro();
  return (
    <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none pb-1.5">
      <button type="button" role="switch" aria-checked={prendido} onClick={() => cambiar({ todas: prendido ? null : "1" })}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${prendido ? "bg-[#16577F]" : "bg-[#C9D3DC]"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${prendido ? "left-[18px]" : "left-0.5"}`} />
      </button>
      Todas las cuentas
    </label>
  );
}
