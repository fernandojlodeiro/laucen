// Ayuda: cómo comprar, formas de entrega, medios de pago, devoluciones y
// garantía (los textos de Configuración → Tienda web) y contacto. Todo sale de
// lo que la tienda tiene cargado; nada inventado.

import type { Metadata } from "next";
import Link from "next/link";
import { formatearNumero } from "@/lib/numeros";
import { mediosActivos } from "@/lib/tienda/checkout";
import { nombreTienda, rutaTienda } from "@/lib/tienda/tienda";
import { cargarTienda, envioDe, linkWhatsapp } from "../catalogo";
import { metodosEnvio } from "../resumen";
import { CAJA, IconoWhatsapp, LINK } from "../piezas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ayuda" };

export default async function Ayuda({ params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const [metodos, medios, envio] = await Promise.all([metodosEnvio(t), mediosActivos(t), envioDe(t)]);
  const c = t.config;
  const nombre = nombreTienda(t);
  const wa = linkWhatsapp(t, `Hola ${nombre}, tengo una consulta.`);
  const seccion = `${CAJA} scroll-mt-4 space-y-3 p-5 sm:p-8`;
  const h2 = "text-xl font-semibold text-[var(--texto)]";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--texto)]">¿Con qué podemos ayudarte?</h1>

      <section className={seccion}>
        <h2 className={h2}>Cómo comprar</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-[var(--texto)]">
          <li>Buscá el producto con el buscador de arriba o desde <Link href={rutaTienda(t, "/buscar")} className={LINK}>todas las categorías</Link>.</li>
          <li>En la ficha elegí la variante y la cantidad, y tocá <b>Comprar ahora</b> o <b>Agregar al carrito</b>.</li>
          <li>En el carrito tocá <b>Continuar compra</b>, completá tus datos, cómo lo recibís y cómo pagás.</li>
          <li>Al confirmar te mostramos tu pedido con su número y cómo sigue. No hace falta tener cuenta.</li>
        </ol>
      </section>

      <section id="envios" className={seccion}>
        <h2 className={h2}>Envíos y retiros</h2>
        {envio.gratisDesde != null && (
          <p className="font-semibold text-[var(--verde)]">{envio.gratisDesde === 0 ? "El envío es gratis." : `Envío gratis en compras desde $ ${formatearNumero(envio.gratisDesde, "entero")}.`}</p>
        )}
        {metodos.filter((m) => m.disponible).length ? (
          <ul className="divide-y divide-[var(--linea)]">
            {metodos.filter((m) => m.disponible).map((m) => (
              <li key={m.id} className="py-3">
                <p className="font-semibold text-[var(--texto)]">{m.nombre}</p>
                {m.plazo && <p className="text-sm text-[var(--texto-2)]">{m.plazo}</p>}
                {m.instrucciones && <p className="mt-1 whitespace-pre-line text-sm text-[var(--texto-2)]">{m.instrucciones}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="text-[var(--texto-2)]">Escribinos y coordinamos la entrega.</p>}
      </section>

      <section id="pagos" className={seccion}>
        <h2 className={h2}>Medios de pago</h2>
        {medios.length ? (
          <ul className="space-y-2">
            {medios.map((m) => (
              <li key={m.tipo} className="flex flex-wrap items-center gap-2 text-[var(--texto)]">
                {m.nombre}
                {m.descuento_pct > 0 && <span className="rounded bg-[var(--verde)] px-1.5 py-0.5 text-xs font-semibold text-white">{m.descuento_pct.toLocaleString("es-AR")}% de descuento</span>}
                {m.descuento_pct < 0 && <span className="rounded bg-black/[.07] px-1.5 py-0.5 text-xs font-semibold">{(-m.descuento_pct).toLocaleString("es-AR")}% de recargo</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-[var(--texto-2)]">Escribinos y te contamos cómo pagar.</p>}
        <p className="text-sm text-[var(--texto-2)]">Las cuotas disponibles de cada producto están en su ficha.</p>
      </section>

      {(c.devoluciones || c.garantia) && (
        <section id="devoluciones" className={seccion}>
          <h2 className={h2}>Devoluciones y garantía</h2>
          {c.devoluciones && <div><p className="font-semibold text-[var(--texto)]">Devoluciones</p><p className="whitespace-pre-line text-[var(--texto-2)]">{c.devoluciones}</p></div>}
          {c.garantia && <div><p className="font-semibold text-[var(--texto)]">Garantía</p><p className="whitespace-pre-line text-[var(--texto-2)]">{c.garantia}</p></div>}
        </section>
      )}

      <section id="contacto-ayuda" className={seccion}>
        <h2 className={h2}>Contacto</h2>
        <ul className="space-y-1.5 text-[var(--texto)]">
          {c.email && <li>Mail: <a href={`mailto:${c.email}`} className={LINK}>{c.email}</a></li>}
          {c.direccion && <li>Dirección: {c.direccion}</li>}
          {c.horario && <li>Horario: {c.horario}</li>}
        </ul>
        {wa && (
          <a href={wa} target="_blank" rel="noopener" className="inline-flex h-11 items-center gap-2 rounded-md bg-[#25D366] px-5 font-semibold text-white hover:brightness-105">
            <IconoWhatsapp clase="h-5 w-5" /> Escribinos por WhatsApp
          </a>
        )}
      </section>
    </div>
  );
}
