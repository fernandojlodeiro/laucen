// Sourcing › Market Pro › Productos (Fer, 5/11): qué se vende, a cuánto, cuántos lo venden y si ya lo tenemos (con la
// ganancia estimada a precio de mercado). Un producto junta las publicaciones del mismo catálogo, EAN o marca + modelo.

import Link from "next/link";
import { VERDE } from "@/app/botones";
import { CAJA_TABLA, Pantalla, TABLA, TD, TDN, THEAD, TR, entrarErp, url } from "@/app/componentes/erp";
import FotosProducto from "@/app/componentes/FotosProducto";
import { Paginado, ThOrden } from "@/app/componentes/Lista";
import TituloCorto from "@/app/componentes/TituloCorto";
import { Desplegable } from "@/app/informes/Filtros";
import { categoriasParaElegir, leerFiltro, porProducto, ultimoMes } from "@/lib/marketpro/analisis";
import { gananciaEstimada } from "@/lib/marketpro/ganancia";
import { estadoMarketPro } from "@/lib/marketpro/llave";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { BarraMarketPro, Filtros, Vacio, colorCrec, crec, entero, linkProducto, millones, pct, pesos } from "../piezas";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

export default async function ProductosMarketPro({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_ver");
  const sp = await searchParams;
  const f = leerFiltro(sp);
  const [mes, categorias] = await Promise.all([ultimoMes(s.org.id), categoriasParaElegir(s.org.id)]);
  const todas = (mes ? await porProducto(s.org.id, mes, f) : []).map((p) => ({ ...p, g: p.tuyo_producto ? gananciaEstimada(p.precio_mediana, p.tuyo_costo, p.comision) : null }));
  const filas = ordenarEnMemoria(todas, sp, {
    titulo: (x) => x.titulo, gmv: (x) => x.gmv, unidades: (x) => x.unidades, ticket: (x) => x.ticket, precio: (x) => x.precio_mediana, minimo: (x) => x.precio_min,
    vendedores: (x) => x.vendedores, publicaciones: (x) => x.publicaciones, lider: (x) => x.lider_pct, crec: (x) => x.crecimiento, full: (x) => x.full_pct,
    conv: (x) => x.conversion, puntaje: (x) => x.puntaje, ganancia: (x) => x.g?.sobreVenta, marca: (x) => x.marca,
  });
  const quien = [f.vendedor && `del vendedor ${f.vendedor}`, f.marca && `de la marca ${f.marca}`].filter(Boolean).join(" ");
  return (
    <Pantalla titulo={`Market Pro: productos${quien ? ` ${quien}` : ""}`} ancho="max-w-[1500px]"
      subtitulo="Un producto junta las publicaciones del mismo producto de catálogo, EAN o marca y modelo. Precio: la mediana de los últimos 3 meses."
      acciones={<a href={url("/market-pro/excel", { vista: "productos", ...sp })} className={VERDE}>Descargar Excel</a>}>
      <BarraMarketPro activa="productos" sp={sp} />
      <div className="flex flex-wrap items-start gap-x-3">
        <Filtros sp={sp} categorias={categorias} buscador="Título, marca o número de publicación" />
        <Desplegable parametro="tuyos" etiqueta="Tu catálogo" valor={sp.tuyos ?? ""} limpiar={["p"]} opciones={[
          { valor: "", texto: "Todos" }, { valor: "no", texto: "Los que no tenés" }, { valor: "si", texto: "Los que ya tenés" }]} />
        {(f.vendedor || f.marca) && <Link href={url("/market-pro/productos", { cat: sp.cat ?? null, meses: sp.meses ?? null })} className="text-xs text-[#16577F] mt-2">Sacar el filtro de {f.vendedor ? "vendedor" : "marca"}</Link>}
      </div>
      {!mes ? <Vacio hayLlave={!!(await estadoMarketPro(s.org.id))} /> : (
        <>
          <div className={`${CAJA_TABLA} max-h-[calc(100vh-15rem)] overflow-y-auto`}>
            <table className={TABLA}>
              <thead className={`${THEAD} sticky top-0 z-10`}><tr>
                <ThOrden col="titulo">Producto</ThOrden>
                <ThOrden col="gmv" n porDefecto title="Facturación del período">Fact.</ThOrden>
                <ThOrden col="unidades" n title="Unidades vendidas en el período">Unid.</ThOrden>
                <ThOrden col="precio" n title="Precio: mediana de los últimos 3 meses">Precio</ThOrden>
                <ThOrden col="minimo" n title="El precio más bajo de los últimos 3 meses">Mín.</ThOrden>
                <ThOrden col="vendedores" n title="Vendedores con ventas">Vend.</ThOrden>
                <ThOrden col="lider" n title="Qué parte de las unidades se lleva el vendedor que más vende">Líder</ThOrden>
                <ThOrden col="crec" n title="Unidades de los últimos 3 meses cerrados contra los 3 anteriores">Crec.</ThOrden>
                <ThOrden col="full" n title="Parte de las unidades vendidas con Full">Full</ThOrden>
                <ThOrden col="conv" n title="Ventas ÷ visitas">Conv.</ThOrden>
                <ThOrden col="puntaje" n title="Puntaje de oportunidad, 0–100">Oport.</ThOrden>
                <ThOrden col="ganancia" n title="Si ya lo tenés: ganancia estimada al precio de mercado, sobre la venta (sin IVA) y sobre el costo. Precio sin IVA − comisión Clásica − costo promedio; sin envío ni impuestos">Tu ganancia</ThOrden>
                <ThOrden col="publicaciones" n title="Publicaciones con ventas">Pubs.</ThOrden>
                <ThOrden col="marca">Marca</ThOrden>
                <th className="py-1.5 px-2 text-left font-semibold">Categoría</th>
              </tr></thead>
              <tbody>{paginarEnMemoria(filas, sp).map((p) => (
                <tr key={p.producto} className={TR}>
                  <td className={`${TD} max-w-80`}><span className="flex items-center gap-2">
                    <FotosProducto fotos={p.foto ? [p.foto] : []} titulo={p.titulo ?? ""} />
                    <span><Link href={linkProducto(p.producto, sp)} className="text-[#16577F]"><TituloCorto titulo={p.titulo} className="!text-[#16577F]" /></Link>
                      {p.tuyo_producto && <Link href={`/catalogo/productos/${p.tuyo_producto}`} className="text-[10px] rounded bg-[#EEF7F1] px-1 text-[#1F6E4A]">lo tenés{p.nuestras ? ` · ${p.nuestras} pub.` : ""}</Link>}</span>
                  </span></td>
                  <td className={TDN}>{millones(p.gmv)}</td><td className={TDN}>{entero(p.unidades)}</td><td className={TDN}>{pesos(p.precio_mediana)}</td><td className={TDN}>{pesos(p.precio_min)}</td>
                  <td className={TDN}>{entero(p.vendedores)}</td><td className={TDN} title={p.lider ?? undefined}>{pct(p.lider_pct)}</td>
                  <td className={`${TDN} ${colorCrec(p.crecimiento)}`}>{crec(p.crecimiento)}</td><td className={TDN}>{pct(p.full_pct)}</td><td className={TDN}>{pct(p.conversion)}</td>
                  <td className={`${TDN} font-semibold`}>{p.puntaje ?? "—"}</td>
                  <td className={`${TDN} ${p.g && p.g.ganancia < 0 ? "text-[#C03420]" : ""}`}
                    title={p.g ? `Costo ${pesos(p.tuyo_costo)} · ganancia ${pesos(p.g.ganancia)} por unidad${p.g.comisionSupuesta ? " · comisión supuesta 14,5 %" : ""}` : p.tuyo_producto ? "Tu producto no tiene costo cargado" : undefined}>
                    {p.g ? <>{pct(p.g.sobreVenta)} s/venta<br />{pct(p.g.sobreCosto)} s/costo</> : "—"}</td>
                  <td className={TDN}>{entero(p.publicaciones)}</td>
                  <td className={TD}>{p.marca}</td>
                  <td className={`${TD} max-w-60`}><TituloCorto titulo={p.ruta} /></td>
                </tr>))}</tbody>
            </table>
          </div>
          <Paginado total={filas.length} />
        </>
      )}
    </Pantalla>
  );
}
