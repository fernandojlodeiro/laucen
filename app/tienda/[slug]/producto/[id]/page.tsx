// Ficha de producto (?v=<variación>): galería, precio, cuotas, selector de
// variación por atributos, stock, agregar al carrito, descripción y atributos.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { planesDe } from "@/lib/tienda/cuotas";
import { rutaTienda, type Tienda } from "@/lib/tienda/tienda";
import { abierta, cargarTienda, cucardasDe } from "../../catalogo";
import { Aviso, AvisosUrl, BOTON, Cucardas, Precio } from "../../piezas";
import { agregarAlCarrito } from "../../acciones";
import Galeria from "./Galeria";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

type Variacion = { id: number; titulo: string; orden: number; lista: number; venta: number; disponible: number; atributos: Record<string, string> };

async function ficha(t: Tienda, productoId: number) {
  const org = t.organizacionId;
  const p = await una<{ id: number; titulo: string; descripcion: string | null; marca: string | null; familia_id: number | null; familia: string | null }>(`
    select p.id::int, p.titulo, p.descripcion, p.marca, p.familia_id::int, f.nombre familia
      from producto p left join familia f on f.id = p.familia_id
     where p.id = $1 and p.organizacion_id = $2 and p.estado = 'activo'`, [productoId, org]);
  if (!p) return null;
  const filas = t.listaId ? await consulta<{ id: number; titulo: string; orden: number; lista: string; venta: string; disponible: number }>(`
    select v.id::int, titulo_variacion(v.id) titulo, v.orden,
           case when $4 = 'USD' then pr.lista_usd else pr.lista_ars end lista,
           case when $4 = 'USD' then pr.venta_usd else pr.venta_ars end venta,
           greatest(stock_disponible_canal($2, v.id, $3), 0)::int disponible
      from variacion v cross join lateral (select * from precio_de($2, v.id, $5)) pr
     where v.producto_id = $1 and v.organizacion_id = $2 and v.estado = 'activa'
     order by v.orden, v.id`, [productoId, org, t.canalId, t.moneda, t.listaId]) : [];
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
    id: f.id, titulo: f.titulo, orden: f.orden, lista: Number(f.lista), venta: Number(f.venta), disponible: f.disponible,
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
  const { f } = await cargar(params);
  return { title: f.p.titulo, description: f.p.descripcion?.slice(0, 160) ?? undefined, openGraph: f.fotosProducto[0] ? { images: [f.fotosProducto[0]] } : undefined };
}

const cuota = (x: number) => Math.round(x * 100) / 100;

export default async function Producto({ params, searchParams }: Props) {
  const { t, f } = await cargar(params);
  const sp = await searchParams;
  const { p, variaciones, nombres } = f;
  const pedida = Number(sp.v);
  const v = variaciones.find((x) => x.id === pedida) ?? variaciones.find((x) => x.disponible > 0) ?? variaciones[0];
  const fotos = v ? [...f.fotosVariacion.filter((x) => x.variacion_id === v.id).map((x) => x.url), ...f.fotosProducto] : f.fotosProducto;
  const planes = v ? (await planesDe(t.organizacionId, v.id)).filter((pl) => pl.cuotas > 1) : [];
  const enlace = (x: Variacion) => `${rutaTienda(t, `/producto/${p.id}`)}?v=${x.id}`;

  // Para cada valor de cada atributo, la variación a la que lleva: la que
  // cambia sólo ese atributo respecto de la elegida, o si no existe, la primera con ese valor.
  const destino = (nombre: string, valor: string) =>
    variaciones.find((x) => x.atributos[nombre] === valor && Object.entries(v?.atributos ?? {}).every(([n, val]) => n === nombre || x.atributos[n] === val))
    ?? variaciones.find((x) => x.atributos[nombre] === valor);

  return (
    <div className="space-y-8">
      <nav aria-label="Estás en" className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        <Link href={rutaTienda(t)} className="hover:text-[var(--acento)]">Inicio</Link>
        {p.familia_id && p.familia && (<><span aria-hidden>›</span><Link href={rutaTienda(t, `/familia/${p.familia_id}`)} className="hover:text-[var(--acento)]">{p.familia}</Link></>)}
      </nav>

      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <Galeria fotos={fotos} titulo={p.titulo} />

        <div className="space-y-5">
          <AvisosUrl sp={sp} />
          <div className="space-y-2">
            <Cucardas lista={f.cucardas} />
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{p.titulo}</h1>
            {p.marca && <div className="text-sm text-gray-500">{p.marca}</div>}
          </div>

          {!v ? <Aviso>Este producto no está disponible por ahora.</Aviso> : (
            <>
              <Precio lista={v.lista} venta={v.venta} moneda={t.moneda} grande />

              {planes.length > 0 && (
                <ul className="space-y-0.5 text-sm">
                  {planes.map((pl) => (
                    <li key={pl.cuotas} className={pl.interes_pct === 0 ? "font-medium text-green-700" : "text-gray-600"}>
                      {pl.interes_pct === 0
                        ? `${pl.cuotas} cuotas sin interés de ${formatear(cuota(v.venta / pl.cuotas), t.moneda)}`
                        : `${pl.cuotas} cuotas de ${formatear(cuota((v.venta * (1 + pl.interes_pct / 100)) / pl.cuotas), t.moneda)} (con interés)`}
                    </li>
                  ))}
                </ul>
              )}

              {variaciones.length > 1 && (nombres.length > 0 ? nombres.map((n) => (
                <div key={n.nombre}>
                  <div className="mb-2 text-sm text-gray-600">{n.nombre}: <span className="font-semibold text-gray-900">{v.atributos[n.nombre] ?? "—"}</span></div>
                  <div className="flex flex-wrap gap-2">
                    {n.valores.map((valor) => {
                      const d = destino(n.nombre, valor);
                      if (!d) return null;
                      const elegido = v.atributos[n.nombre] === valor;
                      return (
                        <Link key={valor} href={enlace(d)} scroll={false} aria-current={elegido ? "true" : undefined}
                          className={`min-w-[48px] rounded-xl border-2 px-3 py-2 text-center text-sm font-medium transition
                            ${elegido ? "border-[var(--acento)] text-[var(--acento)]" : "border-gray-200 text-gray-700 hover:border-gray-400"}
                            ${d.disponible <= 0 ? "line-through opacity-50" : ""}`}>{valor}</Link>
                      );
                    })}
                  </div>
                </div>
              )) : (
                <div className="flex flex-wrap gap-2">
                  {variaciones.map((x) => (
                    <Link key={x.id} href={enlace(x)} scroll={false}
                      className={`rounded-xl border-2 px-3 py-2 text-sm font-medium ${x.id === v.id ? "border-[var(--acento)] text-[var(--acento)]" : "border-gray-200 text-gray-700"} ${x.disponible <= 0 ? "line-through opacity-50" : ""}`}>
                      {x.titulo.startsWith(`${p.titulo} — `) ? x.titulo.slice(p.titulo.length + 3) : x.titulo}
                    </Link>
                  ))}
                </div>
              ))}

              <div className="text-sm">
                {v.disponible <= 0 ? <span className="font-semibold text-gray-500">Sin stock</span>
                  : v.disponible <= 3 ? <span className="font-semibold text-orange-600">{v.disponible === 1 ? "¡Última unidad!" : `¡Últimas ${v.disponible} unidades!`}</span>
                  : <span className="font-medium text-green-700">En stock</span>}
              </div>

              {!abierta(t) ? <Aviso>La tienda no está tomando pedidos en este momento.</Aviso>
                : v.disponible > 0 && (
                  <form action={agregarAlCarrito} className="flex gap-3">
                    <input type="hidden" name="slug" value={t.slug} />
                    <input type="hidden" name="producto" value={p.id} />
                    <input type="hidden" name="variacion" value={v.id} />
                    <label className="sr-only" htmlFor="cantidad">Cantidad</label>
                    <select id="cantidad" name="cantidad" defaultValue="1"
                      className="h-12 w-24 shrink-0 rounded-xl border border-gray-300 bg-white px-3 text-right text-base outline-none focus:border-[var(--acento)]">
                      {Array.from({ length: Math.min(v.disponible, 20) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button type="submit" className={`${BOTON} flex-1`}>Agregar al carrito</button>
                  </form>
                )}
            </>
          )}
        </div>
      </div>

      {(p.descripcion || f.caracteristicas.length > 0) && (
        <div className="grid gap-8 md:grid-cols-2 md:gap-10">
          {p.descripcion && (
            <section>
              <h2 className="mb-3 text-lg font-bold">Descripción</h2>
              <div className="whitespace-pre-line leading-relaxed text-gray-700">{p.descripcion}</div>
            </section>
          )}
          {f.caracteristicas.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">Características</h2>
              <dl className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 text-sm">
                {f.caracteristicas.map((c, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 px-4 py-2.5 odd:bg-gray-50">
                    <dt className="text-gray-500">{c.nombre}</dt><dd className="text-gray-900">{c.valor}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
