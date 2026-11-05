// Sourcing › Market Pro › Marcas (Fer, 5/11): qué marcas se venden, cuánto y con cuánta competencia.

import Link from "next/link";
import { VERDE } from "@/app/botones";
import { CAJA_TABLA, Pantalla, TABLA, TD, TDN, THEAD, TR, entrarErp, url } from "@/app/componentes/erp";
import { Paginado, ThOrden } from "@/app/componentes/Lista";
import { categoriasParaElegir, leerFiltro, porMarca, ultimoMes } from "@/lib/marketpro/analisis";
import { estadoMarketPro } from "@/lib/marketpro/llave";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { BarraMarketPro, Filtros, Vacio, colorCrec, crec, entero, linkMarca, millones, pct, pesos } from "../piezas";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

export default async function MarcasMarketPro({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_ver");
  const sp = await searchParams;
  const f = leerFiltro(sp);
  const [mes, categorias] = await Promise.all([ultimoMes(s.org.id), categoriasParaElegir(s.org.id)]);
  const todas = mes ? await porMarca(s.org.id, mes, f) : [];
  const total = todas.reduce((a, m) => a + (m.gmv || 0), 0);
  const filas = ordenarEnMemoria(todas, sp, {
    marca: (x) => x.marca, gmv: (x) => x.gmv, unidades: (x) => x.unidades, ticket: (x) => x.ticket, vendedores: (x) => x.vendedores, productos: (x) => x.productos,
    lider: (x) => x.lider_pct, crec: (x) => x.crecimiento, full: (x) => x.full_pct, conv: (x) => x.conversion, puntaje: (x) => x.puntaje,
  });
  return (
    <Pantalla titulo="Market Pro: marcas" ancho="max-w-7xl" subtitulo="«—» junta las publicaciones sin marca cargada."
      acciones={<a href={url("/market-pro/excel", { vista: "marcas", ...sp })} className={VERDE}>Descargar Excel</a>}>
      <BarraMarketPro activa="marcas" sp={sp} />
      <Filtros sp={sp} categorias={categorias} buscador="Marca" />
      {!mes ? <Vacio hayLlave={!!(await estadoMarketPro(s.org.id))} /> : (
        <>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr>
                <ThOrden col="marca">Marca</ThOrden>
                <ThOrden col="gmv" n porDefecto title="Facturación del período">Fact.</ThOrden>
                <th className="py-1.5 px-2 text-right font-semibold" title="Su facturación sobre la de todas las marcas de lo filtrado">Parte</th>
                <ThOrden col="unidades" n title="Unidades vendidas en el período">Unid.</ThOrden>
                <ThOrden col="ticket" n title="Facturación ÷ unidades">Ticket</ThOrden>
                <ThOrden col="productos" n title="Productos distintos con ventas">Prod.</ThOrden>
                <ThOrden col="vendedores" n title="Vendedores con ventas">Vend.</ThOrden>
                <ThOrden col="lider" n title="Qué parte de las unidades de la marca se lleva el vendedor que más vende">Líder</ThOrden>
                <ThOrden col="crec" n title="Unidades de los últimos 3 meses cerrados contra los 3 anteriores">Crec.</ThOrden>
                <ThOrden col="full" n title="Parte de las unidades vendidas con Full">Full</ThOrden>
                <ThOrden col="conv" n title="Ventas ÷ visitas">Conv.</ThOrden>
                <ThOrden col="puntaje" n title="Puntaje de oportunidad, 0–100">Oport.</ThOrden>
              </tr></thead>
              <tbody>{paginarEnMemoria(filas, sp).map((m) => (
                <tr key={m.marca} className={TR}>
                  <td className={TD}><Link href={linkMarca(m.marca, sp)} className="text-[#16577F]">{m.marca}</Link></td>
                  <td className={TDN}>{millones(m.gmv)}</td><td className={TDN}>{pct(total ? m.gmv / total : null)}</td><td className={TDN}>{entero(m.unidades)}</td><td className={TDN}>{pesos(m.ticket)}</td>
                  <td className={TDN}>{entero(m.productos)}</td><td className={TDN}>{entero(m.vendedores)}</td><td className={TDN}>{pct(m.lider_pct)}</td>
                  <td className={`${TDN} ${colorCrec(m.crecimiento)}`}>{crec(m.crecimiento)}</td><td className={TDN}>{pct(m.full_pct)}</td><td className={TDN}>{pct(m.conversion)}</td>
                  <td className={`${TDN} font-semibold`}>{m.puntaje ?? "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <Paginado total={filas.length} />
        </>
      )}
    </Pantalla>
  );
}
