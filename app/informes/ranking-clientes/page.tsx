// Informe: ranking de clientes (lib/informes/ranking-clientes.ts). Los 40 que más compraron en el período, por
// cantidad de compras, productos distintos o monto; con la caja para dejar afuera las notebooks.

import Link from "next/link";
import RangoFechas from "@/app/componentes/RangoFechas";
import { CasillaViva } from "@/app/componentes/BuscadorVivo";
import { entrarErp, Pantalla, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { fecha } from "@/app/ventas/formato";
import { ORDENES_RANKING, TOPE_RANKING, leerFiltroRanking, rankingClientes, type FilaRanking } from "@/lib/informes/ranking-clientes";
import { Desplegable } from "../Filtros";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SP = Record<string, string | undefined>;
const pesos = (n: number) => `$ ${formatearNumero(Math.round(n), "pesos")}`;
const entero = (n: number) => formatearNumero(n, "entero");

/** Adónde lleva el nombre: la ficha del cliente, o sus compras en el historial de ventas. */
function enlace(r: FilaRanking, periodo: { desde: string; hasta: string }) {
  const filtro = { desde: periodo.desde || null, hasta: periodo.hasta || null };
  if (r.cliente_id) return `/ventas/clientes/${r.cliente_id}`;
  if (r.ml_comprador) return url("/ventas/historial", { ...filtro, comprador: r.ml_comprador });
  return url("/ventas/historial", { ...filtro, q: `?${r.nombre}` });
}

export default async function RankingClientes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_ventas_ver");
  const sp = await searchParams;
  const f = leerFiltroRanking(sp);
  const filas = await rankingClientes(s.org.id, f);
  const fuerte = (col: keyof typeof ORDENES_RANKING) => (f.orden === col ? "font-bold" : "");

  return (
    <Pantalla titulo="Ranking de clientes"
      subtitulo={`Los ${TOPE_RANKING} clientes que más compraron en el período, en todos los canales (Mercado Libre, web, local y el historial de Virtual Seller), sin ventas canceladas. Montos en pesos de cada momento.`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <RangoFechas desde={f.desde} hasta={f.hasta} vacio="Toda la historia" />
        <Desplegable parametro="orden" etiqueta={`Top ${TOPE_RANKING} por`} valor={f.orden === "monto" ? "" : f.orden}
          opciones={Object.entries(ORDENES_RANKING).map(([k, v]) => ({ valor: k === "monto" ? "" : k, texto: v }))} />
        <CasillaViva parametro="sin_notebooks" activo={f.sinNotebooks} etiqueta="Excluye compras de notebooks" />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={THN}>#</th><th className={TH}>Cliente</th><th className={TH}>Último canal</th>
              <th className={`${THN} ${fuerte("compras")}`}>Compras</th><th className={`${THN} ${fuerte("productos")}`}>Productos distintos</th>
              <th className={THN}>Unidades</th><th className={`${THN} ${fuerte("monto")}`}>Monto</th><th className={THN}>Ticket promedio</th>
              <th className={THN}>Primera compra</th><th className={THN}>Última compra</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>No hay ventas en ese período.</td></tr>}
            {filas.map((r) => (
              <tr key={`${r.puesto}-${r.nombre}`} className={TR}>
                <td className={TDN}>{r.puesto}</td>
                <td className={TD}>
                  {r.cliente_id && <span className="text-[#5C6B76] tabular-nums mr-1.5">N.º {r.cliente_id}</span>}
                  <Link href={enlace(r, f)} className="text-[#16577F] hover:underline">{r.nombre}</Link>
                  {!r.cliente_id && <span className="text-[10px] text-[#5C6B76] ml-1.5">{r.ml_comprador ? "comprador de ML" : "de Virtual Seller"}</span>}
                </td>
                <td className={TD}>{r.canal ?? "—"}</td>
                <td className={`${TDN} ${fuerte("compras")}`}>{entero(r.compras)}</td>
                <td className={`${TDN} ${fuerte("productos")}`}>{entero(r.productos)}</td>
                <td className={TDN}>{entero(r.unidades)}</td>
                <td className={`${TDN} ${fuerte("monto")}`}>{pesos(r.monto)}</td>
                <td className={TDN}>{pesos(r.compras ? r.monto / r.compras : 0)}</td>
                <td className={TDN}>{fecha(r.primera)}</td>
                <td className={TDN}>{fecha(r.ultima)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
