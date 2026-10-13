// Compras › Sugerencia de compra (pedido de Fer, 12/10; lib/compras/sugerencia.ts): qué comprar para N días según el
// ritmo real de venta de la historia (típico y mejor momento), cuánto se invierte y qué ganancia podría dejar.

import Link from "next/link";
import { VERDE } from "@/app/botones";
import BuscadorVivo, { CasillaViva } from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import FotosProducto from "@/app/componentes/FotosProducto";
import { Paginado, ThOrden } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { Desplegable } from "@/app/informes/Filtros";
import Categorias from "./Categorias";
import { coincideBusqueda } from "@/lib/busqueda";
import { consulta } from "@/lib/erp/base";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { formatearNumero } from "@/lib/numeros";
import { hoyArgentina } from "@/lib/rango-fechas";
import { MIN_DIAS_VENTA, ORDEN_SUGERENCIA, ULTIMA_VENTA_MESES, arbolCategorias, filtrarMuestra, leerFiltroSugerencia, sugerenciaGuardada, totalesSugerencia } from "@/lib/compras/sugerencia";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DIAS_OPCIONES = [30, 45, 60, 90, 120, 180];
type SP = Record<string, string | undefined>;
const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const usd = (n: number | null) => (n == null ? "—" : `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const entero = (n: number) => formatearNumero(n, "entero");
const fechaCorta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—");
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
const dma = (iso: string) => iso.split("-").reverse().join("/");

export default async function SugerenciaCompra({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const f = leerFiltroSugerencia(sp, hoyArgentina());
  const { filas: todas, tcHoy, calculado } = await sugerenciaGuardada(s.org.id, f);
  const { nodos, ancestros } = await arbolCategorias(s.org.id, todas);
  // Proveedor preferido: los que tienen algún producto en la sugerencia.
  const provIds = [...new Set(todas.map((x) => x.proveedor_id).filter((x): x is number => x != null))];
  const proveedores = provIds.length ? await consulta<{ id: number; nombre: string }>("select id::int, nombre from proveedor where organizacion_id = $1 and id = any($2::bigint[]) order by lower(nombre)", [s.org.id, provIds]) : [];
  const sinCat = new Set((sp.sin_cat ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && sp.sin_cat));
  const categoriaFuera = (x: (typeof todas)[number]) => x.familia_id == null ? sinCat.has(0) : (ancestros.get(x.familia_id) ?? []).some((id) => sinCat.has(id));
  const q = sp.q?.trim() ?? "";
  const filas = filtrarMuestra(todas, sp, (x) => !categoriaFuera(x) && (!q || coincideBusqueda([x.sku, x.titulo], q, sp.contiene !== "1")));
  const t = totalesSugerencia(filas);
  const vista = paginarEnMemoria(ordenarEnMemoria(filas, sp, ORDEN_SUGERENCIA), sp);
  const params = { desde: f.desde, hasta: f.hasta, dias: f.dias === 60 ? null : f.dias, q: q || null, contiene: sp.contiene ?? null, orden: sp.orden ?? null, dir: sp.dir ?? null, min_dias: sp.min_dias ?? null, vmeses: sp.vmeses ?? null, con_stock: sp.con_stock ?? null, sin_cat: sp.sin_cat ?? null, prov: sp.prov ?? null };

  return (
    <Pantalla titulo="Sugerencia de compra" ancho="max-w-7xl"
      subtitulo={`Qué comprar para ${f.dias} días al ritmo real de la historia (típico y mejor momento). Sin notebooks.`}
      acciones={
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <BuscadorVivo q={q} comienza={sp.contiene !== "1"} placeholder="SKU o producto" limpiar={["p"]} />
          <RangoFechas desde={f.desde} hasta={f.hasta} etiqueta="Historia" limpiar={["p"]} />
          <Desplegable parametro="dias" etiqueta="Comprar para" valor={f.dias === 60 ? "" : String(f.dias)} limpiar={["p"]}
            opciones={DIAS_OPCIONES.map((d) => ({ valor: d === 60 ? "" : String(d), texto: `${d} días` }))} />
          <Desplegable parametro="min_dias" etiqueta="Días con venta" valor={sp.min_dias ?? ""} limpiar={["p"]}
            opciones={[{ valor: "", texto: "Todos" }, ...MIN_DIAS_VENTA.map((d) => ({ valor: String(d), texto: `Más de ${d}` }))]} />
          <Desplegable parametro="vmeses" etiqueta="Última venta" valor={sp.vmeses ?? ""} limpiar={["p"]}
            opciones={[{ valor: "", texto: "Cualquiera" }, ...ULTIMA_VENTA_MESES.map(([m, t]) => ({ valor: String(m), texto: `En ${t}` }))]} />
          <Desplegable parametro="prov" etiqueta="Proveedor" valor={sp.prov ?? ""} limpiar={["p"]}
            opciones={[{ valor: "", texto: "Todos" }, ...proveedores.map((p) => ({ valor: String(p.id), texto: p.nombre })), { valor: "0", texto: "Sin proveedor preferido" }]} />
          <Categorias nodos={nodos} sinCategoria={todas.filter((x) => x.familia_id == null).length} excluidas={[...sinCat]} />
          <CasillaViva parametro="con_stock" activo={sp.con_stock === "1"} etiqueta="Incluye los que tienen stock suficiente" ayuda="Los que no hace falta comprar: el stock de hoy alcanza para los días elegidos" />
          <a href={url("/compras/sugerencia/excel", params)} className={VERDE}>Descargar Excel</a>
        </div>
      }>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
        {[["Productos", `${entero(t.productos)} (${entero(t.conCosto)} con costo)`],
          ["Unidades a comprar · típico / mejor", `${entero(t.unidadesTipicas)} / ${entero(t.unidadesMejor)}`],
          ["Inversión · típico / mejor", `${usd(t.inversionTipicaUsd)} / ${usd(t.inversionMejorUsd)}`],
          ["Ganancia estimada · típico / mejor", `${pesos(t.gananciaTipica)} / ${pesos(t.gananciaMejor)}`]].map(([k, v]) => (
          <div key={k} className="bg-white border border-[#E3E9F0] rounded-xl p-2"><span className="block text-[11px] text-[#5C6B76]">{k}</span><b className="tabular-nums">{v}</b></div>
        ))}
      </div>
      {/* Los títulos quedan fijos al desplazarse (Fer, 12/10): la tabla tiene su propio alto y se desplaza adentro. */}
      <div className={`${CAJA_TABLA} max-h-[calc(100vh-15rem)] overflow-y-auto`}>
        <table className={`${TABLA} text-[11px] [&_td]:px-1.5 [&_th]:px-1.5`}>
          <thead className={`${THEAD} sticky top-0 z-10 shadow-[0_1px_0_#E3E9F0]`}>
            <tr>
              <ThOrden col="sku">Producto</ThOrden>
              <ThOrden col="tipico" n porDefecto desc title={`Lo que se vendería en ${f.dias} días al ritmo típico`}>Típico</ThOrden>
              <ThOrden col="mejor" n desc title={`Lo que se vendería en ${f.dias} días al ritmo del mejor momento`}>Mejor</ThOrden>
              <ThOrden col="segun_compras" n desc title={`Lo que se vendería en ${f.dias} días al ritmo con que se vendieron las últimas compras registradas (invoices y courier)`}>Según compras</ThOrden>
              <ThOrden col="dias_venta" n desc title="Días con venta en el período">Días venta</ThOrden>
              <ThOrden col="stock" n desc>Stock</ThOrden>
              <ThOrden col="comprar" n desc title="Típico menos el stock de hoy">A comprar</ThOrden>
              <ThOrden col="costo" n desc>Costo US$</ThOrden>
              <ThOrden col="inversion" n desc title="A comprar × costo">Inversión US$</ThOrden>
              <ThOrden col="ultima" desc>Últ. venta</ThOrden>
              <ThOrden col="precio" n desc title="La última venta llevada a pesos de hoy">Precio hoy</ThOrden>
              <th className={THN}>Clásica</th>
              <th className={THN} title="Comisión, cargo fijo o envío de Mercado Libre">ML</th>
              <ThOrden col="ganancia_unit" n desc title="Ganancia por unidad">Ganancia</ThOrden>
              <ThOrden col="margen" n desc title="Ganancia sobre el precio de venta">% venta</ThOrden>
              <ThOrden col="roi" n desc title="Ganancia sobre el costo">% costo</ThOrden>
              <ThOrden col="ganancia" n desc title="Ganancia de lo que hay que comprar, al ritmo típico">Total típico</ThOrden>
              <ThOrden col="ganancia_mejor" n desc title="Ganancia de lo que hay que comprar, al ritmo del mejor momento">Total mejor</ThOrden>
            </tr>
          </thead>
          <tbody>
            {vista.length === 0 && <tr><td colSpan={18} className={`${TD} text-[#5C6B76]`}>No hay ventas con ritmo regular en ese período.</td></tr>}
            {vista.map((x) => (
              <tr key={x.clave} className={TR}>
                <td className={`${TD} max-w-[17rem]`}>
                  <span className="flex items-center gap-2 min-w-0">
                    <FotosProducto fotos={x.fotos} titulo={x.titulo} />
                    {x.producto_id ? <Link href={`/catalogo/productos/${x.producto_id}`} className="font-mono text-[#16577F] hover:underline whitespace-nowrap">{x.sku}</Link> : <span className="font-mono whitespace-nowrap">{x.sku}</span>}
                    <span className="text-[#5C6B76] truncate" title={x.titulo}>{x.titulo}</span>
                    {x.archivado && <span className="shrink-0"><Estado texto={x.producto_id ? "Inactivo" : "No está en el catálogo"} tono="gris" /></span>}
                  </span>
                  <span className="block text-[10px] text-[#5C6B76] whitespace-nowrap truncate" title="Días con venta en el período · tramos con venta regular">
                    {entero(x.ventanas)} tramos regulares de {f.dias} días
                    {x.grandes > 0 && <span className="text-[#8a6100]"> · {x.grandes} compra{x.grandes === 1 ? "" : "s"} grande{x.grandes === 1 ? "" : "s"} no considerada{x.grandes === 1 ? "" : "s"} (mayor {entero(x.mayor_grande)} u.)</span>}
                  </span>
                </td>
                <td className={TDN}>{entero(x.tipico)}</td>
                <td className={TDN}>{entero(x.mejor)}</td>
                <td className={TDN} title={x.compras_n ? `${x.compras_n} compra${x.compras_n === 1 ? "" : "s"} registrada${x.compras_n === 1 ? "" : "s"}; la última llegó el ${fechaCorta(x.ultima_compra)} (${entero(x.ultima_cant ?? 0)} u.)${x.dias_compra != null ? `; cada compra tardó unos ${x.dias_compra} días en venderse` : ""}` : "Sin compras registradas"}>
                  {x.segun_compras != null ? entero(x.segun_compras) : "—"}
                  {x.compras_n > 0 && <span className="block text-[10px] text-[#5C6B76] whitespace-nowrap">{x.compras_n} comp.{x.dias_compra != null ? ` · ${x.dias_compra} d` : ""}</span>}
                </td>
                <td className={TDN}>{entero(x.dias_con_venta)}</td>
                <td className={TDN}>{entero(x.stock)}</td>
                <td className={`${TDN} font-semibold`} title={`Según el mejor momento: ${entero(x.comprar_mejor)}`}>{entero(x.comprar_tipico)}</td>
                <td className={TDN}>{usd(x.costo_usd)}</td>
                <td className={TDN}>{x.costo_usd == null ? "—" : usd(x.costo_usd * x.comprar_tipico)}</td>
                <td className={`${TD} whitespace-nowrap text-[11px] leading-tight`} title={`En dólares: ${usd(x.precio_usd)}`}>
                  {dma(x.ultima_fecha)}<span className="block">{pesos(x.ultima_precio)}</span><span className="block text-[#5C6B76]">dólar {x.ultima_tc ? formatearNumero(x.ultima_tc, "pesos") : "—"}</span>
                </td>
                <td className={`${TDN} font-semibold`}>{pesos(x.precio_hoy)}</td>
                <td className={TDN}>{pesos(x.clasica)}</td>
                <td className={TDN} title={`Comisión ${pct(x.comision_pct)} + cargo fijo o envío`}>{pesos(x.costos_ml)}</td>
                <td className={`${TDN} ${x.ganancia_unit != null && x.ganancia_unit < 0 ? "text-[#C03420] font-semibold" : ""}`}>{pesos(x.ganancia_unit)}</td>
                <td className={`${TDN} ${x.margen_pct != null && x.margen_pct < 0 ? "text-[#C03420]" : ""}`}>{pct(x.margen_pct)}</td>
                <td className={`${TDN} ${x.roi_pct != null && x.roi_pct < 0 ? "text-[#C03420]" : ""}`}>{pct(x.roi_pct)}</td>
                <td className={`${TDN} font-semibold`}>{x.ganancia_unit == null ? "—" : pesos(x.ganancia_unit * x.comprar_tipico)}</td>
                <td className={TDN}>{x.ganancia_unit == null ? "—" : pesos(x.ganancia_unit * x.comprar_mejor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={filas.length} />
      <p className="text-[10px] text-[#5C6B76] mt-1">Calculado el {new Date(calculado).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}: el cálculo se guarda 30 minutos (filtrar, ordenar y cambiar de página no lo rehacen).</p>
      <p className="text-[11px] text-[#5C6B76] mt-2">
        Costo = último costo de la ficha; precio = la última venta pasada a dólares con el oficial de ese día y a pesos con el de hoy{tcHoy ? ` ($ ${formatearNumero(tcHoy, "pesos")})` : ""}. Los filtros «Días con venta» y «Última venta» sólo esconden renglones: los cálculos usan todo el período. Cómo se calcula: no hay historia del stock, así que se toman los tramos de {f.dias} días en que el producto se vendió con regularidad (sin un hueco más largo de lo normal para ese producto).
        Típico = lo que se vendió en un tramo común (la mediana); mejor momento = el mejor tramo. A comprar = lo que se vendería menos el stock de hoy; la inversión y la ganancia total son sobre eso. Las compras grandes de una sola vez no cuentan. Precio hoy = la última venta llevada a pesos de hoy (por eso puede diferir de la Clásica actual). Ganancia = precio de hoy − comisión, cargo fijo y envío de Mercado Libre − costo. Es una referencia para chequear.
      </p>
    </Pantalla>
  );
}
