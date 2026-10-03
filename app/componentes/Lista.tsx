"use client";

// Lo de pantalla de las listas de los ABM (pedido de Fer, 3/10): el título de
// columna que ordena al tocarlo y el paginador de abajo. Leen y cambian la
// dirección (?orden=, ?dir=, ?p=); la consulta la arma lib/lista.ts.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { POR_PAGINA } from "@/lib/por-pagina";

// Las mismas clases que TH / THN de erp.tsx (ése no se puede importar acá: es del servidor).
const TH = "py-1.5 px-2 text-left whitespace-nowrap font-semibold";
const THN = "py-1.5 px-2 text-right whitespace-nowrap font-semibold";
const BOTON = "text-xs font-bold rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]";

function usarDireccion() {
  const ruta = usePathname();
  const sp = useSearchParams();
  return (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) if (v) p.set(k, v); else p.delete(k);
    const s = p.toString();
    return s ? `${ruta}?${s}` : ruta;
  };
}

/** Título de columna que ordena: el primer toque ordena por ella (de menor a
 *  mayor; los números y fechas, de mayor a menor) y el segundo da vuelta.
 *  `porDefecto` = es la columna por la que la lista ya viene ordenada. */
export function ThOrden({ col, children, n = false, porDefecto = false, desc = n, className = "", title }: {
  col: string; children: ReactNode; n?: boolean; porDefecto?: boolean; desc?: boolean; className?: string; title?: string;
}) {
  const sp = useSearchParams();
  const ir = usarDireccion();
  const orden = sp.get("orden");
  const activa = orden === col || (!orden && porDefecto);
  const dirActual = orden === col ? (sp.get("dir") === "desc" ? "desc" : "asc") : "asc";
  const proxima = activa ? (dirActual === "asc" ? "desc" : "asc") : (desc ? "desc" : "asc");
  return (
    <th className={`${n ? THN : TH} ${className}`} title={title} aria-sort={activa ? (dirActual === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={ir({ orden: col, dir: proxima, p: null })} scroll={false} className="hover:text-[#16577F] hover:underline">
        {children}{activa && <span className="ml-0.5 text-[9px]">{dirActual === "asc" ? "▲" : "▼"}</span>}
      </Link>
    </th>
  );
}

/** El paginador de abajo de la lista: "1–50 de 4.509" con Anterior/Siguiente. */
export function Paginado({ total }: { total: number }) {
  const sp = useSearchParams();
  const ir = usarDireccion();
  if (total <= 0) return null;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const p = Math.min(Math.max(1, Math.floor(Number(sp.get("p"))) || 1), paginas);
  const desde = (p - 1) * POR_PAGINA + 1, hasta = Math.min(total, p * POR_PAGINA);
  const n = (x: number) => x.toLocaleString("es-AR");
  return (
    <nav className="flex items-center justify-end gap-2 mt-2 text-xs text-[#5C6B76]" aria-label="Páginas">
      <span className="tabular-nums">{n(desde)}–{n(hasta)} de {n(total)}</span>
      {paginas > 1 && (
        <>
          {p > 1
            ? <Link href={ir({ p: p - 1 > 1 ? String(p - 1) : null })} scroll={false} className={BOTON}>← Anterior</Link>
            : <span className={`${BOTON} opacity-40`} aria-disabled>← Anterior</span>}
          {p < paginas
            ? <Link href={ir({ p: String(p + 1) })} scroll={false} className={BOTON}>Siguiente →</Link>
            : <span className={`${BOTON} opacity-40`} aria-disabled>Siguiente →</span>}
        </>
      )}
    </nav>
  );
}
