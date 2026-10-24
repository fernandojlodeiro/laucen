// Marco de la tienda pública, con la experiencia de compra de los grandes
// marketplaces: franja de color con logo (en el celular, sin logo: sólo el buscador), buscador grande con sugerencias,
// cuenta, compras y carrito; abajo "Enviar a …", el menú de categorías y los
// atajos (Ofertas, Más vendidos, Ayuda). Pie con links, contacto y datos
// fiscales. Todos los colores son variables CSS de la tienda (tema.ts).

import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { Inter } from "next/font/google";
import { una } from "@/lib/erp/base";
import { leerCarrito } from "@/lib/tienda/carrito";
import { cuentaActual } from "@/lib/tienda/cuentas";
import { nombreTienda, rutaTienda } from "@/lib/tienda/tienda";
import { abierta, arbolDe, arbolParaMenu, cargarTienda, linkWhatsapp } from "./catalogo";
import { IconoCarrito, IconoWhatsapp } from "./piezas";
import { variablesTema } from "./tema";
import { etiquetasDelHost } from "@/lib/tienda/publicidad";
import { canonicalDe } from "@/lib/tienda/seo";
import { EventosDeNavegacion } from "./Publicidad";
import Buscador from "./encabezado/Buscador";
import EnviarA from "./encabezado/EnviarA";
import { MenuCategorias, MenuMovil } from "./encabezado/Menus";
import Flotante from "./encabezado/Flotante";
import BarraInferior from "./encabezado/BarraInferior";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const fuente = Inter({ subsets: ["latin"], display: "swap", weight: ["300", "400", "500", "600", "700"] });

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await cargarTienda((await params).slug);
  const nombre = nombreTienda(t);
  const h = await headers();
  const canonical = await canonicalDe(t, h.get("host"), h.get("x-ruta") ?? "");
  // El ícono de la pestaña: el logo de la tienda (nunca el de Laucen).
  // Cada página con su título y la marca del dominio («Notebook HP … | Daitom»; bitácora #856: con el
  // nombre de la tienda solo, para Google todas las fichas se llamaban igual). La portada, el nombre.
  return { title: { default: nombre, template: `%s | ${nombre}` }, description: t.config.bajada || `Tienda online de ${nombre}`,
    icons: t.config.logo ? { icon: t.config.logo, apple: t.config.logo } : { icon: [] },
    alternates: canonical ? { canonical } : undefined,
    openGraph: { siteName: nombre, locale: "es_AR", type: "website", ...(canonical ? { url: canonical } : {}), ...(t.config.logo ? { images: [t.config.logo] } : {}) } };
}

const CONDICION_IVA: Record<string, string> = { responsable_inscripto: "IVA Responsable Inscripto", monotributo: "Monotributo", exento: "IVA Exento" };

export default async function LayoutTienda({ children, params }: Props & { children: React.ReactNode }) {
  const { slug } = await params;
  const t = await cargarTienda(slug);
  const [carrito, arbol, cuenta, galletas, emisor, pub] = await Promise.all([
    leerCarrito(t.slug), arbolDe(t), cuentaActual(t), cookies(),
    una<{ razon_social: string; cuit: string; condicion_iva: string; domicilio: string | null }>(
      "select razon_social, cuit, condicion_iva, domicilio from emisor where organizacion_id = $1 and es_principal", [t.organizacionId]),
    headers().then((h) => etiquetasDelHost(h.get("host"))),
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
    <div style={variablesTema(t)} className={`${fuente.className} flex min-h-screen flex-col overflow-x-clip bg-[var(--fondo)] pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0 text-[var(--texto)] antialiased`}>
      {/* Las etiquetas de publicidad del dominio por donde se entró (Configuración › Tienda web › Publicidad); los IDs ya vienen validados. */}
      {pub?.google && <>
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${pub.google.ids[0]}`} />
        <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${
          pub.google.ids.map((id) => `gtag('config','${id}'${id.startsWith("AW-") && pub.datos_comprador ? ",{allow_enhanced_conversions:true}" : ""});`).join("")}` }} />
      </>}
      {pub?.meta && <script dangerouslySetInnerHTML={{ __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pub.meta}');fbq('track','PageView');` }} />}
      {pub?.tiktok && <script dangerouslySetInnerHTML={{ __html: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load('${pub.tiktok}');ttq.page();}(window,document,'ttq');` }} />}
      {pub && <EventosDeNavegacion />}
      {!abierta(t) && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">La tienda no está tomando pedidos en este momento.</div>
      )}

      <Flotante className="bg-[var(--marca)] shadow-[0_1px_0_rgba(0,0,0,.1)]">
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

        {/* Celular: como los marketplaces, sin logo ni nombre; sólo el buscador (el inicio, en el menú). */}
        <div className="lg:hidden">
          <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
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
          <div className="px-3 pb-1.5"><EnviarA slug={t.slug} linea1={linea1} linea2={linea2} cp={cp} compacto /></div>
        </div>
      </Flotante>
      <Suspense><BarraInferior base={r()} unidades={unidades} /></Suspense>

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
          className="fixed bottom-[calc(68px+env(safe-area-inset-bottom))] right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 lg:bottom-4">
          <IconoWhatsapp />
        </a>
      )}
    </div>
  );
}
