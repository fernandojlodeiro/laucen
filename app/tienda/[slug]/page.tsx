// Portada de la tienda: banners que pasan solos, carruseles de productos
// (Destacados a mano, Ofertas, Más vendidos, Novedades y lo destacado de las
// categorías con más productos), las categorías con foto y, al pie, atajos chicos. Todo sale del mismo catálogo
// (catalogo.ts) en memoria: una sola cuenta de precios por request.

import Link from "next/link";
import { mediosActivos } from "@/lib/tienda/checkout";
import { cuentaActual } from "@/lib/tienda/cuentas";
import { formatearNumero } from "@/lib/numeros";
import { nombreTienda, rutaTienda } from "@/lib/tienda/tienda";
import { familiasFueraDe, idsDe } from "@/lib/tienda/portada";
import { aTarjetas, arbolDe, cargarTienda, catalogoDe, envioDe, type ProductoBase, type Tarjeta } from "./catalogo";
import { CAJA, IconoCamion, IconoCharla, IconoPersona, IconoTarjeta, IconoTienda, TarjetaProducto } from "./piezas";
import Banners from "./Banners";
import Carrusel from "./Carrusel";
import { headers } from "next/headers";
import { dominioCanonico } from "@/lib/tienda/seo";

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
  const [catalogo, arbol, envio, medios, cuenta, idsDestacados, idsNovedades, fuera] = await Promise.all([catalogoDe(t), arbolDe(t), envioDe(t), mediosActivos(t), cuentaActual(t), idsDe(t.canalId, "destacados"), idsDe(t.canalId, "novedades"), familiasFueraDe(t.canalId)]);
  const nombre = nombreTienda(t);
  const c = t.config;
  const r = (x = "") => rutaTienda(t, x);
  const conStock = catalogo.filter((p) => p.stock > 0);
  // Las categorías que no salen en la portada (Configuración › Portada): fuera de las filas automáticas y de la grilla.
  const afuera = new Set(fuera);
  const enPortada = conStock.filter((p) => !arbol.cadena(p.familiaId).some((f) => afuera.has(f)));
  const raices = arbol.raices.filter((f) => !afuera.has(f.id));

  // Las filas, del mismo catálogo. Destacados y Novedades las elige Fer a mano (Configuración › Portada
  // de la tienda), en su orden; Novedades, sin elegir, son los últimos cargados.
  const porId = new Map(conStock.map((p) => [p.id, p]));
  const elegidos = (ids: number[]) => ids.map((i) => porId.get(i)).filter((p): p is ProductoBase => !!p);
  const destacados = elegidos(idsDestacados);
  const ofertas = enPortada.filter((p) => p.lista > p.venta).sort((a, b) => b.lista / b.venta - a.lista / a.venta).slice(0, CANTIDAD);
  const vendidos = enPortada.filter((p) => p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, CANTIDAD);
  const novedades = idsNovedades.length ? elegidos(idsNovedades) : [...enPortada].sort((a, b) => b.creado - a.creado || b.id - a.id).slice(0, CANTIDAD);
  const principales = [...raices].sort((a, b) => b.total - a.total).slice(0, 3);
  const porCategoria = principales.map((f) => ({
    f, productos: enPortada.filter((p) => arbol.cadena(p.familiaId).includes(f.id)).sort((a, b) => b.vendidos - a.vendidos || b.creado - a.creado).slice(0, CANTIDAD),
  }));
  const todos = new Map<number, ProductoBase>();
  for (const l of [destacados, ofertas, vendidos, novedades, ...porCategoria.map((x) => x.productos)]) for (const p of l) todos.set(p.id, p);
  const tarjetas = new Map((await aTarjetas(t, [...todos.values()])).map((x) => [x.id, x]));
  const de = (l: ProductoBase[]) => l.map((p) => tarjetas.get(p.id)!).filter(Boolean);

  const banners = [c.banner, c.banner_2, c.banner_3].filter((x): x is string => !!x).map((src) => ({ src, alt: c.bajada || nombre }));
  const plata = (n: number) => `$\u00a0${formatearNumero(n, "entero")}`;

  const atajos = [
    cuenta
      ? { titulo: "Mis compras", texto: "Seguí tus pedidos y comprá más rápido.", href: r("/cuenta"), icono: <IconoPersona clase="h-5 w-5" /> }
      : { titulo: "Ingresá a tu cuenta", texto: "Mirá tus pedidos y comprá más rápido.", href: r("/cuenta"), icono: <IconoPersona clase="h-5 w-5" /> },
    { titulo: "Medios de pago", texto: medios.length ? medios.map((m) => m.nombre).slice(0, 3).join(", ") + (medios.length > 3 ? " y más." : ".") : "Consultanos cómo pagar.", href: `${r("/ayuda")}#pagos`, icono: <IconoTarjeta clase="h-5 w-5" /> },
    { titulo: envio.gratisDesde === 0 ? "Envío gratis" : envio.gratisDesde != null ? `Envío gratis desde ${plata(envio.gratisDesde)}` : envio.aDomicilio ? "Envíos" : "Retiro",
      texto: envio.aDomicilio ? (envio.aDomicilio.plazo || "Te lo mandamos a tu casa.") : envio.retiro ? `Retirá en ${envio.retiro.nombre}.` : "Coordinamos la entrega con vos.", href: `${r("/ayuda")}#envios`, icono: <IconoCamion clase="h-5 w-5" /> },
    { titulo: "Más vendidos", texto: "Lo que más se llevan nuestros clientes.", href: `${r("/buscar")}?orden=vendidos`, icono: <IconoTienda clase="h-5 w-5" /> },
    { titulo: "Ayuda", texto: c.horario ? `Te atendemos ${c.horario.charAt(0).toLowerCase()}${c.horario.slice(1)}.` : "¿Tenés dudas? Escribinos.", href: r("/ayuda"), icono: <IconoCharla clase="h-5 w-5" /> },
  ];

  // Para los buscadores (bitácora #856): quién es la tienda y cómo se busca en ella.
  const dominio = await dominioCanonico(t, (await headers()).get("host"));
  const datos = dominio ? [
    { "@context": "https://schema.org", "@type": "Organization", name: nombre, url: `https://${dominio}/`, ...(c.logo ? { logo: c.logo } : {}),
      ...(c.email ? { email: c.email } : {}) },
    { "@context": "https://schema.org", "@type": "WebSite", name: nombre, url: `https://${dominio}/`,
      potentialAction: { "@type": "SearchAction", target: `https://${dominio}/buscar?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  ] : [];

  return (
    <div className="space-y-10">
      {datos.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, "\\u003c") }} />}
      {/* Banners a todo el ancho. */}
      {/* Pegado al encabezado y con la primera fila subiendo sobre su borde de abajo (Fer, 24/10: le sobraba lugar). */}
      <div className="relative left-1/2 -mb-5 -mt-4 w-screen -translate-x-1/2 sm:-mb-8 sm:-mt-6">
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
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-[var(--fondo)] to-transparent" />
          </div>
        )}
      </div>

      {!catalogo.length && (
        <div className={`${CAJA} px-4 py-12 text-center text-[var(--texto-2)]`}>Pronto vas a encontrar productos acá.</div>
      )}

      <Fila t={t} titulo="Destacados" productos={de(destacados)} />
      <Fila t={t} titulo="Novedades" ver={{ texto: "Ver todo", href: r("/buscar") }} productos={de(novedades)} />
      <Fila t={t} titulo="Ofertas" ver={{ texto: "Ver todas", href: `${r("/buscar")}?ofertas=1` }} productos={de(ofertas)} />
      <Fila t={t} titulo="Más vendidos" ver={{ texto: "Ver más", href: `${r("/buscar")}?orden=vendidos` }} productos={de(vendidos)} />

      {raices.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-normal text-[var(--texto)] sm:text-[26px]">Categorías</h2>
          <div className={`${CAJA} grid grid-cols-3 overflow-hidden sm:grid-cols-4 lg:grid-cols-6`}>
            {raices.slice(0, 18).map((f) => (
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

      {/* Atajos chicos, al pie de la portada (cuenta, pagos, envíos, más vendidos, ayuda). */}
      <section aria-label="Atajos" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {atajos.map((a) => (
          <Link key={a.titulo} href={a.href} className={`${CAJA} flex items-center gap-3 p-3 transition-shadow hover:shadow-[0_7px_16px_0_rgba(0,0,0,.2)]`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--boton-claro)] text-[var(--boton)]">{a.icono}</span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-[var(--texto)]">{a.titulo}</span>
              <span className="line-clamp-2 text-[11px] leading-snug text-[var(--texto-2)]">{a.texto}</span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
