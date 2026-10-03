// Portada de la tienda: banners que pasan solos, atajos, carruseles de
// productos (Ofertas, Más vendidos, Novedades y lo destacado de las categorías
// con más productos) y las categorías con foto. Todo sale del mismo catálogo
// (catalogo.ts) en memoria: una sola cuenta de precios por request.

import Link from "next/link";
import { mediosActivos } from "@/lib/tienda/checkout";
import { cuentaActual } from "@/lib/tienda/cuentas";
import { formatearNumero } from "@/lib/numeros";
import { nombreTienda, rutaTienda } from "@/lib/tienda/tienda";
import { aTarjetas, arbolDe, cargarTienda, catalogoDe, envioDe, type ProductoBase, type Tarjeta } from "./catalogo";
import { CAJA, IconoCamion, IconoCharla, IconoPersona, IconoTarjeta, IconoTienda, TarjetaProducto } from "./piezas";
import Banners from "./Banners";
import Carrusel from "./Carrusel";

export const dynamic = "force-dynamic";

const CANTIDAD = 12;

function Fila({ titulo, ver, productos, t }: { titulo: string; ver?: { texto: string; href: string }; productos: Tarjeta[]; t: Parameters<typeof TarjetaProducto>[0]["t"] }) {
  if (!productos.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-4">
        <h2 className="text-xl font-normal text-[var(--texto)] sm:text-[26px]">{titulo}</h2>
        {ver && <Link href={ver.href} className="text-sm text-[var(--boton)] hover:text-[var(--boton-hover)] sm:text-base">{ver.texto}</Link>}
      </div>
      <Carrusel etiqueta={titulo}>
        {productos.map((p) => <TarjetaProducto key={p.id} t={t} p={p} />)}
      </Carrusel>
    </section>
  );
}

export default async function InicioTienda({ params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const [catalogo, arbol, envio, medios, cuenta] = await Promise.all([catalogoDe(t), arbolDe(t), envioDe(t), mediosActivos(t), cuentaActual(t)]);
  const nombre = nombreTienda(t);
  const c = t.config;
  const r = (x = "") => rutaTienda(t, x);
  const conStock = catalogo.filter((p) => p.stock > 0);

  // Las filas, del mismo catálogo.
  const ofertas = conStock.filter((p) => p.lista > p.venta).sort((a, b) => b.lista / b.venta - a.lista / a.venta).slice(0, CANTIDAD);
  const vendidos = conStock.filter((p) => p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, CANTIDAD);
  const novedades = [...conStock].sort((a, b) => b.creado - a.creado || b.id - a.id).slice(0, CANTIDAD);
  const principales = [...arbol.raices].sort((a, b) => b.total - a.total).slice(0, 3);
  const porCategoria = principales.map((f) => ({
    f, productos: conStock.filter((p) => arbol.cadena(p.familiaId).includes(f.id)).sort((a, b) => b.vendidos - a.vendidos || b.creado - a.creado).slice(0, CANTIDAD),
  }));
  const todos = new Map<number, ProductoBase>();
  for (const l of [ofertas, vendidos, novedades, ...porCategoria.map((x) => x.productos)]) for (const p of l) todos.set(p.id, p);
  const tarjetas = new Map((await aTarjetas(t, [...todos.values()])).map((x) => [x.id, x]));
  const de = (l: ProductoBase[]) => l.map((p) => tarjetas.get(p.id)!).filter(Boolean);

  const banners = [c.banner, c.banner_2, c.banner_3].filter((x): x is string => !!x).map((src) => ({ src, alt: c.bajada || nombre }));
  const plata = (n: number) => `$\u00a0${formatearNumero(n, "entero")}`;

  const atajos = [
    cuenta
      ? { titulo: "Mis compras", texto: "Seguí tus pedidos y comprá más rápido.", boton: "Ver mis compras", href: r("/cuenta"), icono: <IconoPersona clase="h-8 w-8" /> }
      : { titulo: "Ingresá a tu cuenta", texto: "Mirá tus pedidos y comprá más rápido.", boton: "Ingresar", href: r("/cuenta"), icono: <IconoPersona clase="h-8 w-8" /> },
    { titulo: "Medios de pago", texto: medios.length ? medios.map((m) => m.nombre).slice(0, 3).join(", ") + (medios.length > 3 ? " y más." : ".") : "Consultanos cómo pagar.",
      boton: "Ver medios de pago", href: `${r("/ayuda")}#pagos`, icono: <IconoTarjeta clase="h-8 w-8" /> },
    { titulo: envio.gratisDesde === 0 ? "Envío gratis" : envio.gratisDesde != null ? `Envío gratis desde ${plata(envio.gratisDesde)}` : envio.aDomicilio ? "Envíos" : "Retiro",
      texto: envio.aDomicilio ? (envio.aDomicilio.plazo || "Te lo mandamos a tu casa.") : envio.retiro ? `Retirá en ${envio.retiro.nombre}.` : "Coordinamos la entrega con vos.",
      boton: "Ver formas de entrega", href: `${r("/ayuda")}#envios`, icono: <IconoCamion clase="h-8 w-8" /> },
    { titulo: "Más vendidos", texto: "Lo que más se llevan nuestros clientes.", boton: "Ver más vendidos", href: `${r("/buscar")}?orden=vendidos`, icono: <IconoTienda clase="h-8 w-8" /> },
    { titulo: "Ayuda", texto: c.horario ? `Te atendemos ${c.horario.charAt(0).toLowerCase()}${c.horario.slice(1)}.` : "¿Tenés dudas? Escribinos.", boton: "Ir a ayuda", href: r("/ayuda"), icono: <IconoCharla clase="h-8 w-8" /> },
  ];

  return (
    <div className="space-y-10">
      {/* Banners a todo el ancho, por debajo de los atajos. */}
      <div className="relative left-1/2 -mt-4 w-screen -translate-x-1/2 sm:-mt-6">
        {banners.length ? <Banners banners={banners} /> : (
          <div className="relative h-[150px] overflow-hidden bg-[var(--marca)] sm:h-[260px] lg:h-[340px]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(255,255,255,.55),transparent_60%)]" />
            <div className="relative mx-auto flex h-full max-w-[1200px] items-center gap-6 px-6 pb-[6%] text-[var(--marca-texto)]">
              <div className="flex-1">
                <p className="text-2xl font-semibold leading-tight sm:text-4xl lg:text-5xl">{nombre}</p>
                {c.bajada && <p className="mt-2 max-w-xl text-sm opacity-80 sm:text-xl">{c.bajada}</p>}
                <Link href={r("/buscar")} className="mt-4 hidden h-11 items-center rounded-md bg-[var(--boton)] px-6 font-semibold text-white hover:bg-[var(--boton-hover)] sm:inline-flex">Ver todos los productos</Link>
              </div>
              {c.logo && <img src={c.logo} alt="" className="hidden max-h-[60%] max-w-[30%] object-contain opacity-90 sm:block" />}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[var(--fondo)] to-transparent" />
          </div>
        )}
      </div>

      {/* Atajos, montados sobre el borde de los banners. */}
      <div className="relative z-10 -mt-12 sm:-mt-28">
        <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-5 [&::-webkit-scrollbar]:hidden">
          {atajos.map((a) => (
            <Link key={a.titulo} href={a.href} className={`${CAJA} flex w-[200px] shrink-0 flex-col items-center gap-2 p-4 text-center transition-shadow hover:shadow-[0_7px_16px_0_rgba(0,0,0,.2)] sm:w-auto`}>
              <p className="text-sm font-semibold text-[var(--texto)]">{a.titulo}</p>
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--boton-claro)] text-[var(--boton)]">{a.icono}</span>
              <p className="line-clamp-2 min-h-[2.5em] text-xs text-[var(--texto-2)]">{a.texto}</p>
              <span className="mt-auto rounded-md bg-[var(--boton)] px-3 py-1.5 text-xs font-semibold text-white">{a.boton}</span>
            </Link>
          ))}
        </div>
      </div>

      {!catalogo.length && (
        <div className={`${CAJA} px-4 py-12 text-center text-[var(--texto-2)]`}>Pronto vas a encontrar productos acá.</div>
      )}

      <Fila t={t} titulo="Ofertas" ver={{ texto: "Ver todas", href: `${r("/buscar")}?ofertas=1` }} productos={de(ofertas)} />
      <Fila t={t} titulo="Más vendidos" ver={{ texto: "Ver más", href: `${r("/buscar")}?orden=vendidos` }} productos={de(vendidos)} />
      <Fila t={t} titulo="Novedades" ver={{ texto: "Ver todo", href: r("/buscar") }} productos={de(novedades)} />

      {arbol.raices.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-normal text-[var(--texto)] sm:text-[26px]">Categorías</h2>
          <div className={`${CAJA} grid grid-cols-3 overflow-hidden sm:grid-cols-4 lg:grid-cols-6`}>
            {arbol.raices.slice(0, 18).map((f) => (
              <Link key={f.id} href={r(`/familia/${f.id}`)}
                className="group flex flex-col items-center gap-2 border-b border-r border-[var(--linea)] p-4 text-center hover:shadow-[inset_0_0_0_1px_var(--linea)]">
                <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-[var(--fondo)] sm:h-20 sm:w-20">
                  {f.foto ? <img src={f.foto} alt="" loading="lazy" className="h-full w-full object-contain p-2 mix-blend-multiply" /> : <IconoTienda clase="h-8 w-8 text-[var(--texto-2)]" />}
                </span>
                <span className="line-clamp-2 text-xs text-[var(--texto)] group-hover:text-[var(--boton)] sm:text-sm">{f.nombre}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {porCategoria.map(({ f, productos }) => (
        <Fila key={f.id} t={t} titulo={`Destacados en ${f.nombre}`} ver={{ texto: "Ver más", href: r(`/familia/${f.id}`) }} productos={de(productos)} />
      ))}
    </div>
  );
}
