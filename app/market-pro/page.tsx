// Sourcing › Market Pro › Resumen (Fer, 5/11): cómo viene cada categoría habilitada mes a mes y lo más vendido.

import Link from "next/link";
import { CAJA, CAJA_TABLA, Pantalla, TABLA, TD, TDN, TH, THEAD, THN, TR, entrarErp } from "@/app/componentes/erp";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import { categoriasParaElegir, leerFiltro, porCategoria, porMarca, porProducto, porVendedor, serieMensual, ultimoMes } from "@/lib/marketpro/analisis";
import { estadoMarketPro } from "@/lib/marketpro/llave";
import { BarraMarketPro, Filtros, GraficoMeses, Vacio, colorCrec, crec, entero, linkCategoria, linkMarca, linkProducto, linkVendedor, millones, pct, pesos } from "./piezas";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

export default async function ResumenMarketPro({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_ver");
  const sp = await searchParams;
  const f = leerFiltro(sp);
  const [estado, mes, categorias] = await Promise.all([estadoMarketPro(s.org.id), ultimoMes(s.org.id), categoriasParaElegir(s.org.id)]);
  if (!mes) {
    return (
      <Pantalla titulo="Market Pro" subtitulo="Ventas de Mercado Libre por publicación, de Real Trends" ancho="max-w-7xl">
        <BarraMarketPro activa="" sp={sp} />
        <Vacio hayLlave={!!estado} />
      </Pantalla>
    );
  }
  const [serie, cats, prods, vends, marcas] = await Promise.all([
    serieMensual(s.org.id, f), porCategoria(s.org.id, mes, f), porProducto(s.org.id, mes, f), porVendedor(s.org.id, mes, f), porMarca(s.org.id, mes, f),
  ]);
  const cerrados = serie.filter((m) => m.mes <= mes.slice(0, 7));
  const ventana = cerrados.slice(-f.meses);
  const tot = { gmv: ventana.reduce((a, m) => a + (m.gmv || 0), 0), u: ventana.reduce((a, m) => a + (m.unidades || 0), 0) };
  const anio = cerrados.slice(-12), anioAnt = cerrados.slice(-24, -12);
  const crecAnual = anioAnt.length === 12 ? anio.reduce((a, m) => a + m.unidades, 0) / Math.max(1, anioAnt.reduce((a, m) => a + m.unidades, 0)) - 1 : null;
  const tuyos = prods.filter((p) => p.tuyo_producto);

  return (
    <Pantalla titulo="Market Pro" ancho="max-w-7xl"
      subtitulo={`Ventas de Mercado Libre por publicación (Real Trends). Datos hasta ${mes.slice(5, 7)}/${mes.slice(0, 4)} (último mes cerrado).`}>
      <BarraMarketPro activa="" sp={sp} />
      <Filtros sp={sp} categorias={categorias} />
      {estado?.error && <p className="text-xs mb-3 rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420]">Descarga: {estado.error} (<Link href="/market-pro/descarga" className="underline">ver</Link>)</p>}

      <div className="grid gap-3 sm:grid-cols-4 mb-4">
        {[
          ["Facturación del período", millones(tot.gmv), `${f.meses} ${f.meses === 1 ? "mes" : "meses"} cerrados`],
          ["Unidades", entero(tot.u), `${entero(tot.u / Math.max(1, ventana.length))} por mes`],
          ["Ticket promedio", pesos(tot.u ? tot.gmv / tot.u : null), "facturación ÷ unidades"],
          ["Unidades: 12 meses contra los 12 anteriores", crec(crecAnual), crecAnual == null ? "faltan meses para comparar" : ""],
        ].map(([t, v, a]) => (
          <div key={t} className={CAJA}>
            <p className="text-[11px] text-[#5C6B76]">{t}</p>
            <p className="text-lg font-bold tabular-nums">{v}</p>
            <p className="text-[11px] text-[#5C6B76]">{a}</p>
          </div>
        ))}
      </div>

      <div className={`${CAJA} mb-4`}>
        <p className="text-xs font-semibold mb-2">Facturación por mes, desde octubre de 2023 <span className="font-normal text-[#5C6B76]">(pasá el mouse por cada barra; la clara es el mes en curso)</span></p>
        <GraficoMeses serie={serie} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque titulo="Categorías que más facturan" href={`/market-pro/categorias?${new URLSearchParams(Object.entries({ cat: sp.cat, meses: sp.meses }).filter((e): e is [string, string] => !!e[1]))}`}>
          <thead className={THEAD}><tr><th className={TH}>Categoría</th><th className={THN}>Facturación</th><th className={THN} title="Unidades de los últimos 3 meses contra los 3 anteriores">Crec.</th><th className={THN}>Vend.</th><th className={THN} title="Puntaje de oportunidad (0–100)">Oport.</th></tr></thead>
          <tbody>{cats.slice(0, 10).map((c) => (
            <tr key={c.cat} className={TR}>
              <td className={`${TD} max-w-80`}><Link href={linkCategoria(c.cat, sp)} className="text-[#16577F]"><TituloCorto titulo={c.ruta ?? String(c.cat)} /></Link></td>
              <td className={TDN}>{millones(c.gmv)}</td><td className={`${TDN} ${colorCrec(c.crecimiento)}`}>{crec(c.crecimiento)}</td>
              <td className={TDN}>{entero(c.vendedores)}</td><td className={TDN}>{c.puntaje ?? "—"}</td>
            </tr>))}</tbody>
        </Bloque>
        <Bloque titulo="Productos que más facturan" href={`/market-pro/productos?${new URLSearchParams(Object.entries({ cat: sp.cat, meses: sp.meses }).filter((e): e is [string, string] => !!e[1]))}`}>
          <thead className={THEAD}><tr><th className={TH}>Producto</th><th className={THN}>Facturación</th><th className={THN}>Unid.</th><th className={THN}>Precio</th><th className={THN}>Vend.</th></tr></thead>
          <tbody>{prods.slice(0, 10).map((p) => (
            <tr key={p.producto} className={TR}>
              <td className={`${TD} max-w-80`}><span className="flex items-center gap-2"><FotosProducto fotos={p.foto ? [p.foto] : []} titulo={p.titulo ?? ""} />
                <Link href={linkProducto(p.producto, sp)} className="text-[#16577F]"><TituloCorto titulo={p.titulo} /></Link></span></td>
              <td className={TDN}>{millones(p.gmv)}</td><td className={TDN}>{entero(p.unidades)}</td><td className={TDN}>{pesos(p.precio_mediana)}</td><td className={TDN}>{entero(p.vendedores)}</td>
            </tr>))}</tbody>
        </Bloque>
        <Bloque titulo="Vendedores que más facturan (los competidores)" href={`/market-pro/vendedores?${new URLSearchParams(Object.entries({ cat: sp.cat, meses: sp.meses }).filter((e): e is [string, string] => !!e[1]))}`}>
          <thead className={THEAD}><tr><th className={TH}>Vendedor</th><th className={THN}>Facturación</th><th className={THN} title="Parte de la facturación total">Parte</th><th className={THN}>Crec.</th><th className={THN}>Full</th></tr></thead>
          <tbody>{vends.slice(0, 10).map((v) => (
            <tr key={v.vendedor} className={TR}>
              <td className={TD}><Link href={linkVendedor(v.vendedor, sp)} className="text-[#16577F]">{v.nombre ?? v.alias ?? v.vendedor}</Link>{v.nuestras > 0 && <span className="ml-1 text-[10px] rounded bg-[#EEF7F1] px-1 text-[#1F6E4A]">nosotros</span>}</td>
              <td className={TDN}>{millones(v.gmv)}</td><td className={TDN}>{pct(v.lider_pct)}</td><td className={`${TDN} ${colorCrec(v.crecimiento)}`}>{crec(v.crecimiento)}</td><td className={TDN}>{pct(v.full_pct)}</td>
            </tr>))}</tbody>
        </Bloque>
        <Bloque titulo="Marcas que más facturan" href={`/market-pro/marcas?${new URLSearchParams(Object.entries({ cat: sp.cat, meses: sp.meses }).filter((e): e is [string, string] => !!e[1]))}`}>
          <thead className={THEAD}><tr><th className={TH}>Marca</th><th className={THN}>Facturación</th><th className={THN}>Unid.</th><th className={THN}>Crec.</th><th className={THN}>Vend.</th></tr></thead>
          <tbody>{marcas.slice(0, 10).map((m) => (
            <tr key={m.marca} className={TR}>
              <td className={TD}><Link href={linkMarca(m.marca, sp)} className="text-[#16577F]">{m.marca}</Link></td>
              <td className={TDN}>{millones(m.gmv)}</td><td className={TDN}>{entero(m.unidades)}</td><td className={`${TDN} ${colorCrec(m.crecimiento)}`}>{crec(m.crecimiento)}</td><td className={TDN}>{entero(m.vendedores)}</td>
            </tr>))}</tbody>
        </Bloque>
      </div>
      <p className="text-[11px] text-[#5C6B76] mt-3">
        De los {entero(prods.length)} productos con ventas del período, {entero(tuyos.length)} ya los tenés en tu catálogo
        {tuyos.length > 0 && <> (<Link href={`/market-pro/productos?tuyos=si${sp.cat ? `&cat=${sp.cat}` : ""}`} className="underline">ver cuáles</Link>)</>}.
      </p>
    </Pantalla>
  );
}

function Bloque({ titulo, href, children }: { titulo: string; href: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-1"><h2 className="text-sm font-semibold">{titulo}</h2><Link href={href} className="text-xs text-[#16577F]">Ver todos</Link></div>
      <div className={CAJA_TABLA}><table className={TABLA}>{children}</table></div>
    </section>
  );
}
