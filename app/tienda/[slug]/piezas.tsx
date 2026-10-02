// Piezas de la tienda pública (servidor): precio, cucardas, tarjeta de
// producto, grilla, orden y paginado. El color de la tienda llega como la
// variable CSS --acento (la pone el layout).

import Link from "next/link";
import { formatear, type Moneda } from "@/lib/moneda";
import { rutaTienda, type Tienda } from "@/lib/tienda/tienda";
import { listarProductos, POR_PAGINA, type Cucarda, type Orden, type Tarjeta } from "./catalogo";

// ── Estilos comunes ──────────────────────────────────────
export const BOTON = "inline-flex items-center justify-center gap-2 rounded-xl px-5 h-12 text-base font-semibold text-white bg-[var(--acento)] hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition";
export const BOTON_SUAVE = "inline-flex items-center justify-center gap-2 rounded-xl px-5 h-12 text-base font-semibold border border-gray-300 bg-white text-gray-800 hover:border-[var(--acento)] hover:text-[var(--acento)] transition";
export const CAMPO = "w-full h-12 rounded-xl border border-gray-300 bg-white px-3 text-base outline-none focus:border-[var(--acento)] focus:ring-1 focus:ring-[var(--acento)]";
export const ETIQUETA = "block text-sm font-medium text-gray-700 mb-1";
export const TITULO = "text-xl sm:text-2xl font-bold tracking-tight";

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "error" | "ok"; children: React.ReactNode }) {
  const c = tipo === "error" ? "bg-red-50 text-red-800 border-red-200" : tipo === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-amber-50 text-amber-900 border-amber-200";
  return <div role={tipo === "error" ? "alert" : undefined} className={`rounded-xl border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

/** Los avisos que dejan las acciones en la dirección (?ok= / ?error=). */
export function AvisosUrl({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  if (!ok && !error) return null;
  return <div className="mb-4">{error ? <Aviso tipo="error">{error}</Aviso> : <Aviso tipo="ok">{ok}</Aviso>}</div>;
}

export function Cucardas({ lista, chica }: { lista: Cucarda[]; chica?: boolean }) {
  if (!lista.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {lista.map((c) => (
        <span key={c.nombre} style={{ backgroundColor: c.color }}
          className={`rounded-md font-semibold text-white ${chica ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs"}`}>{c.nombre}</span>
      ))}
    </div>
  );
}

export const pctOff = (lista: number, venta: number) => (lista > 0 && venta < lista ? Math.round((1 - venta / lista) * 100) : 0);

/** Precio de lista tachado (si hay descuento), precio de venta y "% OFF". */
export function Precio({ lista, venta, moneda, desde, grande }: { lista: number; venta: number; moneda: Moneda; desde?: boolean; grande?: boolean }) {
  const off = pctOff(lista, venta);
  return (
    <div>
      {off > 0 && <div className={`text-gray-400 line-through ${grande ? "text-base" : "text-xs"}`}>{formatear(lista, moneda)}</div>}
      <div className="flex items-baseline gap-2 flex-wrap">
        {desde && <span className={`text-gray-500 ${grande ? "text-base" : "text-xs"}`}>desde</span>}
        <span className={`font-bold text-gray-900 ${grande ? "text-3xl" : "text-lg"}`}>{formatear(venta, moneda)}</span>
        {off > 0 && <span className={`font-semibold text-green-700 ${grande ? "text-lg" : "text-sm"}`}>{off}% OFF</span>}
      </div>
    </div>
  );
}

export function TarjetaProducto({ t, p }: { t: Tienda; p: Tarjeta }) {
  const sinStock = p.stock <= 0;
  return (
    <Link href={rutaTienda(t, `/producto/${p.id}`)} className="group flex flex-col rounded-2xl border border-gray-100 bg-white overflow-hidden hover:shadow-lg hover:border-gray-200 transition">
      <div className="relative aspect-square bg-gray-50">
        {p.foto
          ? <img src={p.foto} alt={p.titulo} loading="lazy" className={`h-full w-full object-contain p-2 group-hover:scale-[1.03] transition ${sinStock ? "opacity-50" : ""}`} />
          : <div className="h-full w-full grid place-items-center text-gray-300"><IconoFoto /></div>}
        <div className="absolute left-2 top-2"><Cucardas lista={p.cucardas} chica /></div>
        {sinStock && <span className="absolute bottom-2 left-2 rounded-md bg-gray-800/80 px-2 py-0.5 text-xs font-semibold text-white">Sin stock</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="text-sm text-gray-700 line-clamp-2 min-h-[2.5rem]">{p.titulo}</h3>
        <Precio lista={p.lista} venta={p.venta} moneda={t.moneda} desde={p.variaciones > 1} />
        {p.cuotas && (
          <div className="text-xs font-medium text-green-700">
            {p.cuotas.cuotas} cuotas sin interés de {formatear(Math.round((p.venta / p.cuotas.cuotas) * 100) / 100, t.moneda)}
          </div>
        )}
      </div>
    </Link>
  );
}

export function Grilla({ t, productos }: { t: Tienda; productos: Tarjeta[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
      {productos.map((p) => <TarjetaProducto key={p.id} t={t} p={p} />)}
    </div>
  );
}

const conParams = (base: string, params: Record<string, string | number | null | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "" && !(k === "pagina" && Number(v) === 1) && !(k === "orden" && v === "relevancia")) u.set(k, String(v));
  const s = u.toString();
  return s ? `${base}?${s}` : base;
};

/** Listado con orden y paginado (búsqueda y familias). */
export async function Listado({ t, base, q, familiaId, orden, pagina }: { t: Tienda; base: string; q?: string | null; familiaId?: number | null; orden: Orden; pagina: number }) {
  const { productos, total } = await listarProductos(t, { q, familiaId, orden, pagina });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const ordenes: [Orden, string][] = [["relevancia", q ? "Más relevantes" : "Más nuevos"], ["menor", "Menor precio"], ["mayor", "Mayor precio"]];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">{total === 1 ? "1 producto" : `${total.toLocaleString("es-AR")} productos`}</p>
        <nav aria-label="Ordenar" className="flex rounded-xl border border-gray-200 p-1 text-sm">
          {ordenes.map(([o, nombre]) => (
            <Link key={o} href={conParams(base, { q, orden: o })} aria-current={o === orden ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 whitespace-nowrap ${o === orden ? "bg-[var(--acento)] text-white font-semibold" : "text-gray-600 hover:text-gray-900"}`}>{nombre}</Link>
          ))}
        </nav>
      </div>
      {productos.length ? <Grilla t={t} productos={productos} /> : (
        <div className="rounded-2xl bg-gray-50 px-4 py-12 text-center text-gray-500">
          {q ? <>No encontramos nada para “{q}”. Probá con otra palabra.</> : "Todavía no hay productos acá."}
        </div>
      )}
      {paginas > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-center gap-2 pt-2">
          {pagina > 1 ? <Link className={BOTON_SUAVE} href={conParams(base, { q, orden, pagina: pagina - 1 })}>← Anterior</Link> : <span className={`${BOTON_SUAVE} opacity-40 pointer-events-none`}>← Anterior</span>}
          <span className="px-2 text-sm text-gray-500">Página {pagina} de {paginas}</span>
          {pagina < paginas ? <Link className={BOTON_SUAVE} href={conParams(base, { q, orden, pagina: pagina + 1 })}>Siguiente →</Link> : <span className={`${BOTON_SUAVE} opacity-40 pointer-events-none`}>Siguiente →</span>}
        </nav>
      )}
    </div>
  );
}

// ── Íconos ───────────────────────────────────────────────
const svg = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };
export const IconoCarrito = () => <svg {...svg} className="h-6 w-6"><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L22 7H6" /></svg>;
export const IconoLupa = () => <svg {...svg} className="h-5 w-5"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const IconoPersona = () => <svg {...svg} className="h-6 w-6"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
export const IconoFoto = () => <svg {...svg} className="h-10 w-10"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></svg>;
export const IconoTacho = () => <svg {...svg} className="h-4 w-4"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>;
export const IconoWhatsapp = ({ clase = "h-7 w-7" }: { clase?: string }) => (
  <svg viewBox="0 0 24 24" className={clase} fill="currentColor" aria-hidden>
    <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm8.4-18.2A11.8 11.8 0 0 0 1.7 17.8L0 24l6.3-1.7a11.8 11.8 0 0 0 5.7 1.4c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.4-8.3z" />
  </svg>
);
