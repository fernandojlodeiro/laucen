// Carrito: las líneas cotizadas (precios y reglas del momento), cantidades
// con − y +, avisos de stock, descuentos que ya aplican y, a la derecha, el
// "Resumen de compra" con "Continuar compra".

import type { Metadata } from "next";
import Link from "next/link";
import { motivoErp } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { leerCarrito } from "@/lib/tienda/carrito";
import { cotizar, type Cotizacion } from "@/lib/tienda/cotizar";
import { rutaTienda } from "@/lib/tienda/tienda";
import { abierta, cargarTienda, envioDe } from "../catalogo";
import { Aviso, AvisosUrl, BOTON, CAJA, IconoCarrito, IconoTacho, LINK, Monto } from "../piezas";
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
      <div className="mx-auto max-w-3xl space-y-4">
        <AvisosUrl sp={sp} />
        <div className={`${CAJA} flex flex-col items-center gap-3 px-6 py-14 text-center`}>
          <span className="grid h-20 w-20 place-items-center rounded-full bg-[var(--boton-claro)] text-[var(--boton)]"><IconoCarrito clase="h-10 w-10" /></span>
          <h1 className="text-xl font-semibold text-[var(--texto)]">Tu carrito está vacío</h1>
          <p className="text-sm text-[var(--texto-2)]">{carrito.length > 0 ? "Los productos que tenías ya no están disponibles." : "Sumá productos y conseguí envío gratis en las compras que califican."}</p>
          <Link href={rutaTienda(t, "/buscar")} className={LINK}>Descubrir productos</Link>
        </div>
      </div>
    );
  }

  const envio = await envioDe(t);
  const boton = (variacion: number, cantidad: number, contenido: React.ReactNode, etiqueta: string, clase: string) => (
    <form action={cambiarCantidad}>
      <input type="hidden" name="slug" value={t.slug} />
      <input type="hidden" name="variacion" value={variacion} />
      <input type="hidden" name="cantidad" value={cantidad} />
      <button type="submit" aria-label={etiqueta} className={clase}>{contenido}</button>
    </form>
  );
  const unidades = cot?.lineas.reduce((s, l) => s + l.cantidad, 0) ?? 0;
  const faltaParaGratis = cot && envio.gratisDesde != null && envio.gratisDesde > 0 ? envio.gratisDesde - cot.total : null;

  return (
    <div className="space-y-4">
      <AvisosUrl sp={sp} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      {cot && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_350px]">
          <div className="space-y-3">
            {cot.sinStock.length > 0 && (
              <Aviso tipo="error">
                <div className="font-semibold">No alcanza el stock:</div>
                <ul className="list-disc pl-5">{cot.sinStock.map((s) => <li key={s}>{s}</li>)}</ul>
                <div>Ajustá las cantidades para seguir.</div>
              </Aviso>
            )}
            {cot.lineas.length < carrito.length && <Aviso>Algún producto ya no está disponible y no se cuenta.</Aviso>}
            <section className={CAJA}>
              <h1 className="border-b border-[var(--linea)] px-4 py-4 text-base font-semibold text-[var(--texto)] sm:px-6">Productos</h1>
              <ul>
                {cot.lineas.map((l) => {
                  const href = `${rutaTienda(t, `/producto/${l.productoId}`)}?v=${l.variacionId}`;
                  return (
                    <li key={l.variacionId} className="flex gap-4 border-b border-[var(--linea)] px-4 py-5 last:border-b-0 sm:px-6">
                      <Link href={href} className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-[var(--linea)] bg-white sm:h-20 sm:w-20">
                        {l.foto ? <img src={l.foto} alt="" className="h-full w-full object-contain p-1" /> : null}
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <Link href={href} className="line-clamp-2 text-sm font-semibold text-[var(--texto)] hover:text-[var(--boton)] sm:text-base">{l.titulo}</Link>
                          <div className="mt-2">
                            {boton(l.variacionId, 0, <><IconoTacho /> Eliminar</>, "Eliminar del carrito",
                              "inline-flex items-center gap-1 text-sm text-[var(--boton)] hover:text-[var(--boton-hover)]")}
                          </div>
                        </div>
                        <div className="flex flex-col items-start sm:items-center">
                          <div className="flex h-9 items-center rounded-md border border-black/25">
                            {boton(l.variacionId, l.cantidad - 1, "−", "Una menos", "grid h-9 w-9 place-items-center text-lg text-[var(--boton)]")}
                            <span className="w-8 text-center text-sm tabular-nums text-[var(--texto)]" aria-label={`${l.cantidad} unidades`}>{l.cantidad}</span>
                            {l.cantidad < l.disponible
                              ? boton(l.variacionId, l.cantidad + 1, "+", "Una más", "grid h-9 w-9 place-items-center text-lg text-[var(--boton)]")
                              : <span className="grid h-9 w-9 place-items-center text-lg text-black/25" title="No hay más stock">+</span>}
                          </div>
                          <span className="mt-1 text-xs text-[var(--texto-2)]">{l.disponible === 1 ? "1 disponible" : `${formatearNumero(l.disponible, "entero")} disponibles`}</span>
                        </div>
                        <div className="text-left sm:w-[130px] sm:text-right">
                          {l.listaUnit > l.ventaUnit && (
                            <div className="flex items-center gap-1 sm:justify-end">
                              <span className="text-xs text-[var(--verde)]">-{Math.round((1 - l.ventaUnit / l.listaUnit) * 100)}%</span>
                              <Monto n={l.listaUnit * l.cantidad} moneda={m} tachado className="text-xs text-[var(--texto-2)]" />
                            </div>
                          )}
                          <Monto n={l.ventaUnit * l.cantidad} moneda={m} className="text-xl text-[var(--texto)]" />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {faltaParaGratis != null && (
                <div className="border-t border-[var(--linea)] px-4 py-4 text-sm sm:px-6">
                  {faltaParaGratis <= 0
                    ? <p className="font-semibold text-[var(--verde)]">¡Tu compra tiene envío gratis!</p>
                    : <p className="text-[var(--texto)]">Sumá <Monto n={faltaParaGratis} moneda={m} /> más para tener <span className="font-semibold text-[var(--verde)]">envío gratis</span>.</p>}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                    <div className="h-full rounded-full bg-[var(--verde)]" style={{ width: `${Math.min(100, Math.max(4, (cot.total / envio.gratisDesde!) * 100))}%` }} />
                  </div>
                </div>
              )}
            </section>
            <Link href={rutaTienda(t, "/buscar")} className={`${LINK} inline-block text-sm`}>Seguir comprando</Link>
          </div>

          <aside className={`${CAJA} lg:sticky lg:top-4`}>
            <h2 className="border-b border-[var(--linea)] px-6 py-4 text-base font-semibold text-[var(--texto)]">Resumen de compra</h2>
            <div className="space-y-3 px-6 py-5 text-sm text-[var(--texto)]">
              <div className="flex justify-between gap-2"><span>{unidades === 1 ? "Producto" : `Productos (${unidades})`}</span><Monto n={cot.subtotal} moneda={m} /></div>
              {cot.descuentos.map((d) => (
                <div key={d.nombre} className="flex justify-between gap-2 text-[var(--verde)]">
                  <span>{d.nombre}</span><span className="tabular-nums">{d.importe ? <>− <Monto n={d.importe} moneda={m} /></> : "Envío bonificado"}</span>
                </div>
              ))}
              <div className="flex justify-between gap-2">
                <span>Envío</span>
                <span className="text-right text-[var(--texto-2)]">{faltaParaGratis != null && faltaParaGratis <= 0 ? <span className="text-[var(--verde)]">Gratis</span> : "Se calcula en el paso siguiente"}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 pt-2 text-lg font-semibold"><span>Total</span><Monto n={cot.total} moneda={m} /></div>
              {abierta(t)
                ? (cot.sinStock.length
                  ? <span className={`${BOTON} mt-2 w-full cursor-not-allowed opacity-50`}>Continuar compra</span>
                  : <Link href={rutaTienda(t, "/checkout")} className={`${BOTON} mt-2 w-full`}>Continuar compra</Link>)
                : <Aviso>La tienda no está tomando pedidos en este momento.</Aviso>}
              <p className="text-xs text-[var(--texto-2)]">Los descuentos por medio de pago se aplican en el paso siguiente.</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
