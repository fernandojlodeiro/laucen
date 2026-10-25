// Una categoría de la tienda: sus productos y los de sus subcategorías, con
// las migas desde la raíz y los filtros del listado.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { nombreTienda, rutaTienda } from "@/lib/tienda/tienda";
import { cargarTienda, familiaConCamino } from "../../catalogo";
import { leerFiltros, Listado, Migas } from "../../piezas";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function cargar(params: Props["params"]) {
  const { slug, id } = await params;
  const t = await cargarTienda(slug);
  const n = Number(id);
  const f = Number.isInteger(n) && n > 0 ? await familiaConCamino(t, n) : null;
  if (!f) notFound();
  return { t, f };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t, f } = await cargar(params);
  const nombre = nombreTienda(t);
  return { title: f.nombre, description: f.descripcion ?? `${f.nombre} en ${nombre}.`, openGraph: { title: `${f.nombre} | ${nombre}`, siteName: nombre, locale: "es_AR", type: "website" } };
}

export default async function Familia({ params, searchParams }: Props) {
  const { t, f } = await cargar(params);
  const filtros = { ...leerFiltros(await searchParams), familiaId: f.id };
  const migas = (
    <div className="space-y-1">
      <Migas t={t} partes={[...f.camino.map((c) => ({ nombre: c.nombre, href: rutaTienda(t, `/familia/${c.id}`) })), { nombre: f.nombre }]} />
      {f.descripcion && <p className="max-w-3xl text-sm text-[var(--texto-2)]">{f.descripcion}</p>}
    </div>
  );
  return <Listado t={t} base={rutaTienda(t, `/familia/${f.id}`)} titulo={f.nombre} filtros={filtros} familiaEnRuta migas={migas} />;
}
