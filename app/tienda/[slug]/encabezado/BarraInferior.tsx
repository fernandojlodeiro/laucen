"use client";

// La barra de abajo en el celular (como la de Mercado Libre): Inicio, Categorías, Ofertas, Carrito
// (con la cantidad) y Mi cuenta. En la compu no está: todo eso va en el encabezado.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Item = { nombre: string; href: string; icono: React.ReactNode; activo: (ruta: string, ofertas: boolean) => boolean };

const trazo = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export default function BarraInferior({ base, unidades }: { base: string; unidades: number }) {
  const ruta = usePathname();
  const ofertas = useSearchParams().get("ofertas") === "1";
  const r = (x = "") => `${base}${x}`;
  const fin = (x: string) => (p: string) => p.endsWith(x) || p.includes(`${x}/`);
  const items: Item[] = [
    { nombre: "Inicio", href: r(), activo: (p) => p === r() || p === "/", icono: <path d="M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10" {...trazo} /> },
    { nombre: "Categorías", href: r("/categorias"), activo: fin("/categorias"), icono: <><rect x="4" y="4" width="6" height="6" rx="1" {...trazo} /><rect x="14" y="4" width="6" height="6" rx="1" {...trazo} /><rect x="4" y="14" width="6" height="6" rx="1" {...trazo} /><path d="M17 14v6M14 17h6" {...trazo} /></> },
    { nombre: "Ofertas", href: `${r("/buscar")}?ofertas=1`, activo: (p, o) => p.endsWith("/buscar") && o, icono: <><path d="M3 12V4h8l10 10-8 8L3 12z" {...trazo} /><circle cx="7.5" cy="7.5" r="1.5" {...trazo} /></> },
    { nombre: "Carrito", href: r("/carrito"), activo: fin("/carrito"), icono: <path d="M3 4h2l2.4 11h10.2L20 7H6.2M9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01" {...trazo} /> },
    { nombre: "Mi cuenta", href: r("/cuenta"), activo: fin("/cuenta"), icono: <><circle cx="12" cy="8" r="4" {...trazo} /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...trazo} /></> },
  ];
  return (
    <nav aria-label="Atajos" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--linea)] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((x) => {
          const activo = x.activo(ruta, ofertas);
          return (
            <li key={x.nombre}>
              <Link href={x.href} aria-current={activo ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] ${activo ? "text-[var(--boton)]" : "text-[var(--texto-2)]"}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>{x.icono}</svg>
                {x.nombre}
                {x.nombre === "Carrito" && unidades > 0 && (
                  <span className="absolute left-1/2 top-0.5 ml-1 min-w-[17px] rounded-full bg-[var(--boton)] px-1 text-center text-[10px] font-semibold leading-[17px] text-white">
                    {unidades > 99 ? "99+" : unidades}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
