// Marco de la tienda pública, con la experiencia de compra de los grandes
// marketplaces: franja de color con logo, buscador grande con sugerencias,
// cuenta, compras y carrito; abajo "Enviar a …", el menú de categorías y los
// atajos (Ofertas, Más vendidos, Ayuda). Pie con links, contacto y datos
// fiscales. Todos los colores son variables CSS de la tienda (tema.ts).

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { una } from "@/lib/erp/base";
import { leerCarrito } from "@/lib/tienda/carrito";
import { cuentaActual } from "@/lib/tienda/cuentas";
import { nombreTienda, rutaTienda } from "@/lib/tienda/tienda";
import { abierta, arbolDe, arbolParaMenu, cargarTienda, linkWhatsapp } from "./catalogo";
import { IconoCarrito, IconoWhatsapp } from "./piezas";
import { variablesTema } from "./tema";
import Buscador from "./encabezado/Buscador";
import EnviarA from "./encabezado/EnviarA";
import { MenuCategorias, MenuMovil } from "./encabezado/Menus";

export const dynamic = "force-dynamic";

const fuente = Inter({ subsets: ["latin"], display: "swap", weight: ["300", "400", "500", "600", "700"] });

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await cargarTienda((await params).slug);
  const nombre = nombreTienda(t);
  return { title: { default: nombre, template: `%s · ${nombre}` }, description: t.config.bajada || `Tienda online de ${nombre}` };
}

const CONDICION_IVA: Record<string, string> = { responsable_inscripto: "IVA Responsable Inscripto", monotributo: "Monotributo", exento: "IVA Exento" };

export default async function LayoutTienda({ children, params }: Props & { children: React.ReactNode }) {
  const { slug } = await params;
  const t = await cargarTienda(slug);
  const [carrito, arbol, cuenta, galletas, emisor] = await Promise.all([
    leerCarrito(t.slug), arbolDe(t), cuentaActual(t), cookies(),
    una<{ razon_social: string; cuit: string; condicion_iva: string; domicilio: string | null }>(
      "select razon_social, cuit, condicion_iva, domicilio from emisor where organizacion_id = $1 and es_principal", [t.organizacionId]),
  ]);
  const direccion = cuenta ? await una<{ localidad: string | null; codigo_postal: string | null }>(
    "select localidad, codigo_postal from cliente_direccion where cliente_id = $1 and organizacion_id = $2 order by principal desc, id desc limit 1",
    [cuenta.clienteId, t.organizacionId]) : null;
  const unidades = carrito.reduce((s, l) => s + l.cantidad, 0);
  const nombre = nombreTienda(t);
  const wa = linkWhatsapp(t, `Hola ${nombre}, tengo una consulta.`);
  const c = t.config;
  const r = (x = "") => rutaTienda(t, x);
  const menu = arbolParaMenu(arbol.raices);
  const primerNombre = cuenta?.nombre.split(" ")[0] ?? null;

  // "Enviar a …": la dirección del comprador con cuenta, o el código postal que cargó.
  const cp = direccion?.codigo_postal || galletas.get(`cp_${t.slug}`)?.value || "";
  const [linea1, linea2] = direccion?.localidad
    ? [`Enviar a ${primerNombre}`, `${direccion.localidad} ${direccion.codigo_postal ?? ""}`.trim()]
    : cp ? [primerNombre ? `Enviar a ${primerNombre}` : "Enviar a", `CP ${cp}`]
    : ["Ingresá tu", "código postal"];

  const logo = (clase: string) => (
    <Link href={r()} className={`flex shrink-0 items-center ${clase}`} aria-label={`${nombre}: inicio`}>
      {c.logo
        ? <img src={c.logo} alt={nombre} className="h-[34px] w-auto max-w-[150px] object-contain" />
        : <span className="truncate text-xl font-bold tracking-tight text-[var(--marca-texto)]">{nombre}</span>}
    </Link>
  );
  const carritoBoton = (
    <Link href={r("/carrito")} aria-label={`Carrito: ${unidades} ${unidades === 1 ? "producto" : "productos"}`}
      className="relative grid h-10 w-10 place-items-center text-[var(--marca-texto)]">
      <IconoCarrito clase="h-6 w-6" />
      {unidades > 0 && (
        <span className="absolute right-0 top-0.5 min-w-[18px] rounded-full bg-[var(--marca-texto)] px-1 text-center text-[11px] font-semibold leading-[18px] text-[var(--marca)]">
          {unidades > 99 ? "99+" : unidades}
        </span>
      )}
    </Link>
  );
  const linkNav = "text-sm text-[var(--marca-texto)] opacity-80 hover:opacity-100";

  return (
    <div style={variablesTema(t)} className={`${fuente.className} flex min-h-screen flex-col overflow-x-hidden bg-[var(--fondo)] text-[var(--texto)] antialiased`}>
      {!abierta(t) && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">La tienda no está tomando pedidos en este momento.</div>
      )}

      <header className="relative z-40 bg-[var(--marca)] shadow-[0_1px_0_rgba(0,0,0,.1)]">
        {/* Compu */}
        <div className="mx-auto hidden max-w-[1200px] px-4 lg:block">
          <div className="flex h-[58px] items-center gap-8 pt-2">
            {logo("w-[160px]")}
            <div className="max-w-[600px] flex-1"><Buscador slug={t.slug} accion={r("/buscar")} /></div>
            <div className="hidden w-[300px] truncate text-right text-sm text-[var(--marca-texto)] opacity-80 xl:block">{c.bajada}</div>
          </div>
          <div className="flex h-[44px] items-center gap-8">
            <div className="w-[160px] shrink-0"><EnviarA slug={t.slug} linea1={linea1} linea2={linea2} cp={cp} /></div>
            <nav aria-label="Tienda" className="flex flex-1 items-center gap-6">
              <MenuCategorias arbol={menu} base={r()} />
              <Link href={`${r("/buscar")}?ofertas=1`} className={linkNav}>Ofertas</Link>
              <Link href={`${r("/buscar")}?orden=vendidos`} className={linkNav}>Más vendidos</Link>
              <Link href={r("/ayuda")} className={linkNav}>Ayuda</Link>
            </nav>
            <nav aria-label="Tu cuenta" className="flex items-center gap-6">
              {cuenta
                ? <Link href={r("/cuenta")} className={linkNav}>Hola, {primerNombre}</Link>
                : <Link href={r("/cuenta")} className={linkNav}>Ingresá</Link>}
              <Link href={r("/cuenta")} className={linkNav}>Mis compras</Link>
              {carritoBoton}
            </nav>
          </div>
        </div>

        {/* Celular */}
        <div className="lg:hidden">
          <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
            {logo("max-w-[30%]")}
            <div className="min-w-0 flex-1"><Buscador slug={t.slug} accion={r("/buscar")} /></div>
            <MenuMovil arbol={menu} base={r()}
              saludo={cuenta ? `Hola, ${primerNombre}` : "Bienvenido"}
              cuenta={{ nombre: cuenta ? "Mi cuenta" : "Ingresá a tu cuenta", href: r("/cuenta") }}
              enlaces={[
                { nombre: "Inicio", href: r() }, { nombre: "Ofertas", href: `${r("/buscar")}?ofertas=1` },
                { nombre: "Más vendidos", href: `${r("/buscar")}?orden=vendidos` }, { nombre: "Mis compras", href: r("/cuenta") },
                { nombre: "Carrito", href: r("/carrito") }, { nombre: "Ayuda", href: r("/ayuda") },
              ]} />
            {carritoBoton}
          </div>
          <div className="px-3 pb-2"><EnviarA slug={t.slug} linea1={linea1} linea2={linea2} cp={cp} /></div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-4 sm:px-4 sm:py-6">{children}</main>

      <footer className="mt-10 bg-white text-sm shadow-[0_-1px_0_rgba(0,0,0,.1)]" id="contacto">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-8 px-4 py-8 text-[var(--texto-2)] md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <p className="text-base font-semibold text-[var(--texto)]">{nombre}</p>
            {c.bajada && <p className="mt-1">{c.bajada}</p>}
          </div>
          <div>
            <p className="mb-2 font-semibold text-[var(--texto)]">Ayuda</p>
            <ul className="space-y-1.5">
              <li><Link href={r("/ayuda")} className="hover:text-[var(--texto)]">Cómo comprar</Link></li>
              <li><Link href={`${r("/ayuda")}#envios`} className="hover:text-[var(--texto)]">Envíos y retiros</Link></li>
              <li><Link href={`${r("/ayuda")}#pagos`} className="hover:text-[var(--texto)]">Medios de pago</Link></li>
              {(c.devoluciones || c.garantia) && <li><Link href={`${r("/ayuda")}#devoluciones`} className="hover:text-[var(--texto)]">Devoluciones y garantía</Link></li>}
            </ul>
          </div>
          <div>
            <p className="mb-2 font-semibold text-[var(--texto)]">Sobre {nombre}</p>
            <ul className="space-y-1.5">
              <li><Link href={r("/nosotros")} className="hover:text-[var(--texto)]">Sobre nosotros</Link></li>
              <li><Link href={r("/terminos")} className="hover:text-[var(--texto)]">Términos y condiciones</Link></li>
              <li><Link href={r("/privacidad")} className="hover:text-[var(--texto)]">Política de privacidad</Link></li>
              <li><Link href={r("/arrepentimiento")} className="hover:text-[var(--texto)]">Botón de arrepentimiento</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 font-semibold text-[var(--texto)]">Mi cuenta</p>
            <ul className="space-y-1.5">
              <li><Link href={r("/cuenta")} className="hover:text-[var(--texto)]">{cuenta ? "Mi cuenta" : "Ingresá"}</Link></li>
              <li><Link href={r("/cuenta")} className="hover:text-[var(--texto)]">Mis compras</Link></li>
              <li><Link href={r("/carrito")} className="hover:text-[var(--texto)]">Carrito</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 font-semibold text-[var(--texto)]">Contacto</p>
            <ul className="space-y-1.5">
              {c.email && <li><a href={`mailto:${c.email}`} className="break-all hover:text-[var(--texto)]">{c.email}</a></li>}
              {wa && <li><a href={wa} target="_blank" rel="noopener" className="hover:text-[var(--texto)]">WhatsApp</a></li>}
              {c.direccion && <li>{c.direccion}</li>}
              {c.horario && <li>{c.horario}</li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-[var(--linea)] bg-black/[.03]">
          <div className="mx-auto max-w-[1200px] space-y-1 px-4 py-4 text-xs text-[var(--texto-2)]">
            <p>Copyright © {new Date().getFullYear()} {emisor?.razon_social ?? nombre}.</p>
            {emisor && (
              <p>{[emisor.razon_social, `CUIT ${emisor.cuit}`, CONDICION_IVA[emisor.condicion_iva], emisor.domicilio].filter(Boolean).join(" · ")}</p>
            )}
            <p>
              <a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario" target="_blank" rel="noopener" className="underline hover:text-[var(--texto)]">Defensa de las y los Consumidores. Para reclamos ingresá acá</a>
              {" · "}<Link href={r("/arrepentimiento")} className="underline hover:text-[var(--texto)]">Botón de arrepentimiento</Link>
              {" · "}<Link href={r("/terminos")} className="underline hover:text-[var(--texto)]">Términos y condiciones</Link>
            </p>
          </div>
        </div>
      </footer>

      {wa && (
        <a href={wa} target="_blank" rel="noopener" aria-label="Escribinos por WhatsApp"
          className="fixed bottom-4 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105">
          <IconoWhatsapp />
        </a>
      )}
    </div>
  );
}
