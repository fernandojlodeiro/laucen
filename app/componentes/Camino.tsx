"use client";

// El camino (pedido de Fer, 3/10): arriba a la izquierda, sobre el título,
// "Stock › Depósitos y ubicaciones › A127-26". Cada parte se toca para volver
// a ese nivel. La sección y la pantalla salen de lib/menu.ts según la
// dirección; las fichas ([id]) suman sus partes con `extra`. La sección no
// tiene pantalla propia: al tocarla despliega sus opciones.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MENU, type SeccionMenu, type ItemMenu } from "@/lib/menu";

export type Paso = { texto: string; href?: string };

const SEP = <span className="text-[#9AA7B3]" aria-hidden>›</span>;
const ENLACE = "text-[#16577F] hover:underline";

/** La sección y el ítem del menú de esta dirección (el href más largo que la contiene). */
function ubicar(ruta: string): { seccion: SeccionMenu; item: ItemMenu & { href: string } } | null {
  let mejor: { seccion: SeccionMenu; item: ItemMenu & { href: string } } | null = null;
  for (const seccion of MENU) for (const item of seccion.items) {
    if (!item.href || !(ruta === item.href || ruta.startsWith(`${item.href}/`))) continue;
    if (!mejor || item.href.length > mejor.item.href.length) mejor = { seccion, item: item as ItemMenu & { href: string } };
  }
  return mejor;
}

export default function Camino({ extra = [] }: { extra?: Paso[] }) {
  const ruta = usePathname();
  const donde = ubicar(ruta);
  if (!donde && extra.length === 0) return null;
  const pasos: Paso[] = donde ? [{ texto: donde.item.texto, href: donde.item.href }, ...extra] : extra;
  return (
    <nav aria-label="Camino" className="flex flex-wrap items-center gap-1.5 text-[11px] mb-0.5">
      {donde && <><Seccion seccion={donde.seccion} />{SEP}</>}
      {pasos.map((p, i) => {
        const ultimo = i === pasos.length - 1;
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {p.href && !(ultimo && p.href === ruta)
              ? <Link href={p.href} className={ENLACE}>{p.texto}</Link>
              : <span className="text-[#5C6B76]">{p.texto}</span>}
            {!ultimo && SEP}
          </span>
        );
      })}
    </nav>
  );
}

function Seccion({ seccion }: { seccion: SeccionMenu }) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierta(false); };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);
  return (
    <span ref={caja} className="relative">
      <button type="button" onClick={() => setAbierta(!abierta)} aria-expanded={abierta} className={ENLACE}>
        {seccion.texto} <span className="text-[9px]">▾</span>
      </button>
      {abierta && (
        <ul className="absolute left-0 top-full mt-1 min-w-52 bg-white border border-[#E3E9F0] rounded-lg shadow-lg py-1 z-40">
          {seccion.items.filter((i) => i.href).map((i) => (
            <li key={i.texto}><Link href={i.href!} onClick={() => setAbierta(false)} className="block px-3 py-1.5 text-xs text-[#1E2A32] hover:bg-[#EEF3F8]">{i.texto}</Link></li>
          ))}
        </ul>
      )}
    </span>
  );
}
