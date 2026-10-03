"use client";

// "Descargar Excel" de las listas de los ABM (AGENTS.md): arriba a la derecha,
// al lado de "Nuevo …". Baja la lista con los filtros, la búsqueda y el orden
// que se ven (todas las filas, no sólo la página), con las columnas de la
// configuración elegida en el desplegable ("Como en pantalla" o una guardada).
// La elección se recuerda (cookie de esta pantalla). "Configurar…" lleva a
// armar, renombrar y borrar configuraciones.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PRIMARIO, SUAVE } from "@/app/botones";

/** Lo que no es un filtro de la lista: no viaja al Excel. */
const FUERA = ["p", "ok", "error", "nuevo", "editar", "_cfg", "_vista"];

export function recordar(nombre: string, valor: string, ruta: string) {
  try {
    document.cookie = `${nombre}=${encodeURIComponent(valor)}; path=${ruta}; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    // Sin cookies se elige cada vez; no pasa nada.
  }
}

export default function DescargarExcel({ pantalla, ruta, configs, inicial, vista, extra }: {
  pantalla: string; ruta: string; configs: { id: number; nombre: string }[]; inicial: number | null;
  /** La vista que se está viendo (si la pantalla tiene vistas): "Como en pantalla" baja esas columnas. */
  vista?: number | null;
  /** Parámetros que la pantalla da por sentados y no están en la dirección (ej. el depósito elegido). */
  extra?: Record<string, string>;
}) {
  const sp = useSearchParams();
  const aqui = usePathname();
  const [cfg, setCfg] = useState(inicial && configs.some((c) => c.id === inicial) ? String(inicial) : "");
  const p = new URLSearchParams(sp.toString());
  for (const k of FUERA) p.delete(k);
  for (const [k, v] of Object.entries(extra ?? {})) if (!p.has(k)) p.set(k, v);
  if (cfg) p.set("_cfg", cfg);
  if (vista) p.set("_vista", String(vista));
  const volver = `${aqui}${sp.toString() ? `?${sp}` : ""}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <select value={cfg} onChange={(e) => { setCfg(e.target.value); recordar(`excel_${pantalla}`, e.target.value, ruta); }}
        aria-label="Columnas del Excel" title="Qué columnas baja el Excel"
        className="border border-[#E3E9F0] rounded-lg px-2 py-2 text-xs bg-white max-w-40">
        <option value="">Como en pantalla</option>
        {configs.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <a href={`/listas/${pantalla}/excel?${p}`} className={PRIMARIO} download>⬇ Descargar Excel</a>
      <Link href={`/listas/${pantalla}/configurar?tipo=excel&volver=${encodeURIComponent(volver)}`} className={SUAVE}
        title="Armar, renombrar o borrar configuraciones de Excel">⚙ Configurar…</Link>
    </span>
  );
}
