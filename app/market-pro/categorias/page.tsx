// Sourcing › Market Pro › Categorías (Fer, 5/11): cada categoría con ventas, cuánto mueve y cuánta competencia tiene.

import Link from "next/link";
import { VERDE } from "@/app/botones";
import { CAJA_TABLA, Pantalla, TABLA, TD, TDN, THEAD, TR, entrarErp, url } from "@/app/componentes/erp";
import { Paginado, ThOrden } from "@/app/componentes/Lista";
import TituloCorto from "@/app/componentes/TituloCorto";
import { categoriasParaElegir, leerFiltro, porCategoria, ultimoMes } from "@/lib/marketpro/analisis";
import { estadoMarketPro } from "@/lib/marketpro/llave";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { BarraMarketPro, Filtros, Vacio, colorCrec, crec, entero, linkCategoria, millones, pct, pesos } from "../piezas";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

export default async function CategoriasMarketPro({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_ver");
  const sp = await searchParams;
  const f = leerFiltro(sp);
  const [mes, categorias] = await Promise.all([ultimoMes(s.org.id), categoriasParaElegir(s.org.id)]);
  const todas = mes ? (await porCategoria(s.org.id, mes, f)).filter((c) => !f.q || (c.ruta ?? "").toLowerCase().includes(f.q.toLowerCase())) : [];
  const filas = ordenarEnMemoria(todas, sp, {
    ruta: (x) => x.ruta, gmv: (x) => x.gmv, unidades: (x) => x.unidades, ticket: (x) => x.ticket, vendedores: (x) => x.vendedores, publicaciones: (x) => x.publicaciones,
    lider: (x) => x.lider_pct, crec: (x) => x.crecimiento, full: (x) => x.full_pct, conv: (x) => x.conversion, comision: (x) => x.comision, puntaje: (x) => x.puntaje,
  });
  return (
    <Pantalla titulo="Market Pro: categorías" ancho="max-w-7xl" subtitulo="Cada categoría con ventas del período: cuánto factura, cuánto crece y cuánta competencia tiene."
      acciones={<a href={url("/market-pro/excel", { vista: "categorias", ...sp })} className={VERDE}>Descargar Excel</a>}>
      <BarraMarketPro activa="categorias" sp={sp} />
      <Filtros sp={sp} categorias={categorias} buscador="Nombre de la categoría" />
      {!mes ? <Vacio hayLlave={!!(await estadoMarketPro(s.org.id))} /> : (
        <>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr>
                <ThOrden col="ruta">Categoría</ThOrden>
                <ThOrden col="gmv" n porDefecto title="Facturación del período">Fact.</ThOrden>
                <ThOrden col="unidades" n title="Unidades vendidas en el período">Unid.</ThOrden>
                <ThOrden col="ticket" n title="Facturación ÷ unidades">Ticket</ThOrden>
                <ThOrden col="vendedores" n title="Vendedores con ventas">Vend.</ThOrden>
                <ThOrden col="publicaciones" n title="Publicaciones con ventas">Pubs.</ThOrden>
                <ThOrden col="lider" n title="Qué parte de las unidades se lleva el vendedor que más vende">Líder</ThOrden>
                <ThOrden col="crec" n title="Unidades de los últimos 3 meses cerrados contra los 3 anteriores">Crec.</ThOrden>
                <ThOrden col="full" n title="Parte de las unidades vendidas con Full">Full</ThOrden>
                <ThOrden col="conv" n title="Ventas ÷ visitas">Conv.</ThOrden>
                <ThOrden col="comision" n title="Comisión Clásica de Mercado Libre (sólo en las categorías donde publicás)">Com.</ThOrden>
                <ThOrden col="puntaje" n title="Puntaje de oportunidad, 0–100: mucha facturación, creciendo, pocos vendedores y sin un líder que se lleve todo">Oport.</ThOrden>
              </tr></thead>
              <tbody>{paginarEnMemoria(filas, sp).map((c) => (
                <tr key={c.cat} className={TR}>
                  <td className={`${TD} max-w-96`}><Link href={linkCategoria(c.cat, sp)} className="text-[#16577F]"><TituloCorto titulo={c.ruta ?? `MLA${c.cat}`} className="!text-[#16577F]" /></Link></td>
                  <td className={TDN}>{millones(c.gmv)}</td><td className={TDN}>{entero(c.unidades)}</td><td className={TDN}>{pesos(c.ticket)}</td>
                  <td className={TDN}>{entero(c.vendedores)}</td><td className={TDN}>{entero(c.publicaciones)}</td><td className={TDN}>{pct(c.lider_pct)}</td>
                  <td className={`${TDN} ${colorCrec(c.crecimiento)}`}>{crec(c.crecimiento)}</td><td className={TDN}>{pct(c.full_pct)}</td>
                  <td className={TDN}>{pct(c.conversion)}</td><td className={TDN}>{c.comision != null ? pct(c.comision / 100) : "—"}</td><td className={`${TDN} font-semibold`}>{c.puntaje ?? "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <Paginado total={filas.length} />
        </>
      )}
    </Pantalla>
  );
}
