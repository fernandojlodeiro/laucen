// Búsqueda de la tienda (?q=): sin palabra, todo el catálogo. También
// "Ofertas" (?ofertas=1) y "Más vendidos" (?orden=vendidos), con los mismos
// filtros de la columna izquierda (?familia=, ?marca=, ?min=, ?max=, ?envio=gratis).

import type { Metadata } from "next";
import { rutaTienda } from "@/lib/tienda/tienda";
import { arbolDe, cargarTienda } from "../catalogo";
import { leerFiltros, Listado, Migas } from "../piezas";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const tituloDe = (f: ReturnType<typeof leerFiltros>) =>
  f.q ? f.q : f.ofertas ? "Ofertas" : f.orden === "vendidos" ? "Más vendidos" : "Todos los productos";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = leerFiltros(await searchParams);
  return { title: f.q ? `Buscar “${f.q}”` : tituloDe(f) };
}

export default async function Buscar({ params, searchParams }: Props) {
  const t = await cargarTienda((await params).slug);
  const f = leerFiltros(await searchParams);
  const arbol = f.familiaId ? await arbolDe(t) : null;
  const fam = f.familiaId ? arbol?.nodos.get(f.familiaId) : null;
  const migas = fam
    ? <Migas t={t} partes={[...arbol!.cadena(fam.id).reverse().map((id) => ({ nombre: arbol!.nodos.get(id)?.nombre ?? "", href: rutaTienda(t, `/familia/${id}`) }))]} />
    : undefined;
  return <Listado t={t} base={rutaTienda(t, "/buscar")} titulo={tituloDe(f)} filtros={f} migas={migas} />;
}
