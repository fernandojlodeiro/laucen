// Compras › Sugerencia de compra (pedido de Fer, 12/10; lib/compras/sugerencia.ts): qué comprar para N días según el
// ritmo real de venta de la historia (típico y mejor momento), cuánto se invierte y qué ganancia podría dejar.

import MarcaMercado from "@/app/componentes/MarcaMercado";
import Link from "next/link";
import { VERDE } from "@/app/botones";
import BuscadorVivo, { CasillaViva } from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import FotosProducto from "@/app/componentes/FotosProducto";
import { Paginado, ThOrden } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, Estado, url, editandoFicha, BotonesFicha, Dato, TituloSeccion, CAJA, CAMPO, ETIQUETA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { CAMPOS_VIA, CATEGORIAS_VIA, configVia } from "@/lib/compras/via";
import { accionClasicaAMercado, accionGuardarVia, accionPrecioMercado } from "./acciones";
import Vias from "./Vias";
import ExcelProveedor from "./ExcelProveedor";
import Globo, { type Cuenta } from "./Globo";
import FiltrosConOk from "@/app/componentes/FiltrosConOk";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { SUAVE } from "@/app/botones";
import { RESULTADOS_POR_BUSQUEDA, TOPE_TANDA, USD_POR_RESULTADO, seguirTandas, ultimaTanda } from "@/lib/compras/precio-mercado";
import { Desplegable } from "@/app/informes/Filtros";
import Categorias from "./Categorias";
import { coincideBusqueda } from "@/lib/busqueda";
import { consulta } from "@/lib/erp/base";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { formatearNumero } from "@/lib/numeros";
import { hoyArgentina } from "@/lib/rango-fechas";
import { type FilaSugerencia, CANTIDADES_PEDIDO, DEMORA_LLEGADA, DIAS_VENDIENDO, DIFERENCIA_REVISAR, viasElegidas, MIN_DIAS_VENTA, ORDEN_SUGERENCIA, ULTIMA_VENTA_MESES, arbolCategorias, filtrarMuestra, leerFiltroSugerencia, sugerenciaGuardada, totalesSugerencia } from "@/lib/compras/sugerencia";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DIAS_OPCIONES = [30, 45, 60, 90, 120, 180];
const DEMORA_OPCIONES = [0, 20, 30, 40, 50, 60, 75, 90, 120];
type SP = Record<string, string | undefined>;
const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const usd = (n: number | null) => (n == null ? "—" : `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const entero = (n: number) => formatearNumero(n, "entero");
const fechaCorta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—");
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
const dma = (iso: string) => iso.split("-").reverse().join("/");

/** Lo que muestra el globo del producto: la vía y la cuenta por avión y por barco. */
function cuentaDe(x: FilaSugerencia, tc: number | null): Cuenta {
  const c = CATEGORIAS_VIA[x.via];
  const via = (nombre: string, final: number | null, gan: number | null, venta: number | null, costo: number | null) => ({
    nombre, costo: final != null && tc ? pesos(final * tc) : "—", ganancia: gan != null && tc ? pesos(gan * tc) : "—", venta: pct(venta), costoPct: pct(costo), negativa: gan != null && gan < 0,
  });
  return {
    via: c.texto, viaAyuda: c.ayuda, tono: c.tono, flete: pct(x.flete_aereo_pct),
    precio: pesos(x.precio_venta), precioDe: x.precio_base === "clasica" ? "Clásica" : x.precio_base === "mercado" ? "mercado" : x.precio_base === "ultima" ? "última venta" : "sin precio",
    ml: pesos(x.costos_ml),
    vias: [via("Avión", x.avion_final, x.avion_ganancia, x.avion_margen, x.avion_sobre_costo), via("Barco", x.barco_final, x.barco_ganancia, x.barco_margen, x.barco_sobre_costo)],
    pedido: `A comprar ${entero(x.comprar_tipico)} (la cuenta da ${entero(x.comprar_exacto)}) · stock hoy ${entero(x.stock)}, al llegar ${entero(x.al_llegar)}`,
  };
}

export default async function SugerenciaCompra({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const f = leerFiltroSugerencia(sp, hoyArgentina());
  const { filas: todas, tcHoy, calculado } = await sugerenciaGuardada(s.org.id, f);
  const [{ nodos, ancestros }, cfgVia, tanda] = await Promise.all([arbolCategorias(s.org.id, todas), configVia(s.org.id), ultimaTanda(s.org.id), seguirTandas(s.org.id).catch(() => 0)]);
  const editandoVia = editandoFicha(sp, "via");
  // Proveedor preferido: los que tienen algún producto en la sugerencia.
  const provIds = [...new Set(todas.map((x) => x.proveedor_id).filter((x): x is number => x != null))];
  const proveedores = provIds.length ? await consulta<{ id: number; nombre: string }>("select id::int, nombre from proveedor where organizacion_id = $1 and id = any($2::bigint[]) order by lower(nombre)", [s.org.id, provIds]) : [];
  const sinCat = new Set((sp.sin_cat ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && sp.sin_cat));
  const categoriaFuera = (x: (typeof todas)[number]) => x.familia_id == null ? sinCat.has(0) : (ancestros.get(x.familia_id) ?? []).some((id) => sinCat.has(id));
  const q = sp.q?.trim() ?? "";
  const coincide = (x: (typeof todas)[number]) => !categoriaFuera(x) && (!q || coincideBusqueda([x.sku, x.titulo], q, sp.contiene !== "1"));
  const filas = filtrarMuestra(todas, sp, coincide);
  // Cuántos hay de cada vía con los demás filtros puestos.
  const sinVia = filtrarMuestra(todas, { ...sp, via: undefined }, coincide);
  const opcionesVia = Object.entries(CATEGORIAS_VIA).map(([k, c]) => ({ clave: k, texto: c.texto, ayuda: c.ayuda, n: sinVia.filter((x) => x.via === k).length }));
  const t = totalesSugerencia(filas);
  const idsMercado = [...new Set(filas.map((x) => x.producto_id).filter((x): x is number => x != null))].slice(0, TOPE_TANDA);
  const vista = paginarEnMemoria(ordenarEnMemoria(filas, sp, ORDEN_SUGERENCIA), sp);
  const params = { desde: f.desde, hasta: f.hasta, dias: f.dias === 60 ? null : f.dias, con_mercado: f.conMercado ? "1" : null, demora: f.demora === DEMORA_LLEGADA ? null : f.demora, q: q || null, contiene: sp.contiene ?? null, orden: sp.orden ?? null, dir: sp.dir ?? null, min_dias: sp.min_dias ?? null, vmeses: sp.vmeses ?? null, con_stock: sp.con_stock ?? null, sin_cat: sp.sin_cat ?? null, prov: sp.prov ?? null, via: sp.via ?? null };

  return (
    // Para ahorrar alto (Fer, 28/10): los botones arriba a la derecha, a la altura del título; el estado de la búsqueda de
    // precio de mercado, en el renglón chico de debajo del título; los filtros en un renglón y los totales, compactos.
    <Pantalla titulo="Sugerencia de compra" ancho="max-w-7xl"
      subtitulo={<span title={`Qué comprar para ${f.dias} días al ritmo real de la historia (típico y mejor momento), descontando lo que se vende en los ${f.demora} días que tarda en llegar. Sin notebooks.`}>
        {tanda ? <>Precio de mercado: última búsqueda del {tanda.creado.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })},{" "}
          {tanda.estado === "corriendo" ? <b className="text-[#16577F]">buscando: {tanda.hechos + tanda.errores} de {tanda.total}</b> : <>{tanda.hechos} de {tanda.total} con precio</>}
          {tanda.errores > 0 && `, ${tanda.errores} sin resultados`}{tanda.estado === "cortada" && ` · se cortó: ${tanda.mensaje ?? ""}`}.</> : "Sin búsquedas de precio de mercado."}
      </span>}
      acciones={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <BotonTarea accion={accionPrecioMercado} tipo="precio-mercado" clase={SUAVE} campos={{ ids: idsMercado.join(",") }}
            texto={`Buscar precio de mercado (${idsMercado.length})`}
            pregunta={`¿Buscar en Mercado Libre el precio de los ${idsMercado.length} productos de la lista? Cuesta unos US$ ${(idsMercado.length * RESULTADOS_POR_BUSQUEDA * USD_POR_RESULTADO).toFixed(2)} de Apify`} />
          <a href={url("/compras/sugerencia/excel", params)} className={VERDE}>Descargar Excel</a>
          <ExcelProveedor href={url("/compras/sugerencia/proveedor", params)} opciones={CANTIDADES_PEDIDO} />
        </div>
      }>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
          <FiltrosConOk>
          <BuscadorVivo q={q} comienza={sp.contiene !== "1"} placeholder="SKU o producto" limpiar={["p"]} />
          <RangoFechas desde={f.desde} hasta={f.hasta} etiqueta="Historia" limpiar={["p"]} />
          <Desplegable parametro="dias" etiqueta="Comprar para" valor={f.dias === 60 ? "" : String(f.dias)} limpiar={["p"]}
            opciones={DIAS_OPCIONES.map((d) => ({ valor: d === 60 ? "" : String(d), texto: `${d} días` }))} />
          <Desplegable parametro="demora" etiqueta="Llega en" valor={f.demora === DEMORA_LLEGADA ? "" : String(f.demora)} limpiar={["p"]}
            opciones={DEMORA_OPCIONES.map((d) => ({ valor: d === DEMORA_LLEGADA ? "" : String(d), texto: d ? `${d} días` : "Ya (sin demora)" }))} />
          <Desplegable parametro="min_dias" etiqueta="Días con venta" valor={sp.min_dias ?? ""} limpiar={["p"]}
            opciones={[{ valor: "", texto: "Todos" }, ...MIN_DIAS_VENTA.map((d) => ({ valor: String(d), texto: `Más de ${d}` }))]} />
          <Desplegable parametro="vmeses" etiqueta="Última venta" valor={sp.vmeses ?? ""} limpiar={["p"]}
            opciones={[{ valor: "", texto: "Cualquiera" }, ...ULTIMA_VENTA_MESES.map(([m, t]) => ({ valor: String(m), texto: `En ${t}` }))]} />
          <Desplegable parametro="prov" etiqueta="Proveedor" valor={sp.prov ?? ""} limpiar={["p"]}
            opciones={[{ valor: "", texto: "Todos" }, ...proveedores.map((p) => ({ valor: String(p.id), texto: p.nombre })), { valor: "0", texto: "Sin proveedor preferido" }]} />
          <Vias opciones={opcionesVia} elegidas={[...viasElegidas(sp.via)]} />
          <Categorias nodos={nodos} sinCategoria={todas.filter((x) => x.familia_id == null).length} excluidas={[...sinCat]} />
          <CasillaViva parametro="con_stock" activo={sp.con_stock === "1"} etiqueta="Incluye los que tienen stock suficiente" ayuda="Los que no hace falta comprar: lo que quede del stock cuando llegue la compra alcanza para los días elegidos" />
          <CasillaViva parametro="con_mercado" activo={f.conMercado} etiqueta="Calcular con el precio de mercado"
            ayuda="Todo producto que tiene precio de mercado se calcula a ese precio, como si lo vendieras al precio del más barato, lo vendas o no. Destildada, la Clásica para lo que vendés" />
          </FiltrosConOk>
      </div>
      {/* Tarjetas de totales (Fer, 28/10: las quiere así), compactas para no comer alto. */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2 text-xs">
        {[["Productos", `${entero(t.productos)} (${entero(t.conCosto)} con costo)`],
          ["Unidades a comprar · típico / mejor", `${entero(t.unidadesTipicas)} / ${entero(t.unidadesMejor)}`],
          ["Al proveedor (FOB) · típico / mejor", `${usd(t.fobTipicoUsd)} / ${usd(t.fobMejorUsd)}`],
          ["Costo puesto acá · típico / mejor", `${usd(t.inversionTipicaUsd)} / ${usd(t.inversionMejorUsd)}`],
          ["Ganancia estimada · típico / mejor", `${pesos(t.gananciaTipica)} / ${pesos(t.gananciaMejor)}`, tcHoy ? `${usd(t.gananciaTipica / tcHoy)} / ${usd(t.gananciaMejor / tcHoy)}` : null]].map(([k, v, v2]) => (
          <div key={k} className="bg-white border border-[#E3E9F0] rounded-xl px-2 py-1.5">
            <span className="block text-[11px] text-[#5C6B76]">{k}</span><b className="tabular-nums">{v}</b>
            {v2 && <span className="block tabular-nums text-[#5C6B76]">{v2}</span>}
          </div>
        ))}
      </div>
      {/* Los títulos quedan fijos al desplazarse (Fer, 12/10): la tabla tiene su propio alto y se desplaza adentro. */}
      <div className={`${CAJA_TABLA} max-h-[calc(100vh-13rem)] overflow-y-auto`}>
        <table className={`${TABLA} text-[11px] [&_td]:px-1.5 [&_th]:px-1.5`}>
          <thead className={`${THEAD} sticky top-0 z-10 shadow-[0_1px_0_#E3E9F0]`}>
            <tr>
              <ThOrden col="sku">Producto</ThOrden>
              <ThOrden col="tipico" n porDefecto desc title={`Lo que se vendería en ${f.dias} días al ritmo típico`}>Típico</ThOrden>
              <ThOrden col="mejor" n desc title={`Lo que se vendería en ${f.dias} días al ritmo del mejor momento`}>Mejor</ThOrden>
              <ThOrden col="segun_compras" n desc title={`Lo que se vendería en ${f.dias} días al ritmo con que se vendieron las últimas compras registradas (invoices y courier)`}>Según compras</ThOrden>
              <ThOrden col="dias_venta" n desc title="Días con venta en el período">Días venta</ThOrden>
              <ThOrden col="stock" n desc title="Disponible hoy">Stock</ThOrden>
              <ThOrden col="al_llegar" n desc title={`Lo que va a quedar cuando llegue la compra: el stock de hoy menos lo que se vende en ${f.demora} días al ritmo típico`}>Al llegar</ThOrden>
              <ThOrden col="comprar" n desc title={`Típico menos lo que quede al llegar (en ${f.demora} días)`}>A comprar</ThOrden>
              <ThOrden col="costo" n desc title="Costo puesto acá por unidad, de la vía que le corresponde: avión (courier) si por avión deja el margen mínimo; si no, barco (con la NCM si está cargada). Sin peso o FOB, el de la ficha">Costo US$</ThOrden>
              <ThOrden col="inversion" n desc title="A comprar × costo puesto acá">Inversión US$</ThOrden>
              <ThOrden col="ultima" desc>Últ. venta</ThOrden>
              <ThOrden col="clasica" n desc title={`El precio de la lista Clásica. La ganancia sale de acá si lo estás vendiendo (publicación activa en ML o venta en los últimos ${DIAS_VENDIENDO} días); si no, del precio de mercado. En ámbar si difiere más de ${DIFERENCIA_REVISAR} % del mercado`}>Clásica</ThOrden>
              <ThOrden col="mercado" n desc title="Precio de mercado: el más barato entre lo que la IA juzgó igual al producto en la búsqueda (sin packs, ni las nuestras, ni internacionales) y las publicaciones de la competencia que se siguen (pestaña Seguimiento: activas, revisadas, ni excluidas ni internacionales). Al pasar el mouse, de dónde sale">Mercado</ThOrden>
              <ThOrden col="precio" n desc title="La última venta llevada a pesos de hoy (sólo de referencia)">Últ. venta hoy</ThOrden>
              <th className={THN} title="Comisión, cargo fijo o envío de Mercado Libre">ML</th>
              <ThOrden col="ganancia_unit" n desc title="Ganancia por unidad: precio de venta − Mercado Libre − costo puesto acá (el de la columna Costo US$)">Ganancia</ThOrden>
              <ThOrden col="margen" n desc title="Ganancia sobre el precio de venta">% venta</ThOrden>
              <ThOrden col="roi" n desc title="Ganancia sobre el costo puesto acá">% costo</ThOrden>
              <th className={TH} title="¿Avión o barco? Según el flete aéreo y la ganancia por avión (ver abajo)">Vía</th>
              <ThOrden col="flete_aereo" n desc title={`Flete aéreo por unidad (US$ ${cfgVia.aereoUsdKg} por kilo cobrable) como % del FOB`}>Flete avión</ThOrden>
              <ThOrden col="avion_final" n desc title="Costo final por unidad puesto acá, trayéndolo por avión (courier: FOB + flete + % de courier), en pesos al oficial de hoy">Costo avión</ThOrden>
              <ThOrden col="avion_margen" n desc title="Ganancia sobre el precio de venta trayéndolo por avión">% avión</ThOrden>
              <ThOrden col="avion_sobre_costo" n desc title="Ganancia sobre el costo final trayéndolo por avión">% c/costo avión</ThOrden>
              <ThOrden col="barco_final" n desc title="Costo final por unidad puesto acá, trayéndolo por barco (impuestos e IVA incluidos), en pesos al oficial de hoy">Costo barco</ThOrden>
              <ThOrden col="barco_margen" n desc title="Ganancia sobre el precio de venta trayéndolo por barco">% barco</ThOrden>
              <ThOrden col="barco_sobre_costo" n desc title="Ganancia sobre el costo final trayéndolo por barco">% c/costo barco</ThOrden>
              <ThOrden col="ganancia" n desc title="Ganancia de lo que hay que comprar, al ritmo típico">Total típico</ThOrden>
              <ThOrden col="ganancia_mejor" n desc title="Ganancia de lo que hay que comprar, al ritmo del mejor momento">Total mejor</ThOrden>
            </tr>
          </thead>
          <tbody>
            {vista.length === 0 && <tr><td colSpan={28} className={`${TD} text-[#5C6B76]`}>No hay ventas con ritmo regular en ese período.</td></tr>}
            {vista.map((x) => (
              <tr key={x.clave} className={TR}>
                <td className={`${TD} max-w-[17rem]`}>
                  <Globo cuenta={cuentaDe(x, tcHoy)}>
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
                  </Globo>
                </td>
                <td className={TDN}>{entero(x.tipico)}</td>
                <td className={TDN}>{entero(x.mejor)}</td>
                <td className={TDN} title={x.compras_n ? `${x.compras_n} compra${x.compras_n === 1 ? "" : "s"} registrada${x.compras_n === 1 ? "" : "s"}; la última llegó el ${fechaCorta(x.ultima_compra)} (${entero(x.ultima_cant ?? 0)} u.)${x.dias_compra != null ? `; cada compra tardó unos ${x.dias_compra} días en venderse` : ""}` : "Sin compras registradas"}>
                  {x.segun_compras != null ? entero(x.segun_compras) : "—"}
                  {x.compras_n > 0 && <span className="block text-[10px] text-[#5C6B76] whitespace-nowrap">{x.compras_n} comp.{x.dias_compra != null ? ` · ${x.dias_compra} d` : ""}</span>}
                </td>
                <td className={TDN}>{entero(x.dias_con_venta)}</td>
                <td className={TDN}>{entero(x.stock)}</td>
                <td className={TDN}>{entero(x.al_llegar)}</td>
                <td className={`${TDN} font-semibold`} title={`La cuenta da ${entero(x.comprar_exacto)}; redondeado a decenas (hasta 3 baja, desde 4 sube). Según el mejor momento: ${entero(x.comprar_mejor)}`}>{entero(x.comprar_tipico)}</td>
                <td className={TDN} title={x.costo_de === "avion" ? "Por avión (courier)" : x.costo_de === "barco" ? `Por barco${x.con_ncm ? ", con la NCM" : ", sin NCM cargada"}` : x.costo_de === "ficha" ? "El de la ficha (falta peso o FOB para calcular por vía)" : undefined}>
                  {usd(x.costo_usd)}{x.costo_de && <span className="block text-[10px] text-[#5C6B76]">{x.costo_de === "avion" ? "avión" : x.costo_de === "barco" ? "barco" : "ficha"}</span>}
                </td>
                <td className={TDN}>{x.costo_usd == null ? "—" : usd(x.costo_usd * x.comprar_tipico)}</td>
                <td className={`${TD} whitespace-nowrap text-[11px] leading-tight`} title={`En dólares: ${usd(x.precio_usd)}`}>
                  {dma(x.ultima_fecha)}<span className="block">{pesos(x.ultima_precio)}</span><span className="block text-[#5C6B76]">dólar {x.ultima_tc ? formatearNumero(x.ultima_tc, "pesos") : "—"}</span>
                </td>
                <td className={`${TDN} whitespace-nowrap ${x.revisar ? "bg-[#FFF4D6]" : ""} ${x.precio_base === "clasica" ? "font-semibold" : "text-[#5C6B76]"}`}
                  title={x.precio_base === "clasica" ? "La ganancia sale de este precio" : x.vendiendo ? undefined : `No lo estás vendiendo (sin publicación activa en ML ni ventas en ${DIAS_VENDIENDO} días): la ganancia sale del precio de mercado`}>
                  <span className="inline-flex items-center gap-1.5">{pesos(x.clasica)}{x.producto_id != null && <MarcaMercado estado={x.estado_mercado} href={`/catalogo/productos/${x.producto_id}?seccion=seguimiento`} />}</span>
                  {!x.vendiendo && <span className="block text-[10px] font-normal">no lo vendés</span>}
                </td>
                <td className={`${TDN} whitespace-nowrap ${x.revisar ? "bg-[#FFF4D6]" : ""} ${x.precio_base === "mercado" ? "font-semibold" : ""}`}
                  title={x.mercado != null ? `${x.mercado_de === "seguimiento" ? "Publicación seguida" : "Búsqueda de la IA"}${x.mercado_vendedor ? ` · ${x.mercado_vendedor}` : ""}${x.mercado_ts ? ` · leído el ${fechaCorta(x.mercado_ts)}` : ""}${x.mercado_mediana != null ? ` · mediana de la búsqueda ${pesos(x.mercado_mediana)}` : ""}${x.precio_base === "mercado" ? " · la ganancia sale de este precio" : ""}` : "Sin precio de mercado: ni la búsqueda encontró iguales ni hay publicaciones seguidas activas"}>
                  {pesos(x.mercado)}
                  {x.mercado != null && x.clasica ? <span className={`block text-[10px] ${x.revisar ? "text-[#8a6100] font-semibold" : "text-[#5C6B76]"}`}>{x.mercado >= x.clasica ? "+" : ""}{Math.round((x.mercado / x.clasica - 1) * 100)} %</span> : null}
                  {x.revisar && x.variacion_id != null && (
                    <BotonTarea accion={accionClasicaAMercado} tipo={`clasica-mercado-${x.variacion_id}`} clase={`${SUAVE} !px-1.5 !py-0.5 !text-[10px] mt-0.5`} campos={{ variacion: String(x.variacion_id) }}
                      texto="Usar mercado"
                      pregunta={`¿Pasar la Clásica de ${x.sku} de ${pesos(x.clasica)} a ${pesos(Math.round(x.mercado!))}? Es un cambio de precio a mano: va también a Mercado Libre`} />
                  )}
                </td>
                <td className={`${TDN} text-[#5C6B76]`} title={x.precio_base === "ultima" ? "Sin Clásica ni precio de mercado: la ganancia sale de este precio" : undefined}>
                  {pesos(x.precio_hoy)}{x.precio_base === "ultima" && <span className="text-[#8a6100]"> *</span>}
                </td>
                <td className={TDN} title={`Comisión ${pct(x.comision_pct)} + cargo fijo o envío`}>{pesos(x.costos_ml)}</td>
                <td className={`${TDN} ${x.ganancia_unit != null && x.ganancia_unit < 0 ? "text-[#C03420] font-semibold" : ""}`}>{pesos(x.ganancia_unit)}</td>
                <td className={`${TDN} ${x.margen_pct != null && x.margen_pct < 0 ? "text-[#C03420]" : ""}`}>{pct(x.margen_pct)}</td>
                <td className={`${TDN} ${x.roi_pct != null && x.roi_pct < 0 ? "text-[#C03420]" : ""}`}>{pct(x.roi_pct)}</td>
                <td className={TD} title={`${CATEGORIAS_VIA[x.via].ayuda}${x.medidas === "ficha" ? " Peso y medidas de la ficha (no hay packing list)." : ""}${x.con_ncm ? "" : ` Sin NCM cargada: por barco, impuestos y gastos = ${cfgVia.recargoSinDatosPct} %.`}`}>
                  <Estado texto={CATEGORIAS_VIA[x.via].texto} tono={CATEGORIAS_VIA[x.via].tono} />
                </td>
                <td className={TDN} title={x.fob_usd != null ? `FOB US$ ${x.fob_usd}` : "Sin FOB en la ficha"}>{pct(x.flete_aereo_pct)}</td>
                <td className={TDN} title={x.avion_final != null ? `${usd(x.avion_final)} · ganancia ${usd(x.avion_ganancia)}` : undefined}>{x.avion_final != null && tcHoy ? pesos(x.avion_final * tcHoy) : "—"}</td>
                <td className={`${TDN} ${x.avion_margen != null && x.avion_margen < 0 ? "text-[#C03420]" : ""}`}>{pct(x.avion_margen)}</td>
                <td className={`${TDN} ${x.avion_sobre_costo != null && x.avion_sobre_costo < 0 ? "text-[#C03420]" : ""}`}>{pct(x.avion_sobre_costo)}</td>
                <td className={TDN} title={x.barco_final != null ? `${usd(x.barco_final)} · ganancia ${usd(x.barco_ganancia)}` : undefined}>{x.barco_final != null && tcHoy ? pesos(x.barco_final * tcHoy) : "—"}</td>
                <td className={`${TDN} ${x.barco_margen != null && x.barco_margen < 0 ? "text-[#C03420]" : ""}`}>{pct(x.barco_margen)}</td>
                <td className={`${TDN} ${x.barco_sobre_costo != null && x.barco_sobre_costo < 0 ? "text-[#C03420]" : ""}`}>{pct(x.barco_sobre_costo)}</td>
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
        Costo = costo puesto acá de la vía que le corresponde (avión si por avión deja el margen mínimo; si no, barco; sin peso o FOB, el de la ficha). Precio de venta: la Clásica si lo estás vendiendo (publicación activa en Mercado Libre o venta en los últimos {DIAS_VENDIENDO} días), si no el precio de mercado (el más barato de los iguales); en negrita el que se usa; en ámbar si difieren más de {DIFERENCIA_REVISAR} % («Usar mercado» pasa la Clásica a ese precio); con * los que no tienen ninguno de los dos (sale de la última venta). «Últ. venta hoy» = la última venta pasada a dólares con el oficial de ese día y a pesos con el de hoy{tcHoy ? ` ($ ${formatearNumero(tcHoy, "pesos")})` : ""}. Los filtros «Días con venta» y «Última venta» sólo esconden renglones: los cálculos usan todo el período. Cómo se calcula: no hay historia del stock, así que se toman los tramos de {f.dias} días en que el producto se vendió con regularidad (sin un hueco más largo de lo normal para ese producto).
        Típico = lo que se vendió en un tramo común (la mediana); mejor momento = el mejor tramo. A comprar = lo que se vendería menos lo que quede del stock de hoy cuando llegue la compra (en {f.demora} días, al mismo ritmo); la inversión y la ganancia total son sobre eso. Las compras grandes de una sola vez no cuentan. Ganancia = precio de venta − comisión, cargo fijo y envío de Mercado Libre − costo puesto acá. Es una referencia para chequear.
      </p>
      <section className="mt-6">
        <TituloSeccion titulo="¿Avión o barco?">
          <BotonesFicha editando={editandoVia} ver="/compras/sugerencia" editar="/compras/sugerencia?editar=via" form="via" />
        </TituloSeccion>
        <form id="via" action={accionGuardarVia} className={`${CAJA} flex flex-wrap items-start gap-4`}>
          {CAMPOS_VIA.map(([k, t, u]) => editandoVia
            ? <label key={k} className="w-48"><span className={ETIQUETA}>{t} ({u})</span><CampoNumero name={k} valor={cfgVia[k]} tipo="decimal" className={`${CAMPO} w-full`} /></label>
            : <Dato key={k} etiqueta={`${t} (${u})`} numero className="w-48">{formatearNumero(cfgVia[k], "decimal")}</Dato>)}
          <p className="basis-full text-[11px] text-[#5C6B76]">
            Por unidad: flete por avión = kilos cobrables (el mayor entre el peso real y el volumétrico, volumen × 167 kg/m³) × US$ por kilo; por barco = volumen × US$ por m³.
            Peso y volumen salen del packing list de las compras y, si no hay, de la ficha. Por avión viene por courier: costo final = FOB + flete + el % de courier sobre el FOB (sin despacho).
            Por barco, costo final con IVA: si el producto tiene NCM cargada (pestaña Costo), CIF + derechos, estadística, despachante y depósito + IVA; si no, FOB + flete más el recargo de arriba. La ganancia sale del precio de venta (la Clásica o el de mercado, como arriba) menos lo de Mercado Libre, en dólares al oficial de hoy.
            {" "}{Object.values(CATEGORIAS_VIA).map((c) => `${c.texto}: ${c.ayuda}`).join(" ")}
          </p>
        </form>
      </section>
    </Pantalla>
  );
}
