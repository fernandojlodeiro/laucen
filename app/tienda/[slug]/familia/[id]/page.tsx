// Una familia de la tienda: sus productos y los de sus subfamilias.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rutaTienda } from "@/lib/tienda/tienda";
import { cargarTienda, esOrden, familiaConCamino } from "../../catalogo";
import { Listado, TITULO } from "../../piezas";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function cargar(params: Props["params"]) {
  const { slug, id } = await params;
  const t = await cargarTienda(slug);
  const n = Number(id);
  const f = Number.isInteger(n) && n > 0 ? await familiaConCamino(t.organizacionId, n) : null;
  if (!f) notFound();
  return { t, f };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { f } = await cargar(params);
  return { title: f.nombre };
}

export default async function Familia({ params, searchParams }: Props) {
  const { t, f } = await cargar(params);
  const sp = await searchParams;
  const orden = esOrden(sp.orden) ? sp.orden : "relevancia";
  const pagina = Math.max(1, Math.trunc(Number(sp.pagina)) || 1);
  return (
    <div className="space-y-4">
      <nav aria-label="Estás en" className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        <Link href={rutaTienda(t)} className="hover:text-[var(--acento)]">Inicio</Link>
        {f.camino.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span aria-hidden>›</span>
            <Link href={rutaTienda(t, `/familia/${c.id}`)} className="hover:text-[var(--acento)]">{c.nombre}</Link>
          </span>
        ))}
      </nav>
      <h1 className={TITULO}>{f.nombre}</h1>
      {f.descripcion && <p className="max-w-2xl text-gray-600">{f.descripcion}</p>}
      {f.hijas.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
          <div className="flex gap-2 whitespace-nowrap">
            {f.hijas.map((h) => (
              <Link key={h.id} href={rutaTienda(t, `/familia/${h.id}`)}
                className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-[var(--acento)] hover:text-white">{h.nombre}</Link>
            ))}
          </div>
        </div>
      )}
      <Listado t={t} base={rutaTienda(t, `/familia/${f.id}`)} familiaId={f.id} orden={orden} pagina={pagina} />
    </div>
  );
}
