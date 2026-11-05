// Sourcing › Market Pro › Vendedores (Fer, 5/11): contra quién competimos. El apodo viene ofuscado por Mercado Libre;
// las publicaciones que son de nuestras cuentas se marcan «nosotros».

import Link from "next/link";
import { VERDE } from "@/app/botones";
import { CAJA_TABLA, Pantalla, TABLA, TD, TDN, THEAD, TR, entrarErp, url } from "@/app/componentes/erp";
import { Paginado, ThOrden } from "@/app/componentes/Lista";
import TituloCorto from "@/app/componentes/TituloCorto";
import { categoriasParaElegir, leerFiltro, porVendedor, ultimoMes } from "@/lib/marketpro/analisis";
import { estadoMarketPro } from "@/lib/marketpro/llave";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { BarraMarketPro, Filtros, REPUTACION, Vacio, colorCrec, crec, entero, linkVendedor, millones, pct, pesos } from "../piezas";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

export default async function VendedoresMarketPro({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_ver");
  const sp = await searchParams;
  const f = leerFiltro(sp);
  const [mes, categorias] = await Promise.all([ultimoMes(s.org.id), categoriasParaElegir(s.org.id)]);
  const todas = mes ? await porVendedor(s.org.id, mes, f) : [];
  const filas = ordenarEnMemoria(todas, sp, {
    vendedor: (x) => x.vendedor, gmv: (x) => x.gmv, unidades: (x) => x.unidades, ticket: (x) => x.ticket, parte: (x) => x.lider_pct, crec: (x) => x.crecimiento,
    productos: (x) => x.productos, publicaciones: (x) => x.publicaciones, full: (x) => x.full_pct, premium: (x) => x.premium_pct, catalogo: (x) => x.catalogo_pct,
    conv: (x) => x.conversion, reputacion: (x) => x.reputacion, provincia: (x) => x.provincia,
  });
  return (
    <Pantalla titulo="Market Pro: vendedores" ancho="max-w-7xl" subtitulo="Contra quién competimos. Mercado Libre obliga a mostrar el apodo ofuscado; «nosotros» marca los que tienen publicaciones de nuestras cuentas."
      acciones={<a href={url("/market-pro/excel", { vista: "vendedores", ...sp })} className={VERDE}>Descargar Excel</a>}>
      <BarraMarketPro activa="vendedores" sp={sp} />
      <Filtros sp={sp} categorias={categorias} buscador="Apodo del vendedor" />
      {!mes ? <Vacio hayLlave={!!(await estadoMarketPro(s.org.id))} /> : (
        <>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr>
                <ThOrden col="vendedor">Vendedor</ThOrden>
                <ThOrden col="gmv" n porDefecto title="Facturación del período">Fact.</ThOrden>
                <ThOrden col="parte" n title="Su facturación sobre la de todos los vendedores de lo filtrado">Parte</ThOrden>
                <ThOrden col="unidades" n title="Unidades vendidas en el período">Unid.</ThOrden>
                <ThOrden col="ticket" n title="Facturación ÷ unidades">Ticket</ThOrden>
                <ThOrden col="crec" n title="Unidades de los últimos 3 meses cerrados contra los 3 anteriores">Crec.</ThOrden>
                <ThOrden col="productos" n title="Productos distintos con ventas">Prod.</ThOrden>
                <ThOrden col="publicaciones" n title="Publicaciones con ventas">Pubs.</ThOrden>
                <ThOrden col="full" n title="Parte de sus unidades vendidas con Full">Full</ThOrden>
                <ThOrden col="premium" n title="Parte de sus unidades vendidas en Premium">Prem.</ThOrden>
                <ThOrden col="catalogo" n title="Parte de sus unidades vendidas en publicaciones de catálogo">Catál.</ThOrden>
                <ThOrden col="conv" n title="Ventas ÷ visitas">Conv.</ThOrden>
                <ThOrden col="reputacion">Reputación</ThOrden>
                <ThOrden col="provincia">Provincia</ThOrden>
                <th className="py-1.5 px-2 text-left font-semibold">Donde más vende</th>
              </tr></thead>
              <tbody>{paginarEnMemoria(filas, sp).map((v) => (
                <tr key={v.vendedor} className={TR}>
                  <td className={TD}><Link href={linkVendedor(v.vendedor, sp)} className="text-[#16577F]">{v.vendedor}</Link>
                    {v.nuestras > 0 && <span className="ml-1 text-[10px] rounded bg-[#EEF7F1] px-1 text-[#1F6E4A]">nosotros</span>}</td>
                  <td className={TDN}>{millones(v.gmv)}</td><td className={TDN}>{pct(v.lider_pct)}</td><td className={TDN}>{entero(v.unidades)}</td><td className={TDN}>{pesos(v.ticket)}</td>
                  <td className={`${TDN} ${colorCrec(v.crecimiento)}`}>{crec(v.crecimiento)}</td><td className={TDN}>{entero(v.productos)}</td><td className={TDN}>{entero(v.publicaciones)}</td>
                  <td className={TDN}>{pct(v.full_pct)}</td><td className={TDN}>{pct(v.premium_pct)}</td><td className={TDN}>{pct(v.catalogo_pct)}</td><td className={TDN}>{pct(v.conversion)}</td>
                  <td className={TD}>{REPUTACION[v.reputacion ?? ""] ?? v.reputacion ?? "—"}</td><td className={TD}>{v.provincia ?? "—"}</td>
                  <td className={`${TD} max-w-60`}><TituloCorto titulo={v.categoria_top} /></td>
                </tr>))}</tbody>
            </table>
          </div>
          <Paginado total={filas.length} />
        </>
      )}
    </Pantalla>
  );
}
