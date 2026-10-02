// Búsqueda de la tienda (?q=): sin palabra, todo el catálogo.

import type { Metadata } from "next";
import { rutaTienda } from "@/lib/tienda/tienda";
import { cargarTienda, esOrden } from "../catalogo";
import { Listado, TITULO } from "../piezas";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const leer = (x: unknown) => (typeof x === "string" ? x : "");

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = leer((await searchParams).q).trim();
  return { title: q ? `Buscar “${q}”` : "Productos" };
}

export default async function Buscar({ params, searchParams }: Props) {
  const t = await cargarTienda((await params).slug);
  const sp = await searchParams;
  const q = leer(sp.q).trim().slice(0, 100);
  const orden = esOrden(sp.orden) ? sp.orden : "relevancia";
  const pagina = Math.max(1, Math.trunc(Number(sp.pagina)) || 1);
  return (
    <div className="space-y-4">
      <h1 className={TITULO}>{q ? <>Resultados para “{q}”</> : "Todos los productos"}</h1>
      <Listado t={t} base={rutaTienda(t, "/buscar")} q={q || null} orden={orden} pagina={pagina} />
    </div>
  );
}
