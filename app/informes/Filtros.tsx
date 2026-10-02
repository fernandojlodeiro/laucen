"use client";

// Filtros de los informes: cada uno cambia la dirección al momento (sin botón
// "Aplicar"), así la pantalla y la descarga a Excel usan los mismos filtros.

import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";
import ElegirUbicacion, { type OpcionUbicacion } from "@/app/componentes/ElegirUbicacion";

/** Un desplegable corto (depósito, base de costo) atado a un parámetro. */
export function Desplegable({ parametro, etiqueta, valor, opciones, limpiar = [] }: {
  parametro: string; etiqueta: string; valor: string; opciones: { valor: string; texto: string }[]; limpiar?: string[];
}) {
  const cambiar = usarCambiarParametro();
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      {etiqueta}
      <select value={valor} onChange={(e) => cambiar({ [parametro]: e.target.value || null, ...Object.fromEntries(limpiar.map((k) => [k, null])) })}
        className="rounded-md border border-[#C9D3DD] bg-white px-2 py-1.5 text-xs">
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </label>
  );
}

/** Ubicación con buscador ("Todas" = sin filtro). */
export function FiltroUbicacion({ valor, opciones }: { valor: string; opciones: OpcionUbicacion[] }) {
  const cambiar = usarCambiarParametro();
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      Ubicación
      <ElegirUbicacion valor={valor} alCambiar={(v) => cambiar({ u: v || null })} className="w-64"
        opciones={[{ valor: "", texto: "Todas" }, ...opciones]} />
    </span>
  );
}
