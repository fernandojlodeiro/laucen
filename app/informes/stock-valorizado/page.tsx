// Informe: stock valorizado. Código, descripción, costo, stock y stock × costo,
// con el total al final. Los importes se ven en pesos, en dólares o en las dos
// (selector "Moneda"), convertidos con el tipo de cambio de hoy. Filtros
// arriba; "Descargar Excel" baja lo mismo con los mismos filtros.

import Link from "next/link";
import { VERDE } from "@/app/botones";
import { InterruptorFiltro } from "@/app/radar/Piezas";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import { entrarErp, Pantalla, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { COSTOS, MONEDAS, aDobleMoneda, depositosYUbicaciones, leerFiltroValorizado, stockValorizado, totalesValorizado, type FilaValorizadoDoble } from "@/lib/informes/inventario";
import { tcDelDia } from "@/lib/moneda";
import { Desplegable } from "../Filtros";

export const dynamic = "force-dynamic";

const BASE = "/informes/stock-valorizado";
const EN_PANTALLA = 500;

type SP = Record<string, string | undefined>;

const entero = (n: number) => n.toLocaleString("es-AR");
const importe = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
type Mon = "ARS" | "USD";
const signo = (m: Mon) => (m === "USD" ? "US$" : "$");
const nombreMon = (m: Mon) => (m === "USD" ? "dólares" : "pesos");

export default async function StockValorizado({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_stock_ver");
  const sp = await searchParams;
  const f = leerFiltroValorizado(sp);
  const [{ depositos }, crudas, tc] = await Promise.all([depositosYUbicaciones(s.org.id), stockValorizado(s.org.id, f), tcDelDia(s.org.id)]);
  const filas = aDobleMoneda(crudas, tc?.venta ?? null);
  const t = totalesValorizado(filas);
  const monedas: Mon[] = f.moneda === "ars" ? ["ARS"] : f.moneda === "usd" ? ["USD"] : ["ARS", "USD"];
  const ambas = monedas.length > 1;
  const params = { q: f.q || null, contiene: f.comienza ? null : "1", dep: f.depositoId, todos: f.conStock ? null : "1", inactivos: f.inactivos ? "1" : null, costo: f.costo === "fob" ? null : f.costo, moneda: f.moneda === "ars" ? null : f.moneda };
  const costoDe = (r: FilaValorizadoDoble, m: Mon) => (m === "USD" ? r.costo_usd : r.costo_ars);
  const valorDe = (r: FilaValorizadoDoble, m: Mon) => (m === "USD" ? r.valorizado_usd : r.valorizado_ars);
  const columnas = 3 + monedas.length * 2 + 1;
  const subtitulo = tc
    ? `Convertido con el tipo de cambio oficial de ${tc.fecha.split("-").reverse().join("/")}: $ ${importe(tc.venta)} por dólar.`
    : "No hay tipo de cambio cargado: los costos que están en la otra moneda no se pueden convertir (Configuración → Tipo de cambio).";

  return (
    <Pantalla titulo="Stock valorizado" subtitulo={<>Cada producto con su costo, su stock y el stock por el costo. Los kits no entran: su stock está en los componentes.<br />{subtitulo}</>}
      acciones={<a href={url(`${BASE}/excel`, params)} className={VERDE}>Descargar Excel</a>}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={f.q} comienza={f.comienza} inactivos={f.inactivos} placeholder="SKU o descripción" />
        <Desplegable parametro="dep" etiqueta="Depósito" valor={String(f.depositoId ?? "")}
          opciones={[{ valor: "", texto: "Todos" }, ...depositos.map((d) => ({ valor: String(d.id), texto: d.nombre }))]} />
        <Desplegable parametro="costo" etiqueta="Costo" valor={f.costo === "fob" ? "" : f.costo}
          opciones={Object.entries(COSTOS).map(([k, v]) => ({ valor: k === "fob" ? "" : k, texto: v }))} />
        <Desplegable parametro="moneda" etiqueta="Moneda" valor={f.moneda === "ars" ? "" : f.moneda}
          opciones={Object.entries(MONEDAS).map(([k, v]) => ({ valor: k === "ars" ? "" : k, texto: v }))} />
        <InterruptorFiltro href={url(BASE, { ...params, todos: f.conStock ? "1" : null })} prendido={f.conStock} etiqueta="Sólo con stock" />
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Código</th><th className={TH}>Descripción</th><th className={TH}>Familia</th>
              {monedas.map((m) => <th key={`c${m}`} className={THN}>Costo{ambas ? ` (${signo(m)})` : ""}</th>)}
              <th className={THN}>Stock</th>
              {monedas.map((m) => <th key={`v${m}`} className={THN}>Valorizado{ambas ? ` (${signo(m)})` : ""}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={columnas} className={`${TD} text-[#5C6B76]`}>Nada coincide con los filtros.</td></tr>}
            {filas.slice(0, EN_PANTALLA).map((r) => (
              <tr key={r.sku} className={TR}>
                <td className={`${TD} whitespace-nowrap font-semibold`}>
                  <Link href={`/catalogo/productos/${r.producto_id}`} className="text-[#16577F] hover:underline">{r.sku}</Link>
                </td>
                <td className={TD}>{r.titulo}</td>
                <td className={`${TD} text-[#5C6B76]`}>{r.familia ?? "—"}</td>
                {monedas.map((m) => {
                  const c = costoDe(r, m);
                  return (
                    <td key={`c${m}`} className={`${TDN} whitespace-nowrap`}>
                      {r.costo == null ? <span className="text-[#8a6100]">sin costo</span>
                        : c == null ? <span className="text-[#8a6100]" title="Falta el tipo de cambio">sin TC</span>
                        : `${signo(m)} ${importe(c)}`}
                    </td>
                  );
                })}
                <td className={`${TDN} ${r.stock < 0 ? "text-[#C03420] font-semibold" : ""}`}>{entero(r.stock)}</td>
                {monedas.map((m) => {
                  const v = valorDe(r, m);
                  return <td key={`v${m}`} className={`${TDN} whitespace-nowrap`}>{v == null ? "—" : `${signo(m)} ${importe(v)}`}</td>;
                })}
              </tr>
            ))}
            {filas.length > 0 && (
              <tr className={`${TR} font-bold bg-[#FAFBFC]`}>
                <td className={TD} colSpan={3 + monedas.length}>
                  Total stock valorizado
                  {monedas.map((m) => {
                    const sin = m === "USD" ? t.sinCostoUsd : t.sinCostoArs;
                    return sin > 0 && (
                      <span key={m} className="ml-2 font-normal text-[11px] text-[#8a6100]">
                        {entero(sin)} producto(s) sin costo{tc ? "" : " o sin tipo de cambio"} no suman{ambas ? ` en ${nombreMon(m)}` : ""}
                      </span>
                    );
                  })}
                </td>
                <td className={TDN}>{entero(t.stock)}</td>
                {monedas.map((m) => <td key={m} className={`${TDN} whitespace-nowrap`}>{signo(m)} {importe(m === "USD" ? t.usd : t.ars)}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filas.length > EN_PANTALLA && (
        <p className="text-[11px] text-[#5C6B76] mt-1">Se ven los primeros {EN_PANTALLA} de {entero(filas.length)}; el total es de todos. El Excel trae todos.</p>
      )}
    </Pantalla>
  );
}
