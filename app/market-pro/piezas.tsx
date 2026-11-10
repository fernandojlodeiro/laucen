// Piezas comunes de las pantallas de Market Pro (Sourcing › Market Pro): la barra de pestañas, los filtros
// (categoría, meses, buscador), los formatos y el gráfico por mes. Los cálculos, en lib/marketpro/analisis.ts.

import Link from "next/link";
import { SUAVE } from "@/app/botones";
import BarraPestanas from "@/app/componentes/Pestanas";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import { Desplegable } from "@/app/informes/Filtros";
import { url } from "@/app/componentes/erp";
import type { Mes } from "@/lib/marketpro/analisis";
import { formatearNumero } from "@/lib/numeros";

type SP = Record<string, string | undefined>;

export const pesos = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
export const millones = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : Math.abs(n) >= 1e6 ? `$ ${formatearNumero(Math.round(n / 1e5) / 10, "decimal")} M` : pesos(n);
export const entero = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : formatearNumero(Math.round(n), "entero"));
export const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${formatearNumero(n * 100, "pct")} %`);
export const crec = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${formatearNumero(n * 100, "pct")} %`);
export const colorCrec = (n: number | null | undefined) => (n == null ? "" : n >= 0.1 ? "text-[#167655]" : n <= -0.1 ? "text-[#C03420]" : "");

/** Los filtros que viajan entre pestañas. */
export const filtrosDe = (sp: SP) => ({ cat: sp.cat ?? null, meses: sp.meses ?? null });

export function BarraMarketPro({ activa, sp }: { activa: string; sp: SP }) {
  const f = filtrosDe(sp);
  const items = [
    ["", "Resumen"], ["informe", "Informe"], ["categorias", "Categorías"], ["productos", "Productos"], ["vendedores", "Vendedores"], ["marcas", "Marcas"], ["importar", "Importar"], ["descarga", "Descarga y llave"],
  ] as const;
  return (
    <BarraPestanas items={items.map(([k, texto]) => ({
      href: k === "descarga" || k === "importar" ? `/market-pro/${k}` : url(`/market-pro${k ? `/${k}` : ""}`, f), texto, activa: activa === k, clave: k || "resumen",
    }))} />
  );
}

export function Filtros({ sp, categorias, buscador, sinMeses = false }: {
  sp: SP; categorias: { valor: string; texto: string }[]; buscador?: string; sinMeses?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3">
      <span className="inline-flex items-center gap-2 text-xs">Categoría
        <ElegirDeLista parametro="cat" limpiar={["p"]} valor={sp.cat ? Number(sp.cat) : null} vacio="Todas las que bajé" etiqueta="Categoría"
          opciones={categorias.map((c) => ({ id: Number(c.valor), texto: c.texto }))} className="w-96" />
      </span>
      {!sinMeses && (
        <Desplegable parametro="meses" etiqueta="Período" valor={sp.meses ?? "12"} limpiar={["p"]} opciones={[
          { valor: "1", texto: "Último mes cerrado" }, { valor: "3", texto: "Últimos 3 meses" }, { valor: "6", texto: "Últimos 6 meses" },
          { valor: "12", texto: "Últimos 12 meses" }, { valor: "24", texto: "Últimos 24 meses" }, { valor: "36", texto: "Desde oct-2023" }]} />
      )}
      {buscador && <BuscadorVivo q={sp.q ?? ""} comienza={false} sinComienza placeholder={buscador} limpiar={["p"]} />}
    </div>
  );
}

/** Barras por mes: la facturación (alto de la barra) y, al pasar el mouse, las unidades y los vendedores. */
export function GraficoMeses({ serie, alto = 120 }: { serie: Mes[]; alto?: number }) {
  if (!serie.length) return null;
  const max = Math.max(...serie.map((m) => m.gmv || 0), 1);
  const ancho = 18, sep = 4;
  const total = serie.length * (ancho + sep);
  return (
    <div className="overflow-x-auto">
      <svg width={total} height={alto + 30} role="img" aria-label="Facturación por mes" className="block">
        {serie.map((m, i) => {
          const h = Math.max(1, ((m.gmv || 0) / max) * alto);
          const x = i * (ancho + sep);
          const corre = i === serie.length - 1 && m.mes === new Date().toISOString().slice(0, 7);
          return (
            <g key={m.mes}>
              <title>{`${m.mes}: ${millones(m.gmv)} · ${entero(m.unidades)} u. · ${entero(m.vendedores)} vendedores · ticket ${pesos(m.ticket)}${corre ? " (mes en curso, incompleto)" : ""}`}</title>
              <rect x={x} y={alto - h} width={ancho} height={h} rx={2} fill={corre ? "#B9CDE0" : "#16577F"} />
              {(i % 3 === 0 || i === serie.length - 1) && (
                <text x={x + ancho / 2} y={alto + 12} fontSize={9} textAnchor="middle" fill="#5C6B76">{m.mes.slice(2).replace("-", "/")}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const linkProducto = (clave: string, sp: SP) => url("/market-pro/productos/ver", { producto: clave, ...filtrosDe(sp) });
export const linkVendedor = (v: string, sp: SP) => url("/market-pro/productos", { vendedor: v, ...filtrosDe(sp) });
export const linkMarca = (m: string, sp: SP) => url("/market-pro/productos", { marca: m, ...filtrosDe(sp) });
export const linkCategoria = (c: number, sp: SP) => url("/market-pro/productos", { ...filtrosDe(sp), cat: c });
export const linkMl = (itemId: string) => `https://articulo.mercadolibre.com.ar/${itemId.replace(/^MLA/i, "MLA-")}`;

/** Dónde ver un producto en Mercado Libre (Market Pro cifra el número de publicación): la página del producto de
 *  catálogo si lo es; si no, la búsqueda por su título. */
export function linkProductoMl(producto: string, titulo: string | null): string | null {
  if (producto.startsWith("c:")) return `https://www.mercadolibre.com.ar/p/MLA${producto.slice(2)}`;
  const t = (titulo ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().replace(/\s+/g, "-");
  return t ? `https://listado.mercadolibre.com.ar/${t}` : null;
}

export function VerEnMl({ producto, titulo, boton = false }: { producto: string; titulo: string | null; boton?: boolean }) {
  const href = linkProductoMl(producto, titulo);
  if (!href) return null;
  const texto = producto.startsWith("c:") ? "Ver el catálogo en Mercado Libre" : "Buscar en Mercado Libre";
  return boton
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={SUAVE}>{texto} ↗</a>
    : <a href={href} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#16577F]" title={texto}>↗</a>;
}

export function Ml({ itemId }: { itemId: string }) {
  // Market Pro cifra el número de publicación: sólo hay link cuando viene un MLA de verdad.
  if (!/^MLA\d+$/i.test(itemId)) return null;
  return <a href={linkMl(itemId)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]" title="Ver en Mercado Libre">↗</a>;
}

export function Vacio({ hayLlave }: { hayLlave: boolean }) {
  return (
    <p className="text-xs rounded-lg px-3 py-3 bg-[#FFF8E6] border border-[#F2DFAE] text-[#7A5B00]">
      {hayLlave
        ? "Todavía no hay datos bajados de Market Pro. La descarga sigue sola de fondo; mirá cómo va en "
        : "Falta cargar la llave de Market Pro. Se pega en "}
      <Link href="/market-pro/descarga" className="underline">Descarga y llave</Link>.
    </p>
  );
}

export const REPUTACION: Record<string, string> = { official_store: "Tienda oficial", platinum: "Platinum", gold: "Gold", silver: "Silver", no_medal: "Sin medalla" };
export const ENVIO: Record<string, string> = { full: "Full", flex: "Flex", cross_docking: "Colecta", cross_docking_with_drop_off: "Colecta + punto", drop_off: "Punto de despacho", me1: "ME1", other: "Otro" };
