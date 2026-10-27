// Ficha de producto (?v=<variación>), con el armado de los marketplaces:
// galería con zoom a la izquierda; en el medio condición y vendidos, título,
// precio, cuotas, variaciones y "Lo que tenés que saber"; a la derecha la caja
// de compra (envío, stock, cantidad, "Comprar ahora" y "Agregar al carrito")
// y los medios de pago (sin caja de "vendedor": la tienda no es un marketplace). Abajo, relacionados, características y
// descripción. El precio sale de precio_de (la función única), en vivo.

import { sqlPublicadoEnWeb } from "@/lib/catalogo/web";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { mediosActivos } from "@/lib/tienda/checkout";
import { planesDe, planParaMostrar } from "@/lib/tienda/cuotas";
import { cuotasMpDe, financiacionTienda, planDeEscala, planesDisponibles } from "@/lib/tienda/financiacion";
import { contadoDe } from "@/lib/tienda/medios";
import { tasasMpDe } from "@/lib/tienda/tasas-mp";
import { condicionCatalogo, etiquetasDelHost, gtinValido, idCatalogo } from "@/lib/tienda/publicidad";
import { urlTienda } from "@/lib/tienda/dominios-tienda";
import { EventoPublicidad } from "../../Publicidad";
import { nombreTienda, rutaTienda, type Tienda } from "@/lib/tienda/tienda";
import { abierta, arbolDe, aTarjetas, cargarTienda, catalogoDe, cucardasDe, envioDe, envioGratis } from "../../catalogo";
import {
  Aviso, AvisosUrl, BOTON, BOTON_SUAVE, CAJA, Etiquetas, IconoCamion, IconoEscudo, IconoTienda, IconoVuelta, HastaCuotas, LineaContado, LineaCuotas, LINK, Migas, Monto, Precio, PrecioSegunPago, TarjetaProducto,
} from "../../piezas";
import { agregarAlCarrito, comprarAhora } from "../../acciones";
import Carrusel from "../../Carrusel";
import { vistosPorElVisitante } from "@/lib/tienda/visitantes";
import Galeria from "./Galeria";
import Cantidad from "./Cantidad";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

type Variacion = { id: number; titulo: string; orden: number; lista: number; venta: number; disponible: number; sku: string | null; codigoBarras: string | null; atributos: Record<string, string> };

async function ficha(t: Tienda, productoId: number) {
  const org = t.organizacionId;
  const p = await una<{ id: number; titulo: string; descripcion: string | null; marca: string | null; familia_id: number | null; familia: string | null;
    condicion: string | null; codigo_barras: string | null; video_url: string | null }>(`
    select p.id::int, p.titulo, p.descripcion, p.marca, p.familia_id::int, f.nombre familia, p.condicion, p.codigo_barras, p.video_url
      from producto p left join familia f on f.id = p.familia_id
     where p.id = $1 and p.organizacion_id = $2 and p.estado = 'activo' and ${sqlPublicadoEnWeb("p", "$3")}`, [productoId, org, t.canalId]);
  if (!p) return null;
  const filas = t.listaId ? await consulta<{ id: number; titulo: string; orden: number; lista: string; venta: string; disponible: number; sku: string | null; codigo_barras: string | null }>(`
    select v.id::int, titulo_variacion(v.id) titulo, v.orden, v.sku, v.codigo_barras,
           case when $4 = 'USD' then pr.lista_usd else pr.lista_ars end lista,
           case when $4 = 'USD' then pr.venta_usd else pr.venta_ars end venta,
           greatest(stock_disponible_canal($2, v.id, $3), 0)::int disponible
      from variacion v cross join lateral (select * from precio_de($2, v.id, $5)) pr
     where v.producto_id = $1 and v.organizacion_id = $2 and v.estado = 'activa'
       and coalesce(case when $4 = 'USD' then pr.venta_usd else pr.venta_ars end, 0) > 0
       -- Reglas de la web, sin excepción (Fer, 25/10): sin stock no se muestra, tampoco por link directo.
       and stock_disponible_canal($2, v.id, $3) > 0
     order by v.orden, v.id`, [productoId, org, t.canalId, t.moneda, t.listaId]) : [];
  if (!filas.length) return null; // ninguna variación activa con precio y stock: no está en la web
  const ids = filas.map((f) => f.id);
  const [atributos, fotosProducto, fotosVariacion, caracteristicas, cucardas] = await Promise.all([
    consulta<{ variacion_id: number; nombre: string; valor: string }>(
      "select variacion_id::int, nombre, valor from variacion_atributo where organizacion_id = $1 and variacion_id = any($2::bigint[]) order by orden, nombre", [org, ids]),
    consulta<{ url: string }>("select url from producto_foto where organizacion_id = $1 and producto_id = $2 order by orden, id", [org, productoId]),
    consulta<{ variacion_id: number; url: string }>(
      "select variacion_id::int, url from variacion_foto where organizacion_id = $1 and variacion_id = any($2::bigint[]) order by orden, id", [org, ids]),
    consulta<{ nombre: string; valor: string }>("select nombre, valor from producto_atributo where organizacion_id = $1 and producto_id = $2 order by orden, id", [org, productoId]),
    cucardasDe(org, [productoId]),
  ]);
  const variaciones: Variacion[] = filas.map((f) => ({
    id: f.id, titulo: f.titulo, orden: f.orden, lista: Number(f.lista), venta: Number(f.venta), disponible: f.disponible, sku: f.sku, codigoBarras: f.codigo_barras,
    atributos: Object.fromEntries(atributos.filter((a) => a.variacion_id === f.id).map((a) => [a.nombre, a.valor])),
  }));
  // Nombres de atributo en orden de aparición, con sus valores en orden.
  const nombres: { nombre: string; valores: string[] }[] = [];
  for (const a of atributos) {
    let n = nombres.find((x) => x.nombre === a.nombre);
    if (!n) nombres.push(n = { nombre: a.nombre, valores: [] });
    if (!n.valores.includes(a.valor)) n.valores.push(a.valor);
  }
  return { p, variaciones, nombres, fotosProducto: fotosProducto.map((f) => f.url), fotosVariacion, caracteristicas, cucardas: cucardas.get(productoId) ?? [] };
}

async function cargar(params: Props["params"]) {
  const { slug, id } = await params;
  const t = await cargarTienda(slug);
  const n = Number(id);
  const f = Number.isInteger(n) && n > 0 ? await ficha(t, n) : null;
  if (!f) notFound();
  return { t, f };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t, f } = await cargar(params);
  // «Título | Daitom» (el template del layout) y la foto principal para cuando se comparte el link.
  const nombre = nombreTienda(t), foto = f.fotosProducto[0] ?? f.fotosVariacion[0]?.url;
  return { title: f.p.titulo, description: (f.p.descripcion?.trim() || `${f.p.titulo}. Comprá en ${nombre}.`).slice(0, 160),
    openGraph: { title: `${f.p.titulo} | ${nombre}`, siteName: nombre, locale: "es_AR", type: "website", ...(foto ? { images: [foto] } : {}) } };
}

/** "+25 vendidos", como en los marketplaces (escalones), o el número exacto si son pocos. */
function textoVendidos(n: number) {
  if (n <= 0) return null;
  if (n < 5) return n === 1 ? "1 vendido" : `${n} vendidos`;
  const escalon = [50000, 10000, 5000, 1000, 500, 250, 150, 100, 50, 25, 5].find((x) => n >= x)!;
  return `+${formatearNumero(escalon, "entero")} vendidos`;
}

export default async function Producto({ params, searchParams }: Props) {
  const { t, f } = await cargar(params);
  const sp = await searchParams;
  const { p, variaciones, nombres } = f;
  const pedida = Number(sp.v);
  const v = variaciones.find((x) => x.id === pedida) ?? variaciones.find((x) => x.disponible > 0) ?? variaciones[0];
  const fotos = v ? [...f.fotosVariacion.filter((x) => x.variacion_id === v.id).map((x) => x.url), ...f.fotosProducto] : f.fotosProducto;
  // Con el esquema de cuotas y descuentos, todos sus planes; si no, los de su familia o producto.
  const fin = financiacionTienda(t);
  const tasasMp = await tasasMpDe(t);
  const [planes, envio, medios, catalogo, arbol, h, contado] = await Promise.all([
    !v ? Promise.resolve([]) : fin.activo ? Promise.resolve(planesDisponibles(fin, { tasasMp })) : planesDe(t.organizacionId, v.id),
    envioDe(t), mediosActivos(t), catalogoDe(t), arbolDe(t), headers(), contadoDe(t),
  ]);
  const idsVistos = await vistosPorElVisitante(t.organizacionId);
  const base = catalogo.find((x) => x.id === p.id);
  const relacionadosBase = p.familia_id
    ? catalogo.filter((x) => x.id !== p.id && x.stock > 0 && arbol.cadena(x.familiaId).includes(p.familia_id!)).sort((a, b) => b.vendidos - a.vendidos || b.creado - a.creado).slice(0, 12)
    : [];
  // Lo que miró antes (Fer, 27/10, como Mercado Libre): del catálogo, que ya deja afuera lo que no se puede vender.
  const porId = new Map(catalogo.map((x) => [x.id, x]));
  const vistosBase = idsVistos.filter((i) => i !== p.id).map((i) => porId.get(i)).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 12);
  const [yo, relacionados, vistos] = await Promise.all([base ? aTarjetas(t, [base]) : Promise.resolve([]), aTarjetas(t, relacionadosBase), aTarjetas(t, vistosBase)]);
  const masVendido = yo[0]?.masVendido ?? false;
  const plan = fin.activo ? (v ? planDeEscala(fin, v.venta) : null) : planParaMostrar(planes);
  const cuotasMp = fin.activo && v ? cuotasMpDe(fin, v.venta) : null;
  const enlace = (x: Variacion) => `${rutaTienda(t, `/producto/${p.id}`)}?v=${x.id}`;
  const c = t.config;
  const vendidos = textoVendidos(base?.vendidos ?? 0);
  const plata = (n: number) => `$\u00a0${formatearNumero(n, "entero")}`;

  // "Volver al listado": de donde vino (si fue una búsqueda o una categoría de esta tienda).
  let volver: string | null = null;
  try {
    const ref = new URL(h.get("referer") ?? "");
    if (ref.host === h.get("host") && /\/(buscar|familia\/\d+)/.test(ref.pathname)) volver = ref.pathname + ref.search;
  } catch { /* sin referer */ }
  const camino = p.familia_id ? arbol.cadena(p.familia_id).reverse() : [];

  // Para cada valor de cada atributo, la variación a la que lleva: la que
  // cambia sólo ese atributo respecto de la elegida, o si no existe, la primera con ese valor.
  const destino = (nombre: string, valor: string) =>
    variaciones.find((x) => x.atributos[nombre] === valor && Object.entries(v?.atributos ?? {}).every(([n, val]) => n === nombre || x.atributos[n] === val))
    ?? variaciones.find((x) => x.atributos[nombre] === valor);
  const fotoDe = (variacionId: number) => f.fotosVariacion.find((x) => x.variacion_id === variacionId)?.url ?? null;

  const encabezado = (
    <div className="space-y-2">
      <p className="text-sm text-[var(--texto-2)]">Nuevo{vendidos ? ` | ${vendidos}` : ""}</p>
      <Etiquetas lista={yo[0]?.cucardas ?? f.cucardas} masVendido={masVendido} />
      {p.marca && <Link href={`${rutaTienda(t, "/buscar")}?marca=${encodeURIComponent(p.marca)}`} className={`${LINK} block text-sm`}>Ver más productos de {p.marca}</Link>}
      <h1 className="text-[22px] font-semibold leading-tight text-[var(--texto)]">{p.titulo}</h1>
    </div>
  );

  const gratis = v ? envioGratis(envio, v.venta) : false;
  const filaInfo = "flex gap-3 text-sm";

  // Publicidad: "vio el producto" (si el dominio mide) y los datos del producto para los buscadores
  // (schema.org), con el MISMO precio que va al catálogo de Google: el precio grande, sin el tachado.
  const pub = await etiquetasDelHost(h.get("host"));
  const urlFicha = v ? await urlTienda(t, `/producto/${p.id}?v=${v.id}`) : null;
  const gtin = v ? gtinValido(v.codigoBarras) ?? gtinValido(p.codigo_barras) : null;
  const datosGoogle = v && urlFicha ? {
    "@context": "https://schema.org", "@type": "Product", name: v.titulo, sku: idCatalogo(v.sku, v.id),
    image: fotos.slice(0, 10), description: (p.descripcion || v.titulo).slice(0, 5000),
    ...(p.marca?.trim() ? { brand: { "@type": "Brand", name: p.marca.trim() } } : {}),
    ...(gtin ? { gtin } : {}),
    offers: { "@type": "Offer", url: urlFicha, priceCurrency: t.moneda, price: v.venta.toFixed(2),
      availability: v.disponible > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: { new: "https://schema.org/NewCondition", used: "https://schema.org/UsedCondition", refurbished: "https://schema.org/RefurbishedCondition" }[condicionCatalogo(p.condicion)] },
  } : null;

  return (
    <div className="space-y-3">
      {datosGoogle && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datosGoogle).replace(/</g, "\\u003c") }} />}
      {pub && v && <EventoPublicidad evento={{ tipo: "ver", moneda: t.moneda, valor: v.venta,
        items: [{ id: idCatalogo(v.sku, v.id), nombre: v.titulo, precio: v.venta, cantidad: 1 }] }} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {volver && <><Link href={volver} className={LINK}>Volver al listado</Link><span className="text-[var(--linea)]" aria-hidden>|</span></>}
        <Migas t={t} partes={camino.map((id) => ({ nombre: arbol.nodos.get(id)?.nombre ?? "", href: rutaTienda(t, `/familia/${id}`) })).filter((x) => x.nombre)} />
      </div>

      <div className={CAJA}>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="md:hidden">{encabezado}</div>
            <div><Galeria fotos={fotos} titulo={p.titulo} video={p.video_url} /></div>

            <div className="space-y-5">
              <AvisosUrl sp={sp} />
              <div className="hidden md:block">{encabezado}</div>

              {!v ? <Aviso>Este producto no está disponible por ahora.</Aviso> : (
                <>
                  <div className="space-y-1">
                    <Precio lista={v.lista} venta={v.venta} moneda={t.moneda} grande />
                    <LineaCuotas plan={plan} venta={v.venta} moneda={t.moneda} className="text-base" />
                    <LineaContado contado={contado ? { precio: Math.round(v.venta * (1 - contado.pct / 100) * 100) / 100, texto: contado.texto } : null} moneda={t.moneda} className="mt-1 inline-block text-base" />
                    {cuotasMp && <p><HastaCuotas cuotas={cuotasMp} /></p>}
                    <a href="#medios" className={`${LINK} inline-block text-sm`}>Ver los medios de pago</a>
                  </div>

                  {variaciones.length > 1 && (nombres.length > 0 ? nombres.map((n) => {
                    const destinos = n.valores.map((valor) => ({ valor, d: destino(n.nombre, valor) }));
                    const conFoto = destinos.every((x) => x.d && fotoDe(x.d.id)) && new Set(destinos.map((x) => x.d && fotoDe(x.d.id))).size > 1;
                    return (
                      <div key={n.nombre}>
                        <p className="mb-2 text-sm text-[var(--texto)]">{n.nombre}: <span className="font-semibold">{v.atributos[n.nombre] ?? "—"}</span></p>
                        <div className="flex flex-wrap gap-2">
                          {destinos.map(({ valor, d }) => {
                            if (!d) return null;
                            const elegido = v.atributos[n.nombre] === valor;
                            const borde = elegido ? "border-2 border-[var(--boton)]" : "border border-black/25 hover:border-[var(--boton)]";
                            return conFoto ? (
                              <Link key={valor} href={enlace(d)} scroll={false} aria-current={elegido ? "true" : undefined} title={valor} aria-label={valor}
                                className={`h-14 w-14 overflow-hidden rounded-md bg-white p-0.5 ${borde} ${d.disponible <= 0 ? "opacity-40" : ""}`}>
                                <img src={fotoDe(d.id)!} alt="" className="h-full w-full object-contain" />
                              </Link>
                            ) : (
                              <Link key={valor} href={enlace(d)} scroll={false} aria-current={elegido ? "true" : undefined}
                                className={`min-w-[44px] rounded-md px-3 py-2 text-center text-sm text-[var(--texto)] ${borde} ${d.disponible <= 0 ? "text-black/40 line-through" : ""}`}>{valor}</Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="flex flex-wrap gap-2">
                      {variaciones.map((x) => (
                        <Link key={x.id} href={enlace(x)} scroll={false}
                          className={`rounded-md px-3 py-2 text-sm ${x.id === v.id ? "border-2 border-[var(--boton)]" : "border border-black/25 hover:border-[var(--boton)]"} ${x.disponible <= 0 ? "text-black/40 line-through" : ""}`}>
                          {x.titulo.startsWith(`${p.titulo} — `) ? x.titulo.slice(p.titulo.length + 3) : x.titulo}
                        </Link>
                      ))}
                    </div>
                  ))}

                  {f.caracteristicas.length > 0 && (
                    <div>
                      <h2 className="mb-2 text-base font-semibold text-[var(--texto)]">Lo que tenés que saber de este producto</h2>
                      <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--texto)] marker:text-black/40">
                        {f.caracteristicas.slice(0, 7).map((x, i) => <li key={i}>{x.nombre}: {x.valor}</li>)}
                      </ul>
                      <a href="#caracteristicas" className={`${LINK} mt-2 inline-block text-sm`}>Ver características</a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Caja de compra */}
          <aside className="space-y-4 p-4 sm:p-6 lg:pl-0">
            <div className="space-y-4 rounded-md border border-[var(--linea)] p-4">
              {v && (
                <div className="space-y-3">
                  {envio.aDomicilio && (
                    <div className={filaInfo}>
                      <IconoCamion clase={`h-5 w-5 shrink-0 ${gratis ? "text-[var(--verde)]" : "text-[var(--texto-2)]"}`} />
                      <div>
                        <p className={gratis ? "font-semibold text-[var(--verde)]" : "text-[var(--texto)]"}>
                          {gratis ? "Envío gratis a domicilio" : envio.aDomicilio.costo ? <>Envío a domicilio por <Monto n={envio.aDomicilio.costo} moneda="ARS" /></> : "Envío a domicilio"}
                        </p>
                        {envio.aDomicilio.plazo && <p className="text-[var(--texto-2)]">{envio.aDomicilio.plazo}</p>}
                        {!gratis && envio.gratisDesde != null && envio.gratisDesde > 0 && (
                          <p className="text-[var(--texto-2)]">Gratis en compras desde {plata(envio.gratisDesde)}</p>
                        )}
                        {!gratis && !envio.aDomicilio.costo && <p className="text-[var(--texto-2)]">Calculamos el costo al finalizar la compra.</p>}
                      </div>
                    </div>
                  )}
                  {envio.retiro && (
                    <div className={filaInfo}>
                      <IconoTienda clase="h-5 w-5 shrink-0 text-[var(--verde)]" />
                      <div>
                        <p className="font-semibold text-[var(--verde)]">Retirá gratis</p>
                        <p className="text-[var(--texto-2)]">{envio.retiro.nombre}{envio.retiro.plazo ? ` · ${envio.retiro.plazo}` : ""}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {v && (
                <p className="text-base font-semibold text-[var(--texto)]">
                  {v.disponible <= 0 ? "Sin stock" : v.disponible === 1 ? "¡Última disponible!" : "Stock disponible"}
                </p>
              )}

              {v && (!abierta(t) ? <Aviso>La tienda no está tomando pedidos en este momento.</Aviso>
                : v.disponible > 0 && (
                  <form action={agregarAlCarrito} className="space-y-4">
                    <input type="hidden" name="slug" value={t.slug} />
                    <input type="hidden" name="producto" value={p.id} />
                    <input type="hidden" name="variacion" value={v.id} />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <label htmlFor="cantidad" className="text-[var(--texto)]">Cantidad:</label>
                      <Cantidad key={v.id} disponible={v.disponible} />
                      <span className="text-[var(--texto-2)]">({v.disponible === 1 ? "1 disponible" : `${formatearNumero(v.disponible, "entero")} disponibles`})</span>
                    </div>
                    <div className="space-y-2">
                      <button type="submit" formAction={comprarAhora} className={`${BOTON} w-full`}>Comprar ahora</button>
                      <button type="submit" className={`${BOTON_SUAVE} w-full`}>Agregar al carrito</button>
                    </div>
                  </form>
                ))}

              {(c.devoluciones || c.garantia) && (
                <ul className="space-y-3 border-t border-[var(--linea)] pt-4 text-sm text-[var(--texto-2)]">
                  {c.devoluciones && (
                    <li className={filaInfo}><IconoVuelta clase="h-5 w-5 shrink-0" />
                      <span><span className="font-semibold text-[var(--texto)]">Devolución.</span> <span className="whitespace-pre-line">{c.devoluciones}</span></span></li>
                  )}
                  {c.garantia && (
                    <li className={filaInfo}><IconoEscudo clase="h-5 w-5 shrink-0" />
                      <span><span className="font-semibold text-[var(--texto)]">Garantía.</span> <span className="whitespace-pre-line">{c.garantia}</span></span></li>
                  )}
                </ul>
              )}
            </div>

            <div id="medios" className="scroll-mt-4 space-y-3 rounded-md border border-[var(--linea)] p-4 text-sm">
              <p className="text-base text-[var(--texto)]">Medios de pago</p>
              {fin.activo && v ? (
                <PrecioSegunPago lista={v.lista} venta={v.venta} moneda={t.moneda} planes={planes} contado={contado} />
              ) : planes.some((x) => x.cuotas > 1) && (
                <ul className="space-y-1">
                  {planes.filter((x) => x.cuotas > 1).map((x) => x.medio === "mercadopago" ? (
                    // Por Mercado Pago: el interés lo cobra Mercado Pago; la cuota es de referencia.
                    <li key={x.cuotas} className="text-[var(--texto)]">
                      Hasta {x.cuotas} cuotas con Mercado Pago
                      {v && x.referencia && <> desde <Monto n={Math.round(((v.venta * (1 + x.interes_pct / 100)) / x.cuotas) * 100) / 100} moneda={t.moneda} />
                        <span className="text-[var(--texto-2)]"> (total aprox. <Monto n={Math.round(v.venta * (1 + x.interes_pct / 100) * 100) / 100} moneda={t.moneda} />)</span></>}
                      <span className="block text-xs text-[var(--texto-2)]">{x.referencia ? "La cuota exacta depende de tu tarjeta. " : ""}También podés pagar en cuotas sin tarjeta con Mercado Pago.</span>
                    </li>
                  ) : (
                    <li key={x.cuotas} className={x.interes_pct === 0 ? "text-[var(--verde)]" : "text-[var(--texto)]"}>
                      {x.cuotas} cuotas {x.interes_pct === 0 ? "sin interés" : "con interés"}
                      {v && <> de <Monto n={Math.round(((v.venta * (1 + x.interes_pct / 100)) / x.cuotas) * 100) / 100} moneda={t.moneda} /></>}
                      {v && x.interes_pct > 0 && <span className="text-[var(--texto-2)]"> (total <Monto n={Math.round(v.venta * (1 + x.interes_pct / 100) * 100) / 100} moneda={t.moneda} />)</span>}
                    </li>
                  ))}
                </ul>
              )}
              {medios.length ? (
                <ul className="space-y-1.5 text-[var(--texto)]">
                  {medios.map((m) => (
                    <li key={m.tipo} className="flex flex-wrap items-center gap-2">
                      {m.nombre}
                      {m.descuento_pct > 0 && <span className="rounded bg-[var(--verde)] px-1.5 py-0.5 text-[11px] font-semibold text-white">{m.descuento_pct.toLocaleString("es-AR")}% OFF</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[var(--texto-2)]">Consultanos cómo pagar.</p>}
            </div>
          </aside>
        </div>

        {vistos.length > 0 && (
          <section className="space-y-3 border-t border-[var(--linea)] p-4 sm:p-6">
            <h2 className="text-xl font-normal text-[var(--texto)] sm:text-2xl">Lo que ya estuviste viendo</h2>
            <Carrusel etiqueta="Lo que ya estuviste viendo" ancho="w-[46%] sm:w-[31%] md:w-[23.5%] lg:w-[19%]">
              {vistos.map((x) => <TarjetaProducto key={x.id} t={t} p={x} />)}
            </Carrusel>
          </section>
        )}

        {relacionados.length > 0 && (
          <section className="space-y-3 border-t border-[var(--linea)] p-4 sm:p-6">
            <h2 className="text-xl font-normal text-[var(--texto)] sm:text-2xl">Productos relacionados</h2>
            <Carrusel etiqueta="Productos relacionados" ancho="w-[46%] sm:w-[31%] md:w-[23.5%] lg:w-[19%]">
              {relacionados.map((x) => <TarjetaProducto key={x.id} t={t} p={x} />)}
            </Carrusel>
          </section>
        )}

        {f.caracteristicas.length > 0 && (
          <section id="caracteristicas" className="scroll-mt-4 border-t border-[var(--linea)] p-4 sm:p-6">
            <h2 className="mb-4 text-xl font-normal text-[var(--texto)] sm:text-2xl">Características del producto</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:max-w-[calc(100%-330px)]">
              {[f.caracteristicas.slice(0, Math.ceil(f.caracteristicas.length / 2)), f.caracteristicas.slice(Math.ceil(f.caracteristicas.length / 2))]
                .filter((l) => l.length).map((l, k) => (
                  <table key={k} className="w-full self-start overflow-hidden rounded-md text-sm">
                    <tbody>
                      {l.map((x, i) => (
                        <tr key={i} className="odd:bg-black/[.04] even:bg-black/[.015]">
                          <th scope="row" className="w-2/5 bg-black/[.04] px-4 py-3 text-left font-semibold text-[var(--texto)]">{x.nombre}</th>
                          <td className="px-4 py-3 text-[var(--texto)]">{x.valor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
            </div>
          </section>
        )}

        {p.descripcion && (
          <section className="border-t border-[var(--linea)] p-4 sm:p-6">
            <h2 className="mb-4 text-xl font-normal text-[var(--texto)] sm:text-2xl">Descripción</h2>
            <div className="whitespace-pre-line text-base font-light leading-relaxed text-[var(--texto-2)] sm:text-lg lg:max-w-[calc(100%-330px)]">{p.descripcion}</div>
          </section>
        )}
      </div>
    </div>
  );
}
