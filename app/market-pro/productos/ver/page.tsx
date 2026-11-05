// Sourcing › Market Pro › Productos › un producto (Fer, 5/11): cómo vende mes a mes, quién lo vende, a cuánto y cómo
// (Full, Premium, catálogo), y sus atributos.

import Link from "next/link";
import { CAJA, CAJA_TABLA, Pantalla, TABLA, TD, TDN, TH, THEAD, THN, TR, entrarErp } from "@/app/componentes/erp";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import { atributosDe, leerFiltro, ofertasDeProducto, porProducto, serieMensual, ultimoMes } from "@/lib/marketpro/analisis";
import { gananciaEstimada } from "@/lib/marketpro/ganancia";
import { BarraMarketPro, ENVIO, GraficoMeses, Ml, REPUTACION, entero, filtrosDe, linkVendedor, millones, pct, pesos, crec, colorCrec } from "../../piezas";
import { url } from "@/app/componentes/erp";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

export default async function ProductoMarketPro({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("market_pro_ver");
  const sp = await searchParams;
  const f = { ...leerFiltro(sp), cat: null, vendedor: null, marca: null, q: "", tuyos: null };
  const mes = await ultimoMes(s.org.id);
  if (!f.producto || !mes) return <Pantalla titulo="Producto"><p className="text-xs">No hay datos de ese producto.</p></Pantalla>;
  const [serie, [p], ofertas] = await Promise.all([serieMensual(s.org.id, f), porProducto(s.org.id, mes, f), ofertasDeProducto(s.org.id, mes, f)]);
  if (!p) return <Pantalla titulo="Producto"><p className="text-xs">Ese producto no tuvo ventas en el período elegido.</p></Pantalla>;
  const atributos = p.item_top ? await atributosDe(s.org.id, p.item_top) : [];
  const g = p.tuyo_producto ? gananciaEstimada(p.precio_mediana, p.tuyo_costo, p.comision) : null;
  const tipo = (t: string | null) => (t === "premium" || t === "gold_pro" ? "Premium" : t === "classic" || t === "gold_special" ? "Clásica" : t ?? "—");
  return (
    <Pantalla titulo={p.titulo ?? "Producto"} ancho="max-w-7xl"
      camino={[{ texto: "Productos", href: url("/market-pro/productos", filtrosDe(sp)) }, { texto: (p.titulo ?? "").slice(0, 40) }]}
      subtitulo={`${p.marca} · ${p.ruta ?? ""} · clave ${p.producto}`}>
      <BarraMarketPro activa="productos" sp={sp} />
      <div className="grid gap-3 md:grid-cols-[auto_1fr] mb-4">
        <div className={CAJA}><FotosProducto fotos={p.foto ? [p.foto] : []} titulo={p.titulo ?? ""} tamano={140} /></div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Facturación", millones(p.gmv), `${f.meses} meses cerrados`], ["Unidades", entero(p.unidades), `${entero(p.unidades / f.meses)} por mes`],
            ["Precio (mediana 3 meses)", pesos(p.precio_mediana), `desde ${pesos(p.precio_min)}`], ["Crecimiento", crec(p.crecimiento), "3 meses contra los 3 anteriores"],
            ["Vendedores", entero(p.vendedores), `${entero(p.publicaciones)} publicaciones`], ["El que más vende", pct(p.lider_pct), p.lider ?? ""],
            ["Full · Premium · catálogo", `${pct(p.full_pct)} · ${pct(p.premium_pct)} · ${pct(p.catalogo_pct)}`, "de las unidades"],
            ["¿Lo tenés?", p.tuyo_producto ? "Sí" : "No", g ? `ganancia ≈ ${pct(g.sobreVenta)} s/venta, ${pct(g.sobreCosto)} s/costo` : p.tuyo_producto ? "sin costo cargado" : ""],
          ].map(([t, v, a]) => (
            <div key={t} className={CAJA}><p className="text-[11px] text-[#5C6B76]">{t}</p><p className="text-base font-bold tabular-nums">{v}</p><p className="text-[11px] text-[#5C6B76]">{a}</p></div>
          ))}
        </div>
      </div>
      {p.tuyo_producto && <p className="text-xs mb-3"><Link href={`/catalogo/productos/${p.tuyo_producto}`} className="text-[#16577F]">Ver tu producto</Link>
        {g && <span className="text-[#5C6B76]"> · costo {pesos(p.tuyo_costo)}, ganancia por unidad ≈ {pesos(g.ganancia)} (precio sin IVA − comisión Clásica{g.comisionSupuesta ? " supuesta 14,5 %" : ""} − costo; sin envío ni impuestos)</span>}</p>}

      <div className={`${CAJA} mb-4`}>
        <p className="text-xs font-semibold mb-2">Facturación por mes</p>
        <GraficoMeses serie={serie} />
      </div>

      <h2 className="text-sm font-semibold mb-1">Quién lo vende ({ofertas.length})</h2>
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr>
            <th className={TH}>Publicación</th><th className={TH}>Vendedor</th><th className={THN} title="Precio del último mes">Precio</th><th className={THN}>Unid.</th><th className={THN}>Fact.</th>
            <th className={TH}>Envío</th><th className={TH}>Plan</th><th className={THN} title="Ventas ÷ visitas (último mes)">Conv.</th><th className={THN} title="Visitas por día (último mes)">Vis./día</th>
            <th className={THN} title="Días que lleva activa">Días</th><th className={TH}>Reputación</th><th className={TH}>Provincia</th>
          </tr></thead>
          <tbody>{ofertas.map((o) => (
            <tr key={o.item_id} className={TR}>
              <td className={`${TD} max-w-72`}><span className="flex items-center gap-2"><FotosProducto fotos={o.foto ? [o.foto] : []} titulo={o.titulo ?? ""} />
                <span>{o.item_id} <Ml itemId={o.item_id} />{o.nuestra && <span className="ml-1 text-[10px] rounded bg-[#EEF7F1] px-1 text-[#1F6E4A]">nuestra</span>}<TituloCorto titulo={o.titulo} /></span></span></td>
              <td className={TD}>{o.vendedor ? <Link href={linkVendedor(o.vendedor, sp)} className="text-[#16577F]">{o.vendedor}</Link> : "—"}</td>
              <td className={TDN}>{pesos(o.precio)}</td><td className={TDN}>{entero(o.unidades)}</td><td className={TDN}>{millones(o.gmv)}</td>
              <td className={TD}>{ENVIO[o.envio ?? ""] ?? o.envio ?? "—"}</td><td className={TD}>{tipo(o.tipo)}{o.catalogo ? " · catálogo" : ""}</td>
              <td className={TDN}>{pct(o.conversion)}</td><td className={TDN}>{entero(o.visitas_dia)}</td><td className={TDN}>{entero(o.dias_activa)}</td>
              <td className={TD}>{REPUTACION[o.reputacion ?? ""] ?? o.reputacion ?? "—"}</td><td className={TD}>{o.provincia ?? "—"}</td>
            </tr>))}</tbody>
        </table>
      </div>

      <h2 className="text-sm font-semibold mb-1">Unidades por mes</h2>
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Mes</th><th className={THN}>Unid.</th><th className={THN}>Fact.</th><th className={THN}>Ticket</th><th className={THN}>Vend.</th><th className={THN}>Pubs.</th><th className={THN}>Cambio</th></tr></thead>
          <tbody>{[...serie].reverse().map((m, i, arr) => {
            const ant = arr[i + 1];
            const c = ant?.unidades ? m.unidades / ant.unidades - 1 : null;
            return (
              <tr key={m.mes} className={TR}><td className={TD}>{m.mes}</td><td className={TDN}>{entero(m.unidades)}</td><td className={TDN}>{millones(m.gmv)}</td><td className={TDN}>{pesos(m.ticket)}</td>
                <td className={TDN}>{entero(m.vendedores)}</td><td className={TDN}>{entero(m.publicaciones)}</td><td className={`${TDN} ${colorCrec(c)}`}>{crec(c)}</td></tr>
            );
          })}</tbody>
        </table>
      </div>

      {atributos.length > 0 && (
        <>
          <h2 className="text-sm font-semibold mb-1">Atributos de la publicación que más vende</h2>
          <div className={`${CAJA} grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 text-xs`}>
            {atributos.map((a) => <p key={a.nombre}><span className="text-[#5C6B76]">{a.nombre}:</span> {a.valor}</p>)}
          </div>
        </>
      )}
    </Pantalla>
  );
}
