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

/** Varias cajas para tildar atadas a un solo parámetro con las claves
 *  elegidas separadas por coma (ej. ?tipos=estado,precio). Sin el parámetro
 *  rige `defecto`; si no queda ninguna tildada, va `vacio`. */
export function CasillasVivas({ parametro, etiqueta, opciones, elegidas, defecto, vacio = "ninguno" }: {
  parametro: string; etiqueta: string; opciones: { valor: string; texto: string }[]; elegidas: string[]; defecto: string[]; vacio?: string;
}) {
  const cambiar = usarCambiarParametro();
  const alternar = (valor: string, tildada: boolean) => {
    const nuevas = opciones.map((o) => o.valor).filter((v) => (v === valor ? tildada : elegidas.includes(v)));
    const esDefecto = nuevas.length === defecto.length && defecto.every((d) => nuevas.includes(d));
    cambiar({ [parametro]: esDefecto ? null : nuevas.join(",") || vacio });
  };
  return (
    <span className="inline-flex items-center gap-3 text-xs">
      {etiqueta}
      {opciones.map((o) => (
        <label key={o.valor} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <input type="checkbox" checked={elegidas.includes(o.valor)} onChange={(e) => alternar(o.valor, e.target.checked)} className="h-4 w-4 accent-[#16577F]" />
          {o.texto}
        </label>
      ))}
    </span>
  );
}
