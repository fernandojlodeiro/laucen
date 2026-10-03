"use client";

// Convención (AGENTS.md): ningún ABM da de alta algo sin apretar antes un
// botón "Nuevo …", que va arriba a la derecha, a la altura del título
// (en `acciones` de Pantalla). El formulario de alta queda escondido hasta
// entonces y se abre debajo del encabezado. El estado va en la dirección
// (?nuevo=<clave>; la clave sale del texto: "Nuevo producto" → nuevo-producto),
// así el botón y el formulario no necesitan estar juntos: se emparejan por el
// texto. Sin BotonNuevo (el AltaNueva solo, como antes), el botón lo dibuja él.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { PRIMARIO, SUAVE } from "@/app/botones";

const claveDe = (texto: string) =>
  texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function usarNuevo(clave: string) {
  const ruta = usePathname();
  const sp = useSearchParams();
  const con = (valor: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (valor) p.set("nuevo", valor); else p.delete("nuevo");
    const s = p.toString();
    return s ? `${ruta}?${s}` : ruta;
  };
  return { abierto: sp.get("nuevo") === clave, abrir: con(clave), cerrar: con(null) };
}

/** El botón "+ Nuevo …" del encabezado. Con el alta abierta no se muestra. */
export function BotonNuevo({ texto, clave }: { texto: string; clave?: string }) {
  const { abierto, abrir } = usarNuevo(clave ?? claveDe(texto));
  if (abierto) return null;
  return <Link href={abrir} scroll={false} className={PRIMARIO}>+ {texto}</Link>;
}

/** El formulario de alta: sólo aparece después de apretar su BotonNuevo
 *  (`sinBoton`: el botón está en el encabezado). Sin `sinBoton`, cerrado
 *  muestra su propio botón en el lugar. */
export default function AltaNueva({ texto, clave, sinBoton = false, children, className = "mb-4" }: {
  texto: string; clave?: string; sinBoton?: boolean; children: ReactNode; className?: string;
}) {
  const { abierto, abrir, cerrar } = usarNuevo(clave ?? claveDe(texto));
  if (!abierto) return sinBoton ? null : <div className={className}><Link href={abrir} scroll={false} className={PRIMARIO}>+ {texto}</Link></div>;
  return (
    <div className={`rounded-lg border border-[#E3E9F0] bg-[#FAFBFC] p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold">{texto}</span>
        <Link href={cerrar} scroll={false} className={SUAVE}>Cancelar</Link>
      </div>
      {children}
    </div>
  );
}
