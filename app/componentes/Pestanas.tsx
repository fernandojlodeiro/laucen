// La barra de pestañas de todo el panel (AGENTS.md: una pestaña se dibuja
// como una pestaña, aunque no esté elegida). Las no elegidas llevan un
// degradé gris suave, como las hojas de Excel; la elegida, fondo blanco,
// texto azul y una raya azul arriba, y se une al contenido (tapa la línea de
// abajo). Cada una puede llevar su cuenta entre paréntesis: "Fotos (3)",
// también "(0)".
//
// Sin JavaScript: sirve en pantallas de servidor. La que se prende sola según
// la ruta es `Pestanas` de app/radar/Cliente.tsx, que dibuja con ésta.
//
// La línea de abajo es una sombra interna de la barra (no un borde con
// margen negativo): así no se desborda y no aparece una barra de desplazamiento
// vertical sin nada que desplazar. Si no entran a lo ancho, se desplazan de
// costado.

import Link from "next/link";
import type { ReactNode } from "react";

export type Pestana = {
  href: string;
  texto: ReactNode;
  activa: boolean;
  /** Cuántas cosas hay adentro: se muestra "(n)". Sin cuenta, nada. */
  cuenta?: number | null;
  /** Algo pegado a la derecha de la pestaña (ej. una "i" con ayuda). */
  despues?: ReactNode;
  clave?: string;
};

export default function Pestanas({ items, chica = false, desplazable = true, className = "mb-4" }: {
  items: Pestana[];
  chica?: boolean;
  /** false: la barra no recorta (para globos de ayuda que se abren hacia abajo). */
  desplazable?: boolean;
  className?: string;
}) {
  return (
    <nav className={`flex items-end gap-1 shadow-[inset_0_-1px_0_#D5DDE5] ${desplazable ? "overflow-x-auto overflow-y-hidden" : ""} ${className}`}>
      {items.map((i) => (
        <span key={i.clave ?? i.href} className={`flex items-center shrink-0 rounded-t-lg border ${i.activa
          ? "bg-white border-[#D5DDE5] border-b-white shadow-[inset_0_2px_0_#16577F]"
          : "bg-gradient-to-b from-[#FBFCFD] to-[#E4E9EE] border-[#D5DDE5] hover:from-white hover:to-[#EDF1F5]"}`}>
          <Link href={i.href} scroll={false} aria-current={i.activa ? "page" : undefined}
            className={`${chica ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-bold whitespace-nowrap ${i.activa ? "text-[#16577F]" : "text-[#5C6B76] hover:text-[#16577F]"}`}>
            {i.texto}
            {i.cuenta != null && <span className="ml-1 font-normal tabular-nums">({i.cuenta.toLocaleString("es-AR")})</span>}
          </Link>
          {i.despues}
        </span>
      ))}
    </nav>
  );
}
