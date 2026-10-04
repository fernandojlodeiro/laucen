"use client";

// Las casillas de filtro de Vincular con Mercado Libre (en vez de pestañas,
// para combinarlas). Cada una cambia ?f= en la dirección al tildarla, como
// el buscador. Al lado, cuántas hay de cada una en el canal.

import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";
import { CASILLAS_ML, valorVerMl, type VerMl } from "./casillas-ml";

export default function Casillas({ ver, cuentas }: { ver: VerMl; cuentas: Record<string, number> }) {
  const cambiar = usarCambiarParametro();
  const n = (x: number) => x.toLocaleString("es-AR");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-xs">
      {CASILLAS_ML.map((c, i) => (
        <label key={c.clave} className={`inline-flex items-center gap-1.5 whitespace-nowrap ${i === 2 ? "sm:ml-3 sm:pl-4 sm:border-l sm:border-[#E3E9F0]" : ""}`}>
          <input type="checkbox" checked={ver.includes(c.clave)} className="h-4 w-4 accent-[#16577F]"
            onChange={(e) => cambiar({ f: valorVerMl(e.target.checked ? [...ver, c.clave] : ver.filter((x) => x !== c.clave)), ver: null })} />
          {c.texto} <span className="text-[#5C6B76]">({n(cuentas[c.clave] ?? 0)})</span>
        </label>
      ))}
    </div>
  );
}
