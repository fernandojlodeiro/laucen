// Marco de la tienda pública: encabezado (logo, buscador, cuenta, carrito),
// menú de familias, pie con el contacto y el botón flotante de WhatsApp. El
// color de la tienda va como variable CSS --acento para todas las páginas.

import type { Metadata } from "next";
import Link from "next/link";
import { leerCarrito } from "@/lib/tienda/carrito";
import { nombreTienda, rutaTienda } from "@/lib/tienda/tienda";
import { abierta, cargarTienda, colorDe, familiasRaiz, linkWhatsapp } from "./catalogo";
import { IconoCarrito, IconoLupa, IconoPersona, IconoWhatsapp } from "./piezas";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await cargarTienda((await params).slug);
  const nombre = nombreTienda(t);
  return { title: { default: nombre, template: `%s · ${nombre}` }, description: t.config.bajada || `Tienda online de ${nombre}` };
}

export default async function LayoutTienda({ children, params }: Props & { children: React.ReactNode }) {
  const { slug } = await params;
  const t = await cargarTienda(slug);
  const [carrito, familias] = await Promise.all([leerCarrito(t.slug), familiasRaiz(t.organizacionId)]);
  const unidades = carrito.reduce((s, l) => s + l.cantidad, 0);
  const nombre = nombreTienda(t);
  const wa = linkWhatsapp(t, `Hola ${nombre}, tengo una consulta.`);
  const c = t.config;

  const buscador = (clase: string) => (
    <form action={rutaTienda(t, "/buscar")} role="search" className={clase}>
      <div className="relative">
        <input name="q" type="search" placeholder="¿Qué estás buscando?" aria-label="Buscar productos"
          className="w-full h-11 rounded-full border border-gray-200 bg-gray-50 pl-4 pr-12 text-base outline-none focus:bg-white focus:border-[var(--acento)]" />
        <button type="submit" aria-label="Buscar" className="absolute right-1 top-1 h-9 w-9 grid place-items-center rounded-full bg-[var(--acento)] text-white"><IconoLupa /></button>
      </div>
    </form>
  );

  return (
    <div style={{ "--acento": colorDe(t) } as React.CSSProperties} className="min-h-screen flex flex-col bg-white text-gray-900 overflow-x-hidden">
      {!abierta(t) && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">La tienda no está tomando pedidos en este momento.</div>
      )}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 h-16">
          <Link href={rutaTienda(t)} className="flex items-center min-w-0 shrink-0 max-w-[55%] sm:max-w-none">
            {c.logo
              ? <img src={c.logo} alt={nombre} className="h-10 w-auto max-w-[180px] object-contain" />
              : <span className="truncate text-xl font-extrabold tracking-tight text-[var(--acento)]">{nombre}</span>}
          </Link>
          {buscador("hidden md:block flex-1 max-w-xl mx-auto")}
          <nav className="ml-auto flex items-center gap-1">
            <Link href={rutaTienda(t, "/cuenta")} className="flex items-center gap-1.5 rounded-full px-2 h-11 text-gray-700 hover:text-[var(--acento)]">
              <IconoPersona /><span className="hidden sm:inline text-sm font-medium">Mi cuenta</span>
            </Link>
            <Link href={rutaTienda(t, "/carrito")} aria-label={`Carrito: ${unidades} unidades`} className="relative grid h-11 w-11 place-items-center rounded-full text-gray-700 hover:text-[var(--acento)]">
              <IconoCarrito />
              {unidades > 0 && (
                <span className="absolute right-0.5 top-0.5 min-w-[20px] h-5 rounded-full bg-[var(--acento)] px-1 text-center text-xs font-bold leading-5 text-white">{unidades > 99 ? "99+" : unidades}</span>
              )}
            </Link>
          </nav>
        </div>
        {buscador("md:hidden px-4 pb-3")}
        {familias.length > 0 && (
          <nav aria-label="Familias" className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
            <ul className="flex gap-2 whitespace-nowrap text-sm">
              {familias.map((f) => (
                <li key={f.id}>
                  <Link href={rutaTienda(t, `/familia/${f.id}`)} className="inline-block rounded-full border border-gray-200 px-3 py-1.5 text-gray-700 hover:border-[var(--acento)] hover:text-[var(--acento)]">{f.nombre}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:py-8">{children}</main>

      <footer className="mt-10 border-t border-gray-100 bg-gray-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-gray-600 sm:grid-cols-3">
          <div>
            <div className="text-base font-bold text-gray-900">{nombre}</div>
            {c.bajada && <p className="mt-1">{c.bajada}</p>}
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-gray-900">Contacto</div>
            {c.email && <div><a href={`mailto:${c.email}`} className="hover:text-[var(--acento)]">{c.email}</a></div>}
            {wa && <div><a href={wa} target="_blank" rel="noopener" className="hover:text-[var(--acento)]">WhatsApp</a></div>}
            {c.direccion && <div>{c.direccion}</div>}
            {c.horario && <div>{c.horario}</div>}
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-gray-900">Tu compra</div>
            <div><Link href={rutaTienda(t, "/cuenta")} className="hover:text-[var(--acento)]">Mi cuenta y mis pedidos</Link></div>
            <div><Link href={rutaTienda(t, "/carrito")} className="hover:text-[var(--acento)]">Carrito</Link></div>
          </div>
        </div>
      </footer>

      {wa && (
        <a href={wa} target="_blank" rel="noopener" aria-label="Escribinos por WhatsApp"
          className="fixed bottom-4 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg hover:scale-105 transition">
          <IconoWhatsapp />
        </a>
      )}
    </div>
  );
}
