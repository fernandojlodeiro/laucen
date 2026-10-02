// Inicio de la tienda: banner, familias y novedades (los productos más nuevos
// con precio y stock).

import Link from "next/link";
import { nombreTienda, rutaTienda } from "@/lib/tienda/tienda";
import { cargarTienda, familiasRaiz, listarProductos } from "./catalogo";
import { Grilla, TITULO } from "./piezas";

export const dynamic = "force-dynamic";

export default async function InicioTienda({ params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const [familias, { productos }] = await Promise.all([
    familiasRaiz(t.organizacionId),
    listarProductos(t, { soloConStock: true, porPagina: 12 }),
  ]);
  const nombre = nombreTienda(t);
  const c = t.config;

  return (
    <div className="space-y-10">
      {c.banner ? (
        <section className="relative overflow-hidden rounded-2xl bg-gray-100">
          <img src={c.banner} alt={nombre} className="h-48 w-full object-cover sm:h-72 lg:h-80" />
          {c.bajada && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 sm:p-8">
              <p className="max-w-xl text-lg font-bold text-white sm:text-3xl">{c.bajada}</p>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-2xl bg-[var(--acento)] px-5 py-10 text-white sm:px-10 sm:py-16">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{nombre}</h1>
          {c.bajada && <p className="mt-3 max-w-xl text-lg text-white/90 sm:text-xl">{c.bajada}</p>}
          <Link href={rutaTienda(t, "/buscar")} className="mt-6 inline-flex h-12 items-center rounded-xl bg-white px-6 font-semibold text-[var(--acento)] hover:bg-white/90">Ver productos</Link>
        </section>
      )}

      {familias.length > 0 && (
        <section>
          <h2 className={`${TITULO} mb-4`}>Categorías</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {familias.map((f) => (
              <Link key={f.id} href={rutaTienda(t, `/familia/${f.id}`)}
                className="flex min-h-[64px] items-center justify-center rounded-2xl border border-gray-200 px-3 py-4 text-center font-semibold text-gray-800 hover:border-[var(--acento)] hover:text-[var(--acento)] transition">
                {f.nombre}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-2">
          <h2 className={TITULO}>Novedades</h2>
          <Link href={rutaTienda(t, "/buscar")} className="text-sm font-semibold text-[var(--acento)] hover:underline">Ver todo →</Link>
        </div>
        {productos.length ? <Grilla t={t} productos={productos} /> : (
          <div className="rounded-2xl bg-gray-50 px-4 py-12 text-center text-gray-500">Pronto vas a encontrar productos acá.</div>
        )}
      </section>
    </div>
  );
}
