// Carrito: las líneas cotizadas (precios y reglas del momento), cantidades
// editables, avisos de stock, descuentos que ya aplican y el total.

import type { Metadata } from "next";
import Link from "next/link";
import { motivoErp } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { leerCarrito } from "@/lib/tienda/carrito";
import { cotizar, type Cotizacion } from "@/lib/tienda/cotizar";
import { rutaTienda } from "@/lib/tienda/tienda";
import { abierta, cargarTienda } from "../catalogo";
import { Aviso, AvisosUrl, BOTON, IconoTacho, TITULO } from "../piezas";
import { cambiarCantidad } from "../acciones";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Carrito" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Carrito({ params, searchParams }: Props) {
  const t = await cargarTienda((await params).slug);
  const sp = await searchParams;
  const carrito = await leerCarrito(t.slug);
  let cot: Cotizacion | null = null, error: string | null = null;
  if (carrito.length) {
    try { cot = await cotizar(t, carrito); } catch (e) { error = motivoErp(e); }
  }
  const m = t.moneda;

  if (!carrito.length || (cot && !cot.lineas.length)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center">
        <AvisosUrl sp={sp} />
        <h1 className={TITULO}>Tu carrito está vacío</h1>
        {carrito.length > 0 && <p className="text-gray-500">Los productos que tenías ya no están disponibles.</p>}
        <Link href={rutaTienda(t, "/buscar")} className={BOTON}>Ver productos</Link>
      </div>
    );
  }

  const boton = (variacion: number, cantidad: number, contenido: React.ReactNode, etiqueta: string, clase: string) => (
    <form action={cambiarCantidad}>
      <input type="hidden" name="slug" value={t.slug} />
      <input type="hidden" name="variacion" value={variacion} />
      <input type="hidden" name="cantidad" value={cantidad} />
      <button type="submit" aria-label={etiqueta} className={clase}>{contenido}</button>
    </form>
  );

  return (
    <div className="space-y-5">
      <h1 className={TITULO}>Tu carrito</h1>
      <AvisosUrl sp={sp} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      {cot && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {cot.sinStock.length > 0 && (
              <Aviso tipo="error">
                <div className="font-semibold">No alcanza el stock:</div>
                <ul className="list-disc pl-5">{cot.sinStock.map((s) => <li key={s}>{s}</li>)}</ul>
                <div>Ajustá las cantidades para seguir.</div>
              </Aviso>
            )}
            {cot.lineas.length < carrito.length && <Aviso>Algún producto ya no está disponible y no se cuenta.</Aviso>}
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
              {cot.lineas.map((l) => (
                <li key={l.variacionId} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <Link href={`${rutaTienda(t, `/producto/${l.productoId}`)}?v=${l.variacionId}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-50 sm:h-24 sm:w-24">
                    {l.foto ? <img src={l.foto} alt="" className="h-full w-full object-contain p-1" /> : null}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex justify-between gap-2">
                      <Link href={`${rutaTienda(t, `/producto/${l.productoId}`)}?v=${l.variacionId}`} className="line-clamp-2 text-sm font-medium text-gray-800 hover:text-[var(--acento)]">{l.titulo}</Link>
                      <div className="shrink-0 text-right font-semibold">{formatear(l.ventaUnit * l.cantidad, m)}</div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {l.listaUnit > l.ventaUnit && <span className="mr-1 line-through">{formatear(l.listaUnit, m)}</span>}
                      {formatear(l.ventaUnit, m)} c/u
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-xl border border-gray-300">
                        {boton(l.variacionId, l.cantidad - 1, "−", "Una menos", "h-10 w-10 text-lg text-gray-700 disabled:opacity-40")}
                        <span className="w-10 text-center font-semibold tabular-nums">{l.cantidad}</span>
                        {l.cantidad < l.disponible
                          ? boton(l.variacionId, l.cantidad + 1, "+", "Una más", "h-10 w-10 text-lg text-gray-700")
                          : <span className="grid h-10 w-10 place-items-center text-lg text-gray-300" title="No hay más stock">+</span>}
                      </div>
                      {boton(l.variacionId, 0, <><IconoTacho /> Quitar</>, "Quitar del carrito",
                        "inline-flex h-10 items-center gap-1 rounded-xl border border-gray-200 px-3 text-sm text-gray-600 hover:border-red-300 hover:text-red-700")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Link href={rutaTienda(t, "/buscar")} className="inline-block text-sm font-semibold text-[var(--acento)] hover:underline">← Seguir comprando</Link>
          </div>

          <aside className="h-fit space-y-3 rounded-2xl bg-gray-50 p-4 sm:p-5 lg:sticky lg:top-36">
            <h2 className="text-lg font-bold">Resumen</h2>
            <div className="flex justify-between text-sm"><span>Productos</span><span className="tabular-nums">{formatear(cot.subtotal, m)}</span></div>
            {cot.descuentos.map((d) => (
              <div key={d.nombre} className="flex justify-between text-sm text-green-700">
                <span>{d.nombre}</span><span className="tabular-nums">{d.importe ? `− ${formatear(d.importe, m)}` : "Envío bonificado"}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-gray-200 pt-3 text-lg font-bold"><span>Total</span><span className="tabular-nums">{formatear(cot.total, m)}</span></div>
            <p className="text-xs text-gray-500">El envío y los descuentos por medio de pago se calculan en el paso siguiente.</p>
            {abierta(t)
              ? (cot.sinStock.length
                ? <span className={`${BOTON} w-full opacity-50`}>Finalizar compra</span>
                : <Link href={rutaTienda(t, "/checkout")} className={`${BOTON} w-full`}>Finalizar compra</Link>)
              : <Aviso>La tienda no está tomando pedidos en este momento.</Aviso>}
          </aside>
        </div>
      )}
    </div>
  );
}
