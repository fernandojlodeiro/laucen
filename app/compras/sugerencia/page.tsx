// Compras › Sugerencia de compra (pedido de Fer, 12/10; lib/compras/sugerencia.ts): qué comprar para N días según el
// ritmo real de venta de la historia (típico y mejor momento), cuánto se invierte y qué ganancia podría dejar.

import Link from "next/link";
import { VERDE } from "@/app/botones";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import FotosProducto from "@/app/componentes/FotosProducto";
import { Paginado } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { Desplegable } from "@/app/informes/Filtros";
import { coincideBusqueda } from "@/lib/busqueda";
import { paginarEnMemoria } from "@/lib/lista";
import { formatearNumero } from "@/lib/numeros";
import { hoyArgentina } from "@/lib/rango-fechas";
import { leerFiltroSugerencia, sugerenciaCompra, totalesSugerencia } from "@/lib/compras/sugerencia";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DIAS_OPCIONES = [30, 45, 60, 90, 120, 180];
type SP = Record<string, string | undefined>;
const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const usd = (n: number | null) => (n == null ? "—" : `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const entero = (n: number) => formatearNumero(n, "entero");
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
const dma = (iso: string) => iso.split("-").reverse().join("/");

export default async function SugerenciaCompra({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const f = leerFiltroSugerencia(sp, hoyArgentina());
  const { filas: todas, tcHoy } = await sugerenciaCompra(s.org.id, f);
  const q = sp.q?.trim() ?? "";
  const filas = q ? todas.filter((x) => coincideBusqueda([x.sku, x.titulo], q, sp.contiene !== "1")) : todas;
  const t = totalesSugerencia(filas);
  const vista = paginarEnMemoria(filas, sp);
  const params = { desde: f.desde, hasta: f.hasta, dias: f.dias === 60 ? null : f.dias, q: q || null, contiene: sp.contiene ?? null };

  return (
    <Pantalla titulo="Sugerencia de compra"
      subtitulo={`Qué comprar para ${f.dias} días si se vende al ritmo real de algún momento de la historia: el típico y el mejor. Sin notebooks. Costo = último costo de la ficha; precio = la última venta pasada a dólares con el oficial de ese día y a pesos con el de hoy${tcHoy ? ` ($ ${formatearNumero(tcHoy, "pesos")})` : ""}.`}
      acciones={<a href={url("/compras/sugerencia/excel", params)} className={VERDE}>Descargar Excel</a>}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={sp.contiene !== "1"} placeholder="SKU o producto" limpiar={["p"]} />
        <RangoFechas desde={f.desde} hasta={f.hasta} etiqueta="Período de la historia" limpiar={["p"]} />
        <Desplegable parametro="dias" etiqueta="Comprar para" valor={f.dias === 60 ? "" : String(f.dias)} limpiar={["p"]}
          opciones={DIAS_OPCIONES.map((d) => ({ valor: d === 60 ? "" : String(d), texto: `${d} días` }))} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
        {[["Productos", `${entero(t.productos)} (${entero(t.conCosto)} con costo)`],
          ["Unidades · típico / mejor", `${entero(t.unidadesTipicas)} / ${entero(t.unidadesMejor)}`],
          ["Inversión · típico / mejor", `${usd(t.inversionTipicaUsd)} / ${usd(t.inversionMejorUsd)}`],
          ["Ganancia estimada · típico / mejor", `${pesos(t.gananciaTipica)} / ${pesos(t.gananciaMejor)}`]].map(([k, v]) => (
          <div key={k} className="bg-white border border-[#E3E9F0] rounded-xl p-2"><span className="block text-[11px] text-[#5C6B76]">{k}</span><b className="tabular-nums">{v}</b></div>
        ))}
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Producto</th><th className={THN}>Para {f.dias} días · típico</th><th className={THN}>· mejor momento</th>
              <th className={THN}>Costo US$</th><th className={THN}>Inversión típica US$</th><th className={TH}>Última venta</th><th className={THN}>Precio hoy</th>
              <th className={THN}>Clásica hoy</th><th className={THN}>Mercado Libre</th><th className={THN}>Ganancia por unidad</th><th className={THN}>Margen</th>
              <th className={THN}>Ganancia · típico</th><th className={THN}>· mejor</th>
            </tr>
          </thead>
          <tbody>
            {vista.length === 0 && <tr><td colSpan={13} className={`${TD} text-[#5C6B76]`}>No hay ventas con ritmo regular en ese período.</td></tr>}
            {vista.map((x) => (
              <tr key={x.clave} className={TR}>
                <td className={TD}>
                  <span className="inline-flex items-center gap-2 align-middle">
                    <FotosProducto fotos={x.fotos} titulo={x.titulo} />
                    {x.producto_id ? <Link href={`/catalogo/productos/${x.producto_id}`} className="font-mono text-[#16577F] hover:underline whitespace-nowrap">{x.sku}</Link> : <span className="font-mono">{x.sku}</span>}
                  </span>{" "}<span className="text-[#5C6B76]">{x.titulo}</span>
                  {x.archivado && <> <Estado texto={x.producto_id ? "Inactivo" : "No está en el catálogo"} tono="gris" /></>}
                  {x.grandes > 0 && <span className="block text-[10px] text-[#8a6100]">{x.grandes} compra{x.grandes === 1 ? "" : "s"} grande{x.grandes === 1 ? "" : "s"} no considerada{x.grandes === 1 ? "" : "s"} (la mayor, {entero(x.mayor_grande)} u.)</span>}
                  <span className="block text-[10px] text-[#5C6B76]">Vendió {entero(x.dias_con_venta)} días del período · {entero(x.ventanas)} tramos de {f.dias} días con venta regular</span>
                </td>
                <td className={`${TDN} font-semibold`}>{entero(x.tipico)}</td>
                <td className={TDN}>{entero(x.mejor)}</td>
                <td className={TDN}>{usd(x.costo_usd)}</td>
                <td className={TDN}>{x.costo_usd == null ? "—" : usd(x.costo_usd * x.tipico)}</td>
                <td className={`${TD} whitespace-nowrap text-[11px]`}>{dma(x.ultima_fecha)}<span className="block text-[#5C6B76]">{pesos(x.ultima_precio)} · dólar {x.ultima_tc ? formatearNumero(x.ultima_tc, "pesos") : "—"} = {usd(x.precio_usd)}</span></td>
                <td className={`${TDN} font-semibold`}>{pesos(x.precio_hoy)}</td>
                <td className={TDN}>{pesos(x.clasica)}</td>
                <td className={TDN} title={`Comisión ${pct(x.comision_pct)} + cargo fijo o envío`}>{pesos(x.costos_ml)}</td>
                <td className={`${TDN} ${x.ganancia_unit != null && x.ganancia_unit < 0 ? "text-[#C03420] font-semibold" : ""}`}>{pesos(x.ganancia_unit)}</td>
                <td className={`${TDN} ${x.margen_pct != null && x.margen_pct < 0 ? "text-[#C03420]" : ""}`}>{pct(x.margen_pct)}</td>
                <td className={`${TDN} font-semibold`}>{x.ganancia_unit == null ? "—" : pesos(x.ganancia_unit * x.tipico)}</td>
                <td className={TDN}>{x.ganancia_unit == null ? "—" : pesos(x.ganancia_unit * x.mejor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={filas.length} />
      <p className="text-[11px] text-[#5C6B76] mt-2">
        Cómo se calcula: no hay historia del stock, así que se toman los tramos de {f.dias} días en que el producto se vendió con regularidad (sin un hueco más largo de lo normal para ese producto).
        Típico = lo que se vendió en un tramo común (la mediana); mejor momento = el mejor tramo. Las compras grandes de una sola vez no cuentan. Ganancia = precio de hoy − comisión, cargo fijo y envío de Mercado Libre − costo. Es una referencia para chequear.
      </p>
    </Pantalla>
  );
}
