// Sourcing › Market Pro › Informe (Fer, 7/11): de una categoría, los números fijos (en pesos y en dólares, franjas de
// precio, subcategorías y productos con más oportunidad), lo que escribió la IA después de explorar los datos
// (lib/marketpro/informe-ia.ts) y lo que se le agregó desde el asistente.

import Link from "next/link";
import { CAJA, CAJA_TABLA, Pantalla, TABLA, TD, TDN, TH, THEAD, THN, TR, entrarErp } from "@/app/componentes/erp";
import { PRIMARIO, SUAVE } from "@/app/botones";
import TituloCorto from "@/app/componentes/TituloCorto";
import FotosProducto from "@/app/componentes/FotosProducto";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import Texto from "@/app/componentes/asistente/Texto";
import { categoriasParaElegir } from "@/lib/marketpro/analisis";
import { estadoMarketPro } from "@/lib/marketpro/llave";
import { datosInforme, extrasDe, informeGuardado } from "@/lib/marketpro/informe";
import { formatearNumero } from "@/lib/numeros";
import { BarraMarketPro, Filtros, GraficoMeses, Vacio, colorCrec, crec, entero, linkCategoria, linkProducto, millones, pct, pesos } from "../piezas";
import { accionAnalizar } from "./acciones";
import { Refrescar, TachoExtra } from "./Piezas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type SP = Record<string, string | undefined>;

const usd = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `US$ ${formatearNumero(Math.round(n), "entero")}`);
const usdM = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : Math.abs(n) >= 1e6 ? `US$ ${formatearNumero(Math.round(n / 1e5) / 10, "decimal")} M` : usd(n));

export default async function InformeMarketPro({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_ver");
  const sp = await searchParams;
  const cat = Number(sp.cat) > 0 ? Math.trunc(Number(sp.cat)) : 0;
  const [estado, categorias, d, inf, extras] = await Promise.all([
    estadoMarketPro(s.org.id), categoriasParaElegir(s.org.id), datosInforme(s.org.id, cat || null), informeGuardado(s.org.id, cat), extrasDe(s.org.id, cat),
  ]);
  const nombre = cat ? categorias.find((c) => Number(c.valor) === cat)?.texto ?? `MLA${cat}` : "Todas las categorías bajadas";
  const trabajando = inf?.estado === "trabajando";
  const boton = (
    <BotonTarea accion={accionAnalizar} tipo={`marketpro-informe-${cat}`} campos={{ cat: String(cat) }} clase={PRIMARIO}
      texto={inf?.texto ? "Volver a analizar" : "Analizar con IA"} />
  );

  return (
    <Pantalla titulo="Market Pro" ancho="max-w-7xl" acciones={boton}
      subtitulo={d ? `Informe de ${nombre}. Datos hasta ${d.mes.slice(5, 7)}/${d.mes.slice(0, 4)} (último mes cerrado).` : "Informe por categoría"}>
      <BarraMarketPro activa="informe" sp={sp} />
      <Refrescar trabajando={trabajando} />
      <Filtros sp={sp} categorias={categorias} sinMeses />
      {!d ? <Vacio hayLlave={!!estado} /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-4 mb-4">
            {[
              ["Facturación, últimos 12 meses", usdM(d.kpi.gmv12_usd), millones(d.kpi.gmv12)],
              ["Unidades, últimos 12 meses", entero(d.kpi.u12), `${entero(d.kpi.u12 / 12)} por mes`],
              ["Ticket promedio", usd(d.kpi.ticket_usd), "facturación ÷ unidades, en dólares"],
              ["12 meses contra los 12 anteriores", `${crec(d.kpi.crec_anual)} u.`, `${crec(d.kpi.crec_usd_anual)} en dólares`],
            ].map(([t, v, a]) => (
              <div key={t} className={CAJA}>
                <p className="text-[11px] text-[#5C6B76]">{t}</p>
                <p className="text-lg font-bold tabular-nums">{v}</p>
                <p className="text-[11px] text-[#5C6B76]">{a}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_3fr] mb-4">
            <div className={CAJA}>
              <p className="text-xs font-semibold mb-2">Facturación por mes <span className="font-normal text-[#5C6B76]">(en pesos; pasá el mouse por cada barra)</span></p>
              <GraficoMeses serie={d.serie.map((m) => ({ mes: m.mes, unidades: m.unidades, gmv: m.gmv, publicaciones: 0, vendedores: m.vendedores, ticket: m.unidades ? m.gmv / m.unidades : null, total_pubs: null }))} />
              <p className="text-xs font-semibold mt-3 mb-2">En dólares (oficial, promedio del mes)</p>
              <GraficoMeses serie={d.serie.map((m) => ({ mes: m.mes, unidades: m.unidades, gmv: m.gmv_usd ?? 0, publicaciones: 0, vendedores: m.vendedores, ticket: m.ticket_usd, total_pubs: null }))} />
            </div>
            <div className={CAJA_TABLA}>
              <p className="text-xs font-semibold px-3 pt-3 pb-2">Franjas de precio, últimos 12 meses <span className="font-normal text-[#5C6B76]">(en dólares; cada franja tiene la misma cantidad de publicaciones con ventas)</span></p>
              <table className={TABLA}>
                <thead className={THEAD}><tr><th className={TH}>Precio</th><th className={THN}>Unid.</th><th className={THN} title="Parte de las unidades de los 12 meses">Parte</th><th className={THN}>Fact.</th><th className={THN} title="Vendedores con ventas">Vend.</th><th className={THN} title="Unidades de los últimos 3 meses contra los 3 anteriores">Crec.</th></tr></thead>
                <tbody>{d.franjas.map((f) => (
                  <tr key={f.franja} className={TR}>
                    <td className={TD}>{usd(f.desde)} a {usd(f.hasta)}</td><td className={TDN}>{entero(f.unidades)}</td><td className={TDN}>{pct(f.parte)}</td>
                    <td className={TDN}>{usdM(f.gmv_usd)}</td><td className={TDN}>{entero(f.vendedores)}</td><td className={`${TDN} ${colorCrec(f.crecimiento)}`}>{crec(f.crecimiento)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </div>

          <div className={`${CAJA} mb-4`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-bold text-[#16577F]">Lo que encontró la IA</p>
              <p className="text-[11px] text-[#5C6B76]">
                {trabajando ? `Escribiéndolo (empezó ${inf?.empezado_ts}); tarda unos minutos y aparece solo.`
                  : inf?.generado_ts ? `Escrito el ${inf.generado_ts} con datos hasta ${inf.datos_hasta?.slice(5, 7)}/${inf.datos_hasta?.slice(0, 4)} · ${inf.consultas ?? 0} consultas · US$ ${formatearNumero(inf.costo_usd ?? 0, "decimal")}` : ""}
              </p>
            </div>
            {inf?.estado === "error" && <p className="text-xs mb-2 rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420]">No se pudo escribir: {inf.error}</p>}
            {inf?.texto ? <div className="text-xs leading-relaxed max-w-4xl"><Texto texto={inf.texto} /></div>
              : !trabajando && <p className="text-xs text-[#5C6B76]">Todavía no hay informe de esta categoría. Tocá «Analizar con IA» arriba a la derecha: la IA explora todos los datos bajados y escribe qué dicen los números y qué oportunidades ve (tarda unos minutos).</p>}
            <p className="text-[11px] text-[#5C6B76] mt-3">Para preguntarle más o pedirle que investigue algo, abrí el asistente (abajo a la derecha): ve este informe y consulta los datos. Cada respuesta suya tiene «Agregar al informe», que la suma acá abajo.</p>
          </div>

          {extras.length > 0 && (
            <div className={`${CAJA} mb-4`}>
              <p className="text-sm font-bold text-[#16577F] mb-2">Agregado desde el asistente ({extras.length})</p>
              <div className="space-y-4">
                {extras.map((e) => (
                  <div key={e.id} className="border-t border-[#E3E9F0] pt-3 first:border-0 first:pt-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold">{e.pregunta ?? "Agregado"}</p>
                      <span className="flex items-center gap-2 text-[11px] text-[#5C6B76] whitespace-nowrap">{e.creado_ts}{e.usuario ? ` · ${e.usuario}` : ""}<TachoExtra id={e.id} /></span>
                    </div>
                    <div className="text-xs leading-relaxed max-w-4xl"><Texto texto={e.texto} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={CAJA_TABLA}>
              <p className="text-xs font-semibold px-3 pt-3 pb-2">Subcategorías con más oportunidad <span className="font-normal text-[#5C6B76]">(12 meses)</span></p>
              <table className={TABLA}>
                <thead className={THEAD}><tr><th className={TH}>Categoría</th><th className={THN}>Fact.</th><th className={THN} title="Unidades de los últimos 3 meses contra los 3 anteriores">Crec.</th><th className={THN}>Vend.</th><th className={THN} title="Parte de las unidades del vendedor que más vende">Líder</th><th className={THN} title="Puntaje de oportunidad (0–100)">Oport.</th></tr></thead>
                <tbody>{[...d.categorias].sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0)).slice(0, 12).map((c) => (
                  <tr key={c.cat} className={TR}>
                    <td className={`${TD} max-w-80`}><Link href={linkCategoria(c.cat, sp)} className="text-[#16577F]"><TituloCorto titulo={c.ruta ?? String(c.cat)} /></Link></td>
                    <td className={TDN}>{millones(c.gmv)}</td><td className={`${TDN} ${colorCrec(c.crecimiento)}`}>{crec(c.crecimiento)}</td>
                    <td className={TDN}>{entero(c.vendedores)}</td><td className={TDN}>{pct(c.lider_pct)}</td><td className={TDN}>{c.puntaje ?? "—"}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            <div className={CAJA_TABLA}>
              <p className="text-xs font-semibold px-3 pt-3 pb-2">Productos con más oportunidad <span className="font-normal text-[#5C6B76]">(12 meses)</span></p>
              <table className={TABLA}>
                <thead className={THEAD}><tr><th className={TH}>Producto</th><th className={THN}>Fact.</th><th className={THN}>Precio</th><th className={THN} title="Unidades de los últimos 3 meses contra los 3 anteriores">Crec.</th><th className={THN}>Vend.</th><th className={THN} title="Puntaje de oportunidad (0–100)">Oport.</th></tr></thead>
                <tbody>{[...d.productos].sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0)).slice(0, 12).map((p) => (
                  <tr key={p.producto} className={TR}>
                    <td className={`${TD} max-w-80`}><span className="flex items-center gap-2"><FotosProducto fotos={p.foto ? [p.foto] : []} titulo={p.titulo ?? ""} />
                      <Link href={linkProducto(p.producto, sp)} className="text-[#16577F]"><TituloCorto titulo={p.titulo} /></Link>
                      {p.tuyo_producto ? <span className="text-[10px] rounded px-1 bg-[#E6F4EC] text-[#167655]">lo tenés</span> : null}</span></td>
                    <td className={TDN}>{millones(p.gmv)}</td><td className={TDN}>{pesos(p.precio_mediana)}</td><td className={`${TDN} ${colorCrec(p.crecimiento)}`}>{crec(p.crecimiento)}</td>
                    <td className={TDN}>{entero(p.vendedores)}</td><td className={TDN}>{p.puntaje ?? "—"}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-[#5C6B76] mt-3">Los montos en dólares usan el dólar oficial promedio de cada mes. <Link href="/market-pro/productos" className={`${SUAVE} !px-2 !py-0.5`}>Ver todos los productos</Link></p>
        </>
      )}
    </Pantalla>
  );
}
