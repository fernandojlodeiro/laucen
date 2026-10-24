// Categorías de la tienda (el atajo «Categorías» de la barra de abajo en el celular): cada
// categoría principal con su foto y sus subcategorías, como la lista de Mercado Libre.

import type { Metadata } from "next";
import Link from "next/link";
import { rutaTienda } from "@/lib/tienda/tienda";
import { arbolDe, cargarTienda } from "../catalogo";
import { CAJA, IconoTienda, TITULO } from "../piezas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Categorías" };

export default async function Categorias({ params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const arbol = await arbolDe(t);
  const r = (x: string) => rutaTienda(t, x);
  return (
    <div className="space-y-4">
      <h1 className={TITULO}>Categorías</h1>
      <ul className={`${CAJA} divide-y divide-[var(--linea)] overflow-hidden`}>
        {arbol.raices.map((f) => (
          <li key={f.id} className="p-3">
            <Link href={r(`/familia/${f.id}`)} className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--fondo)]">
                {f.foto ? <img src={f.foto} alt="" loading="lazy" className="h-full w-full object-contain p-1.5 mix-blend-multiply" /> : <IconoTienda clase="h-6 w-6 text-[var(--texto-2)]" />}
              </span>
              <span className="flex-1 text-[var(--texto)]">{f.nombre}</span>
              <span className="text-xs text-[var(--texto-2)]">{f.total}</span>
            </Link>
            {f.hijas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 pl-[60px]">
                {f.hijas.map((h) => (
                  <Link key={h.id} href={r(`/familia/${h.id}`)} className="rounded-full border border-[var(--linea)] px-2.5 py-1 text-xs text-[var(--texto-2)] hover:text-[var(--boton)]">{h.nombre}</Link>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
