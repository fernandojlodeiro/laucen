"use client";

// Filtro de fechas "desde / hasta" (AGENTS.md: RangoFechas con atajos): dos
// fechas chicas y un desplegable de atajos (Hoy, Ayer, Últimos 7 días, Este
// mes, Último mes, Último trimestre, Último año). Elegir un atajo llena las
// dos fechas y aplica el filtro al momento (cambia la dirección, como
// BuscadorVivo); tocar una fecha a mano lo deja en "Personalizado". Los días
// se cuentan en hora argentina. Las fechas llevan `name`, así que adentro de
// un <form method="get"> también viajan con el resto del formulario.

import { useRef, useState } from "react";
import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";
import { ATAJOS_FECHAS, atajoDeRango, rangoDeAtajo, type Atajo } from "@/lib/rango-fechas";

const CAJA = "border border-[#E3E9F0] rounded-lg py-1.5 text-xs bg-white";

export default function RangoFechas({ desde = "", hasta = "", parametroDesde = "desde", parametroHasta = "hasta", vacio, valorVacio, etiqueta = "Fechas", limpiar = [] }: {
  /** Las fechas que rigen (AAAA-MM-DD); vacías = sin filtro. */
  desde?: string; hasta?: string;
  parametroDesde?: string; parametroHasta?: string;
  /** Si se puede ver sin fechas, el texto de esa opción ("Todas las fechas"). Sin esto, siempre hay un rango. */
  vacio?: string;
  /** Si la pantalla tiene fechas de entrada (ej. la última semana), lo que va en `desde` al elegir «vacio» (ej. "todas"). */
  valorVacio?: string;
  etiqueta?: string;
  /** Parámetros de la dirección que se sacan al cambiar (ej. la fila abierta). */
  limpiar?: string[];
}) {
  const cambiar = usarCambiarParametro();
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);
  // Si la dirección cambia desde afuera, las fechas la siguen.
  const [visto, setVisto] = useState(`${desde}|${hasta}`);
  if (visto !== `${desde}|${hasta}`) { setVisto(`${desde}|${hasta}`); setD(desde); setH(hasta); }

  const atajo = atajoDeRango(d, h);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pone las fechas y filtra: un atajo al momento; una fecha tipeada, al dejar de tipear. */
  const aplicar = (nd: string, nh: string, demora = 0) => {
    setD(nd); setH(nh);
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => cambiar({ [parametroDesde]: nd || (!nh && valorVacio ? valorVacio : null), [parametroHasta]: nh || null, ...Object.fromEntries(limpiar.map((k) => [k, null])) }), demora);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-[#5C6B76]">
      {etiqueta && <span>{etiqueta}</span>}
      <select value={atajo === "" ? "" : atajo} aria-label="Atajo de fechas"
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") aplicar("", "");
          else if (v !== "personalizado") { const r = rangoDeAtajo(v as Atajo); aplicar(r.desde, r.hasta); }
        }}
        className={`${CAJA} px-2 text-[#1E2A32]`}>
        {(vacio || atajo === "") && <option value="">{vacio ?? "Elegí…"}</option>}
        {ATAJOS_FECHAS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        <option value="personalizado" disabled={atajo !== "personalizado"}>Personalizado</option>
      </select>
      <input type="date" name={parametroDesde} value={d} aria-label="Desde" max={h || undefined}
        onChange={(e) => aplicar(e.target.value, h, 500)} className={`${CAJA} px-1.5 w-[8.5rem] text-[#1E2A32]`} />
      <span>a</span>
      <input type="date" name={parametroHasta} value={h} aria-label="Hasta" min={d || undefined}
        onChange={(e) => aplicar(d, e.target.value, 500)} className={`${CAJA} px-1.5 w-[8.5rem] text-[#1E2A32]`} />
    </span>
  );
}
