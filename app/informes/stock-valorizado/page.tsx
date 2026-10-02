// Informe: stock valorizado. Código, descripción, costo, stock y stock × costo,
// con el total al final (uno por moneda del costo). Filtros arriba; "Descargar
// Excel" baja lo mismo con los mismos filtros.

import { VERDE } from "@/app/botones";
import { InterruptorFiltro } from "@/app/radar/Piezas";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import { entrarErp, Pantalla, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { COSTOS, depositosYUbicaciones, leerFiltroValorizado, stockValorizado, totalesValorizado } from "@/lib/informes/inventario";
import { Desplegable } from "../Filtros";

export const dynamic = "force-dynamic";

const BASE = "/informes/stock-valorizado";
const EN_PANTALLA = 500;

type SP = Record<string, string | undefined>;

const entero = (n: number) => n.toLocaleString("es-AR");
const importe = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const signo = (m: string) => (m === "USD" ? "US$" : "$");

export default async function StockValorizado({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_stock_ver");
  const sp = await searchParams;
  const f = leerFiltroValorizado(sp);
  const [{ depositos }, filas] = await Promise.all([depositosYUbicaciones(s.org.id), stockValorizado(s.org.id, f)]);
  const totales = totalesValorizado(filas);
  const params = { q: f.q || null, contiene: f.comienza ? null : "1", dep: f.depositoId, todos: f.conStock ? null : "1", inactivos: f.inactivos ? "1" : null, costo: f.costo === "fob" ? null : f.costo };

  return (
    <Pantalla titulo="Stock valorizado" subtitulo="Cada producto con su costo, su stock y el stock por el costo. Los kits no entran: su stock está en los componentes."
      acciones={<a href={url(`${BASE}/excel`, params)} className={VERDE}>Descargar Excel</a>}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={f.q} comienza={f.comienza} inactivos={f.inactivos} placeholder="SKU o descripción" />
        <Desplegable parametro="dep" etiqueta="Depósito" valor={String(f.depositoId ?? "")}
          opciones={[{ valor: "", texto: "Todos" }, ...depositos.map((d) => ({ valor: String(d.id), texto: d.nombre }))]} />
        <Desplegable parametro="costo" etiqueta="Costo" valor={f.costo === "fob" ? "" : f.costo}
          opciones={Object.entries(COSTOS).map(([k, v]) => ({ valor: k === "fob" ? "" : k, texto: v }))} />
        <InterruptorFiltro href={url(BASE, { ...params, todos: f.conStock ? "1" : null })} prendido={f.conStock} etiqueta="Sólo con stock" />
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Código</th><th className={TH}>Descripción</th><th className={TH}>Familia</th>
              <th className={THN}>Costo</th><th className={THN}>Stock</th><th className={THN}>Valorizado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Nada coincide con los filtros.</td></tr>}
            {filas.slice(0, EN_PANTALLA).map((r) => (
              <tr key={r.sku} className={TR}>
                <td className={`${TD} whitespace-nowrap font-semibold`}>{r.sku}</td>
                <td className={TD}>{r.titulo}</td>
                <td className={`${TD} text-[#5C6B76]`}>{r.familia ?? "—"}</td>
                <td className={`${TDN} whitespace-nowrap`}>{r.costo == null ? <span className="text-[#8a6100]">sin costo</span> : `${signo(r.moneda)} ${importe(r.costo)}`}</td>
                <td className={`${TDN} ${r.stock < 0 ? "text-[#C03420] font-semibold" : ""}`}>{entero(r.stock)}</td>
                <td className={`${TDN} whitespace-nowrap`}>{r.valorizado == null ? "—" : `${signo(r.moneda)} ${importe(r.valorizado)}`}</td>
              </tr>
            ))}
            {totales.map((t) => (
              <tr key={t.moneda} className={`${TR} font-bold bg-[#FAFBFC]`}>
                <td className={TD} colSpan={4}>
                  Total stock valorizado{totales.length > 1 ? ` (costos en ${t.moneda === "USD" ? "dólares" : "pesos"})` : ""}
                  {t.sinCosto > 0 && <span className="ml-2 font-normal text-[11px] text-[#8a6100]">{entero(t.sinCosto)} producto(s) sin costo no suman</span>}
                </td>
                <td className={TDN}>{entero(t.stock)}</td>
                <td className={`${TDN} whitespace-nowrap`}>{signo(t.moneda)} {importe(t.valorizado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length > EN_PANTALLA && (
        <p className="text-[11px] text-[#5C6B76] mt-1">Se ven los primeros {EN_PANTALLA} de {entero(filas.length)}; el total es de todos. El Excel trae todos.</p>
      )}
    </Pantalla>
  );
}
