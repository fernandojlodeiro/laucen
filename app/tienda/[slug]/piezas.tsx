// Piezas de la tienda pública (servidor): botones, precio con centavos
// arriba, etiquetas, tarjeta de producto, fila de listado, listado con
// filtros y paginado, e íconos. Los colores salen SIEMPRE de las variables CSS
// que pone el layout (tema.ts): --marca, --boton, --boton-claro, --verde, --fondo…

import Link from "next/link";
import { formatearNumero } from "@/lib/numeros";
import type { Moneda } from "@/lib/moneda";
import type { Plan } from "@/lib/tienda/cuotas";
import { rutaTienda, type Tienda } from "@/lib/tienda/tienda";
import { buscarProductos, POR_PAGINA, type Cucarda, type Filtros, type Orden, type Tarjeta } from "./catalogo";

// ── Estilos comunes ──────────────────────────────────────
export const BOTON = "inline-flex items-center justify-center gap-2 rounded-md px-6 h-12 text-base font-semibold text-white bg-[var(--boton)] hover:bg-[var(--boton-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
export const BOTON_SUAVE = "inline-flex items-center justify-center gap-2 rounded-md px-6 h-12 text-base font-semibold text-[var(--boton)] bg-[var(--boton-claro)] hover:bg-[var(--boton-claro-hover)] transition-colors";
export const CAMPO = "w-full h-12 rounded-md border border-[rgba(0,0,0,.25)] bg-white px-3 text-base outline-none hover:border-[rgba(0,0,0,.4)] focus:border-[var(--boton)] focus:ring-1 focus:ring-[var(--boton)]";
export const ETIQUETA = "block text-sm text-[var(--texto)] mb-1";
export const TITULO = "text-xl sm:text-2xl font-semibold text-[var(--texto)]";
/** Caja blanca con la sombrita de las tarjetas. */
export const CAJA = "rounded-md bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.12)]";
export const LINK = "text-[var(--boton)] hover:text-[var(--boton-hover)]";

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "error" | "ok"; children: React.ReactNode }) {
  const c = tipo === "error" ? "bg-red-50 text-red-800 border-red-200" : tipo === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-amber-50 text-amber-900 border-amber-200";
  return <div role={tipo === "error" ? "alert" : undefined} className={`rounded-md border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

/** Los avisos que dejan las acciones en la dirección (?ok= / ?error=). */
export function AvisosUrl({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  if (!ok && !error) return null;
  return <div className="mb-4">{error ? <Aviso tipo="error">{error}</Aviso> : <Aviso tipo="ok">{ok}</Aviso>}</div>;
}

/** Etiquetas arriba del título: "MÁS VENDIDO" (naranja) y las cucardas de la tienda (con su color). */
export function Etiquetas({ lista, masVendido }: { lista: Cucarda[]; masVendido?: boolean }) {
  if (!lista.length && !masVendido) return null;
  const clase = "inline-block rounded-[3px] px-1.5 py-[2px] text-[11px] font-semibold uppercase leading-4 text-white";
  return (
    <div className="flex flex-wrap gap-1">
      {masVendido && <span className={`${clase} bg-[var(--etiqueta-vendido)]`}>Más vendido</span>}
      {lista.map((c) => <span key={c.nombre} style={{ backgroundColor: c.color }} className={clase}>{c.nombre}</span>)}
    </div>
  );
}
/** Compatibilidad con el nombre de antes. */
export const Cucardas = ({ lista }: { lista: Cucarda[]; chica?: boolean }) => <Etiquetas lista={lista} />;

export const pctOff = (lista: number, venta: number) => (lista > 0 && venta < lista ? Math.round((1 - venta / lista) * 100) : 0);

/** "$ 12.345⁹⁹": el entero grande y los centavos chiquitos arriba (si hay). */
export function Monto({ n, moneda, className = "", tachado }: { n: number; moneda: Moneda; className?: string; tachado?: boolean }) {
  const centavos = Math.round(n * 100);
  const entero = Math.floor(centavos / 100), resto = centavos % 100;
  const texto = `${moneda === "USD" ? "US$" : "$"} ${formatearNumero(entero, "entero")}${resto ? `,${String(resto).padStart(2, "0")}` : ""}`;
  return (
    <span className={`inline-flex items-start whitespace-nowrap leading-none ${tachado ? "line-through" : ""} ${className}`} aria-label={texto}>
      <span aria-hidden>{moneda === "USD" ? "US$" : "$"}</span>
      <span aria-hidden className="ml-[0.2em]">{formatearNumero(entero, "entero")}</span>
      {resto > 0 && <span aria-hidden className="ml-[0.1em] text-[0.5em] leading-none mt-[0.1em]">{String(resto).padStart(2, "0")}</span>}
    </span>
  );
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** "Mismo precio en 6 cuotas de $ 1.234" (verde, sin interés) o "en 12 cuotas de $ 1.500" (con interés). */
export function LineaCuotas({ plan, venta, moneda, className = "" }: { plan: Plan | null; venta: number; moneda: Moneda; className?: string }) {
  if (!plan || plan.cuotas < 2) return null;
  const sin = plan.interes_pct === 0;
  const cuota = r2((venta * (1 + plan.interes_pct / 100)) / plan.cuotas);
  return (
    <p className={`${sin ? "text-[var(--verde)]" : "text-[var(--texto)]"} ${className}`}>
      {sin ? "Mismo precio en " : "en "}{plan.cuotas} cuotas de <Monto n={cuota} moneda={moneda} className="align-baseline" />
    </p>
  );
}

/** Bloque de precio: tachado chico, precio grande con "% OFF" verde. */
export function Precio({ lista, venta, moneda, desde, grande }: { lista: number; venta: number; moneda: Moneda; desde?: boolean; grande?: boolean }) {
  const off = pctOff(lista, venta);
  return (
    <div>
      {off > 0 && <Monto n={lista} moneda={moneda} tachado className={`text-[var(--texto-2)] ${grande ? "text-base" : "text-xs"}`} />}
      <div className="flex flex-wrap items-center gap-2">
        {desde && <span className="text-xs text-[var(--texto-2)]">Desde</span>}
        <Monto n={venta} moneda={moneda} className={`text-[var(--texto)] ${grande ? "text-[36px] font-light" : "text-2xl"}`} />
        {off > 0 && <span className={`text-[var(--verde)] ${grande ? "text-lg" : "text-sm"}`}>{off}% OFF</span>}
      </div>
    </div>
  );
}

const enlaceProducto = (t: Tienda, p: { id: number }) => rutaTienda(t, `/producto/${p.id}`);

/** Tarjeta vertical (carruseles de la portada y vista en grilla). */
export function TarjetaProducto({ t, p }: { t: Tienda; p: Tarjeta }) {
  const sinStock = p.stock <= 0;
  return (
    <Link href={enlaceProducto(t, p)}
      className="group flex h-full flex-col overflow-hidden rounded-md bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.12)] transition-shadow hover:shadow-[0_7px_16px_0_rgba(0,0,0,.2)]">
      <div className="relative aspect-square border-b border-[var(--linea)] bg-white">
        {p.foto
          ? <img src={p.foto} alt={p.titulo} loading="lazy" decoding="async" className={`h-full w-full object-contain p-3 ${sinStock ? "opacity-50" : ""}`} />
          : <div className="grid h-full w-full place-items-center text-gray-300"><IconoFoto /></div>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4 pt-3">
        <Etiquetas lista={p.cucardas} masVendido={p.masVendido} />
        <h3 className="line-clamp-2 text-sm leading-[1.3] text-[var(--texto)] group-hover:text-[var(--boton)]">{p.titulo}</h3>
        <div className="mt-1"><Precio lista={p.lista} venta={p.venta} moneda={t.moneda} desde={p.ventaMax > p.venta} /></div>
        <LineaCuotas plan={p.plan} venta={p.venta} moneda={t.moneda} className="text-sm" />
        {p.envioGratis && !sinStock && <p className="text-sm font-semibold text-[var(--verde)]">Envío gratis</p>}
        {sinStock && <p className="text-sm text-[var(--texto-2)]">Sin stock</p>}
      </div>
    </Link>
  );
}

/** Fila del listado (vista en lista): foto a la izquierda, datos a la derecha. */
export function FilaProducto({ t, p }: { t: Tienda; p: Tarjeta }) {
  const sinStock = p.stock <= 0;
  return (
    <li className="flex gap-4 border-b border-[var(--linea)] p-4 last:border-b-0 sm:gap-6 sm:p-5">
      <Link href={enlaceProducto(t, p)} className="block h-[120px] w-[120px] shrink-0 sm:h-[180px] sm:w-[180px]" tabIndex={-1} aria-hidden>
        {p.foto
          ? <img src={p.foto} alt="" loading="lazy" decoding="async" className={`h-full w-full object-contain ${sinStock ? "opacity-50" : ""}`} />
          : <div className="grid h-full w-full place-items-center rounded bg-gray-50 text-gray-300"><IconoFoto /></div>}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Etiquetas lista={p.cucardas} masVendido={p.masVendido} />
        <h2 className="text-base font-normal leading-snug text-[var(--texto)] sm:text-lg">
          <Link href={enlaceProducto(t, p)} className="line-clamp-2 hover:text-[var(--boton)]">{p.titulo}</Link>
        </h2>
        {p.marca && <p className="text-xs text-[var(--texto-2)]">Por {p.marca}</p>}
        <div className="mt-1"><Precio lista={p.lista} venta={p.venta} moneda={t.moneda} desde={p.ventaMax > p.venta} /></div>
        <LineaCuotas plan={p.plan} venta={p.venta} moneda={t.moneda} className="text-sm" />
        {p.envioGratis && !sinStock && <p className="text-sm font-semibold text-[var(--verde)]">Envío gratis</p>}
        {sinStock ? <p className="text-sm text-[var(--texto-2)]">Sin stock</p>
          : p.stock <= 3 && <p className="text-xs text-[var(--texto-2)]">{p.stock === 1 ? "¡Última disponible!" : `Últimas ${p.stock} disponibles`}</p>}
      </div>
    </li>
  );
}

export function Grilla({ t, productos, columnas = "lg:grid-cols-4" }: { t: Tienda; productos: Tarjeta[]; columnas?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 ${columnas}`}>
      {productos.map((p) => <TarjetaProducto key={p.id} t={t} p={p} />)}
    </div>
  );
}

/** Migas: "Inicio › Hogar › Cocina". */
export function Migas({ t, partes }: { t: Tienda; partes: { nombre: string; href?: string }[] }) {
  return (
    <nav aria-label="Estás en" className="flex flex-wrap items-center gap-1 text-sm text-[var(--texto-2)]">
      <Link href={rutaTienda(t)} className={LINK}>Inicio</Link>
      {partes.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          <span aria-hidden className="px-0.5">›</span>
          {p.href ? <Link href={p.href} className={LINK}>{p.nombre}</Link> : <span>{p.nombre}</span>}
        </span>
      ))}
    </nav>
  );
}

// ── Listado con filtros (búsqueda y categorías) ──────────
type Params = Record<string, string | null | undefined>;

/** Lee los filtros del listado de la dirección. */
export function leerFiltros(sp: Record<string, string | string[] | undefined>): Filtros & { vista: "lista" | "grilla" } {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const num = (k: string) => { const n = Number(s(k).replace(/\./g, "").replace(",", ".")); return s(k) && Number.isFinite(n) && n >= 0 ? n : null; };
  const orden = ["relevancia", "menor", "mayor", "vendidos"].includes(s("orden")) ? (s("orden") as Orden) : "relevancia";
  return {
    q: s("q").slice(0, 100) || null, orden, pagina: Math.max(1, Math.trunc(Number(s("pagina"))) || 1),
    min: num("min"), max: num("max"), envioGratis: s("envio") === "gratis", marca: s("marca").slice(0, 80) || null,
    ofertas: s("ofertas") === "1", familiaId: Number(s("familia")) > 0 ? Math.trunc(Number(s("familia"))) : null,
    vista: s("vista") === "grilla" ? "grilla" : "lista",
  };
}

const armar = (base: string, actual: Params, cambios: Params) => {
  const todo: Params = { ...actual, pagina: null, ...cambios };
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(todo)) {
    if (v == null || v === "") continue;
    if (k === "pagina" && v === "1") continue;
    if (k === "orden" && v === "relevancia") continue;
    if (k === "vista" && v === "lista") continue;
    u.set(k, v);
  }
  const s = u.toString();
  return s ? `${base}?${s}` : base;
};

const ORDENES: [Orden, string][] = [["relevancia", "Más relevantes"], ["menor", "Menor precio"], ["mayor", "Mayor precio"], ["vendidos", "Más vendidos"]];

/** Listado estilo marketplace: columna de filtros, orden, lista o grilla y paginado.
 *  `familiaEnRuta`: en /familia/<id> las categorías llevan a otra ruta; en /buscar, a ?familia=. */
export async function Listado({ t, base, titulo, filtros, familiaEnRuta, migas }: {
  t: Tienda; base: string; titulo: string; filtros: ReturnType<typeof leerFiltros>; familiaEnRuta?: boolean; migas?: React.ReactNode;
}) {
  const { productos, total, facetas } = await buscarProductos(t, filtros);
  const f = filtros;
  const actual: Params = {
    q: f.q, orden: f.orden, min: f.min?.toString(), max: f.max?.toString(), envio: f.envioGratis ? "gratis" : null,
    marca: f.marca, ofertas: f.ofertas ? "1" : null, vista: f.vista, familia: familiaEnRuta ? null : f.familiaId?.toString(),
  };
  const ir = (cambios: Params) => armar(base, actual, cambios);
  const aFamilia = (id: number) => familiaEnRuta ? armar(rutaTienda(t, `/familia/${id}`), { ...actual, familia: null }, {}) : ir({ familia: String(id) });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const m = t.moneda;
  const plata = (n: number) => `${m === "USD" ? "US$" : "$"} ${formatearNumero(n, "entero")}`;

  const aplicados: { nombre: string; href: string }[] = [
    ...(f.ofertas ? [{ nombre: "Ofertas", href: ir({ ofertas: null }) }] : []),
    ...(f.envioGratis ? [{ nombre: "Envío gratis", href: ir({ envio: null }) }] : []),
    ...(f.marca ? [{ nombre: f.marca, href: ir({ marca: null }) }] : []),
    ...(f.min != null || f.max != null ? [{
      nombre: f.min != null && f.max != null ? `${plata(f.min)} a ${plata(f.max)}` : f.min != null ? `Más de ${plata(f.min)}` : `Hasta ${plata(f.max!)}`,
      href: ir({ min: null, max: null }),
    }] : []),
  ];

  const filtrosHtml = (
    <div className="space-y-6 text-sm">
      {aplicados.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-[var(--texto)]">Filtros aplicados</h3>
          <div className="flex flex-wrap gap-2">
            {aplicados.map((a) => (
              <Link key={a.nombre} href={a.href} className="inline-flex items-center gap-1 rounded bg-black/[.07] px-2 py-1 text-xs text-[var(--texto)] hover:bg-black/10">
                {a.nombre}<span aria-label="Quitar" className="ml-0.5"><IconoX clase="h-3 w-3" /></span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {(facetas.hayEnvioGratis && facetas.envioGratis > 0 && !f.envioGratis) && (
        <Link href={ir({ envio: "gratis" })} className="flex items-center justify-between rounded-md bg-white p-3 shadow-[0_1px_2px_0_rgba(0,0,0,.12)] hover:shadow-md">
          <span className="font-semibold text-[var(--verde)]">Envío gratis</span>
          <span className="relative inline-flex h-4 w-8 rounded-full bg-black/25" aria-hidden><span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white" /></span>
        </Link>
      )}
      {facetas.familias.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-[var(--texto)]">Categorías</h3>
          <ul className="space-y-1.5">
            {facetas.familias.slice(0, 15).map((x) => (
              <li key={x.id}><Link href={aFamilia(x.id)} className="text-[var(--texto)] hover:text-[var(--boton)]">{x.nombre} <span className="text-[var(--texto-2)]">({x.cantidad})</span></Link></li>
            ))}
          </ul>
        </div>
      )}
      {!f.ofertas && facetas.ofertas > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-[var(--texto)]">Descuentos</h3>
          <Link href={ir({ ofertas: "1" })} className="text-[var(--texto)] hover:text-[var(--boton)]">Con descuento <span className="text-[var(--texto-2)]">({facetas.ofertas})</span></Link>
        </div>
      )}
      {!f.marca && facetas.marcas.length > 1 && (
        <div>
          <h3 className="mb-2 font-semibold text-[var(--texto)]">Marca</h3>
          <ul className="space-y-1.5">
            {facetas.marcas.map((x) => (
              <li key={x.nombre}><Link href={ir({ marca: x.nombre })} className="text-[var(--texto)] hover:text-[var(--boton)]">{x.nombre} <span className="text-[var(--texto-2)]">({x.cantidad})</span></Link></li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="mb-2 font-semibold text-[var(--texto)]">Precio</h3>
        {f.min == null && f.max == null && facetas.precios.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {facetas.precios.map((r, i) => (
              <li key={i}>
                <Link href={ir({ min: r.min?.toString() ?? null, max: r.max?.toString() ?? null })} className="text-[var(--texto)] hover:text-[var(--boton)]">
                  {r.min == null ? `Hasta ${plata(r.max!)}` : r.max == null ? `Más de ${plata(r.min)}` : `${plata(r.min)} a ${plata(r.max)}`}
                  {" "}<span className="text-[var(--texto-2)]">({r.cantidad})</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form action={base} className="flex items-center gap-2">
          {Object.entries(actual).filter(([k, v]) => v && k !== "min" && k !== "max").map(([k, v]) => <input key={k} type="hidden" name={k} value={v!} />)}
          <label className="sr-only" htmlFor={`min-${titulo}`}>Precio mínimo</label>
          <input id={`min-${titulo}`} name="min" inputMode="numeric" placeholder="Mínimo" defaultValue={f.min ?? ""}
            className="h-8 w-full min-w-0 rounded-full border border-[rgba(0,0,0,.25)] bg-white px-3 text-right text-sm outline-none focus:border-[var(--boton)]" />
          <span aria-hidden className="text-[var(--texto-2)]">-</span>
          <label className="sr-only" htmlFor={`max-${titulo}`}>Precio máximo</label>
          <input id={`max-${titulo}`} name="max" inputMode="numeric" placeholder="Máximo" defaultValue={f.max ?? ""}
            className="h-8 w-full min-w-0 rounded-full border border-[rgba(0,0,0,.25)] bg-white px-3 text-right text-sm outline-none focus:border-[var(--boton)]" />
          <button type="submit" aria-label="Aplicar precio" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/25 text-white hover:bg-[var(--boton)]">
            <IconoChevron clase="h-4 w-4 -rotate-90" />
          </button>
        </form>
      </div>
    </div>
  );

  const cantidad = total === 1 ? "1 resultado" : `${total.toLocaleString("es-AR")} resultados`;
  const ordenActual = ORDENES.find(([o]) => o === f.orden)?.[1] ?? "Más relevantes";

  return (
    <div className="space-y-3">
      {migas}
      <div className="flex gap-6">
        <aside className="hidden w-[250px] shrink-0 lg:block">
          <h1 className="text-2xl font-semibold leading-tight text-[var(--texto)] first-letter:uppercase">{titulo}</h1>
          <p className="mb-6 mt-1 text-sm text-[var(--texto-2)]">{cantidad}</p>
          {filtrosHtml}
        </aside>

        <section className="min-w-0 flex-1">
          <div className="mb-3 lg:hidden">
            <h1 className="text-lg font-semibold text-[var(--texto)] first-letter:uppercase">{titulo}</h1>
            <p className="text-xs text-[var(--texto-2)]">{cantidad}</p>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <details className="lg:hidden group">
              <summary className={`${LINK} cursor-pointer list-none font-semibold`}>Filtrar{aplicados.length ? ` (${aplicados.length})` : ""} ▾</summary>
              <div className={`${CAJA} mt-2 p-4`}>{filtrosHtml}</div>
            </details>
            <div className="ml-auto flex items-center gap-4">
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[var(--texto)]">
                  <span className="hidden sm:inline">Ordenar por</span>
                  <span className="font-semibold">{ordenActual}</span><IconoChevron clase="h-4 w-4 text-[var(--boton)]" />
                </summary>
                <ul className={`${CAJA} absolute right-0 z-20 mt-2 w-48 overflow-hidden py-1 shadow-lg`}>
                  {ORDENES.map(([o, nombre]) => (
                    <li key={o}>
                      <Link href={ir({ orden: o })} aria-current={o === f.orden ? "true" : undefined}
                        className={`block px-4 py-2.5 hover:bg-black/[.04] ${o === f.orden ? "border-l-2 border-[var(--boton)] text-[var(--boton)]" : "text-[var(--texto)]"}`}>{nombre}</Link>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="hidden items-center gap-1 sm:flex" role="group" aria-label="Vista">
                <Link href={ir({ vista: "lista" })} aria-label="Ver en lista" aria-current={f.vista === "lista" ? "true" : undefined}
                  className={`grid h-8 w-8 place-items-center rounded ${f.vista === "lista" ? "text-[var(--boton)]" : "text-[var(--texto-2)] hover:text-[var(--texto)]"}`}><IconoLista /></Link>
                <Link href={ir({ vista: "grilla" })} aria-label="Ver en grilla" aria-current={f.vista === "grilla" ? "true" : undefined}
                  className={`grid h-8 w-8 place-items-center rounded ${f.vista === "grilla" ? "text-[var(--boton)]" : "text-[var(--texto-2)] hover:text-[var(--texto)]"}`}><IconoGrilla /></Link>
              </div>
            </div>
          </div>

          {!productos.length ? (
            <div className={`${CAJA} px-6 py-14 text-center`}>
              <p className="text-lg font-semibold text-[var(--texto)]">{f.q ? <>No hay publicaciones que coincidan con “{f.q}”.</> : "No hay productos acá todavía."}</p>
              <ul className="mx-auto mt-3 max-w-sm list-disc space-y-1 pl-5 text-left text-sm text-[var(--texto-2)]">
                <li>Revisá la ortografía de la palabra.</li>
                <li>Usá palabras más genéricas o menos palabras.</li>
                {aplicados.length > 0 && <li><Link href={armar(base, { q: f.q, familia: actual.familia }, {})} className={LINK}>Sacá los filtros</Link> para ver más resultados.</li>}
              </ul>
            </div>
          ) : f.vista === "grilla" ? (
            <Grilla t={t} productos={productos} columnas="lg:grid-cols-3 xl:grid-cols-4" />
          ) : (
            <ul className={CAJA}>{productos.map((p) => <FilaProducto key={p.id} t={t} p={p} />)}</ul>
          )}

          {paginas > 1 && <Paginado pagina={f.pagina} paginas={paginas} ir={(n) => ir({ pagina: String(n) })} />}
        </section>
      </div>
    </div>
  );
}

function Paginado({ pagina, paginas, ir }: { pagina: number; paginas: number; ir: (n: number) => string }) {
  const desde = Math.max(1, Math.min(pagina - 4, paginas - 9));
  const hasta = Math.min(paginas, desde + 9);
  const numeros = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  return (
    <nav aria-label="Páginas" className="mt-8 flex flex-wrap items-center justify-center gap-1 text-sm">
      {pagina > 1 && <Link href={ir(pagina - 1)} className={`${LINK} flex h-10 items-center gap-1 px-3`}><IconoChevron clase="h-4 w-4 rotate-90" /> Anterior</Link>}
      {numeros.map((n) => n === pagina
        ? <span key={n} aria-current="page" className="grid h-10 min-w-[40px] place-items-center rounded bg-black/[.07] px-2 font-semibold text-[var(--texto)]">{n}</span>
        : <Link key={n} href={ir(n)} className="grid h-10 min-w-[40px] place-items-center rounded px-2 text-[var(--texto)] hover:bg-black/[.04]">{n}</Link>)}
      {hasta < paginas && <span className="px-2 text-[var(--texto-2)]">de {paginas}</span>}
      {pagina < paginas && <Link href={ir(pagina + 1)} className={`${LINK} flex h-10 items-center gap-1 px-3`}>Siguiente <IconoChevron clase="h-4 w-4 -rotate-90" /></Link>}
    </nav>
  );
}

// ── Íconos ───────────────────────────────────────────────
const svg = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };
export const IconoCarrito = ({ clase = "h-6 w-6" }: { clase?: string }) => <svg {...svg} className={clase}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L22 7H6" /></svg>;
export const IconoLupa = ({ clase = "h-5 w-5" }: { clase?: string }) => <svg {...svg} className={clase}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const IconoPersona = ({ clase = "h-6 w-6" }: { clase?: string }) => <svg {...svg} className={clase}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
export const IconoFoto = () => <svg {...svg} className="h-10 w-10"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></svg>;
export const IconoTacho = () => <svg {...svg} className="h-4 w-4"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>;
export const IconoPin = ({ clase = "h-5 w-5" }: { clase?: string }) => <svg {...svg} className={clase}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
export const IconoChevron = ({ clase = "h-4 w-4" }: { clase?: string }) => <svg {...svg} className={clase}><path d="m6 9 6 6 6-6" /></svg>;
export const IconoX = ({ clase = "h-5 w-5" }: { clase?: string }) => <svg {...svg} className={clase}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconoMenu = ({ clase = "h-6 w-6" }: { clase?: string }) => <svg {...svg} className={clase}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const IconoCamion = ({ clase = "h-5 w-5" }: { clase?: string }) => <svg {...svg} className={clase}><path d="M2 6h11v10H2zM13 9h5l3 3v4h-8" /><circle cx="6" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></svg>;
export const IconoTienda = ({ clase = "h-5 w-5" }: { clase?: string }) => <svg {...svg} className={clase}><path d="M4 10v10h16V10M3 6l2-3h14l2 3v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M10 20v-5h4v5" /></svg>;
export const IconoEscudo = ({ clase = "h-5 w-5" }: { clase?: string }) => <svg {...svg} className={clase}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
export const IconoVuelta = ({ clase = "h-5 w-5" }: { clase?: string }) => <svg {...svg} className={clase}><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /></svg>;
export const IconoTarjeta = ({ clase = "h-5 w-5" }: { clase?: string }) => <svg {...svg} className={clase}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>;
export const IconoCharla = ({ clase = "h-5 w-5" }: { clase?: string }) => <svg {...svg} className={clase}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>;
export const IconoLista = () => <svg {...svg} className="h-5 w-5"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
export const IconoGrilla = () => <svg {...svg} className="h-5 w-5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
export const IconoWhatsapp = ({ clase = "h-7 w-7" }: { clase?: string }) => (
  <svg viewBox="0 0 24 24" className={clase} fill="currentColor" aria-hidden>
    <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm8.4-18.2A11.8 11.8 0 0 0 1.7 17.8L0 24l6.3-1.7a11.8 11.8 0 0 0 5.7 1.4c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.4-8.3z" />
  </svg>
);
