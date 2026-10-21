// Precios en ML › Ofertas relámpago (Fer, 12/10): las propuestas de oferta relámpago de Mercado Libre de todas las
// cuentas, con cuánto se recibe en la oferta contra hoy, el piso por producto (lápiz en la fila) y el lote para entrar
// (lib/precios-ml/relampago.ts).

import Link from "next/link";
import CampoNumero from "@/app/componentes/CampoNumero";
import FotosProducto from "@/app/componentes/FotosProducto";
import PreguntaArriba, { BotonPreguntar } from "@/app/componentes/PreguntaArriba";
import { VERDE, SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Lapiz, url, CAJA_TABLA, THEAD, TR } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { coincideBusqueda } from "@/lib/busqueda";
import { relampagos, enviosRelampago, fechaRelampago, entraSola, elegirOfertas, claveCola, esCompartida, RELAMPAGO_AUTO_PCT, type Relampago } from "@/lib/precios-ml/relampago";
import BuscadorVivo, { CasillaViva } from "@/app/componentes/BuscadorVivo";
import { PLAN_INFO } from "@/lib/precios-ml/motor";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { accionEntrarRelampago, accionEntrarRelampagosHasta, accionGuardarFilaRelampago, accionPrepararRelampagos } from "./acciones";
import { ThOrden } from "@/app/componentes/Lista";
import { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import { accionInterruptor } from "../acciones";
import { Interruptor } from "@/app/radar/Piezas";
import { BarraPml } from "../comun";
import { RELAMPAGO_PML, canalElegido } from "../lista";

export const dynamic = "force-dynamic";

type SP = { canal?: string; editar?: string; q?: string; contiene?: string; todas?: string; aceptadas?: string; orden?: string; dir?: string; hasta?: string; ok?: string; error?: string };

// Orden tocando el título (Fer, 13/10): columna → valor de la fila (lista blanca; en memoria).
const ORDEN: Record<string, (f: Relampago) => string | number | null> = {
  oferta: (f) => OFERTA(f), sku: (f) => f.sku, producto: (f) => f.titulo, cuenta: (f) => f.cuenta, plan: (f) => f.plan, estado: (f) => f.estado, cuando: (f) => f.desde,
  stock: (f) => f.stock, entra: (f) => f.stockEntrar, hoy: (f) => f.hoy, recibis: (f) => f.recibisHoy, costo: (f) => f.costoHoyPct,
  base: (f) => f.base, rel: (f) => f.rel, baja: (f) => f.bajaPct, recibiras: (f) => f.recibisRel, costorel: (f) => f.costoRelPct, dif: (f) => f.diferencia,
  difpct: (f) => (f.costoRelPct != null && f.costoHoyPct != null ? f.costoRelPct - f.costoHoyPct : null), piso: (f) => f.piso,
};
const PCTS = [0, 1, 2, 3, 5, 7, 10];

// Columnas apretadas (Fer, 12/10): la tabla no se estira al ancho de la pantalla y los títulos largos van en dos renglones.
const TH = "py-1.5 px-1.5 text-left font-semibold leading-tight align-bottom";
const THN = `${TH} text-right`;
const TD = "py-1 px-1.5";
const TDN = "py-1 px-1.5 text-right whitespace-nowrap tabular-nums";

const pesos = (v: number | null | undefined) => (v == null ? "—" : formatear(v, "ARS"));
const pct = (v: number | null | undefined, signo = false) =>
  v == null ? "—" : `${signo && v > 0 ? "+" : ""}${v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const ESTADO: Record<string, string> = { candidate: "Propuesta", pending: "Aceptada (programada)", started: "En curso" };
/** Qué oferta es (Fer, 21/10: también las compartidas, donde ML pone parte del descuento). */
const OFERTA = (f: Relampago) => f.tipo_promo === "LIGHTNING" ? "Relámpago" : f.tipo_promo === "SMART_LIGHTNING" ? "Relámpago compartida" : `Compartida «${f.nombre_promo ?? f.promocion_id}»`;

/** Cuándo corre: lo fija Mercado Libre al aceptarla («15/10 12:00 a 23:59»). */
function cuando(f: Relampago): string {
  const d = fechaRelampago(f.desde), h = fechaRelampago(f.hasta);
  if (!d) return f.estado === "candidate" ? "La fija ML al entrar" : "—";
  return h && h.slice(0, 5) === d.slice(0, 5) ? `${d} a ${h.slice(6)}` : [d, h].filter(Boolean).join(" a ");
}

export default async function Relampago({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ml_ver");
  const sp = await searchParams;
  const { canales, canal } = await canalElegido(s.org.id, sp);
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  // «Todas las cuentas» y «Sólo aceptadas» (Fer, 12/10): para ver todo lo que está en relámpago.
  const todasCuentas = sp.todas === "1";
  const soloAceptadas = sp.aceptadas === "1";
  const todas = (await relampagos(s.org.id, todasCuentas ? null : canal?.id ?? null)).filter((f) => !soloAceptadas || f.estado !== "candidate");
  // Por SKU, título o número de publicación, con la regla de todos los buscadores (lib/busqueda.ts).
  const filas = q ? todas.filter((f) => coincideBusqueda([f.sku, f.titulo, f.item_id], q, comienza)) : todas;
  const ordenar = sp.orden && Object.hasOwn(ORDEN, sp.orden) ? ORDEN[sp.orden] : null;
  if (ordenar) {
    const d = sp.dir === "desc" ? -1 : 1;
    filas.sort((a, b) => { const x = ordenar(a), y = ordenar(b); if (x == null) return y == null ? 0 : 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * d; });
  }
  const envios = await enviosRelampago(s.org.id);
  const editar = sp.editar ?? "";
  const productos = [...new Set(filas.map((f) => f.producto_id))];
  const fotos = new Map((productos.length ? await consulta<{ producto_id: number; fotos: string[] }>(
    "select producto_id::int, array_agg(url order by orden) fotos from producto_foto where producto_id = any($1::bigint[]) group by producto_id", [productos]) : [])
    .map((x) => [x.producto_id, x.fotos]));
  const listas = filas.filter((f) => f.estado === "candidate" && f.alcanza === true && f.conStock !== false).length;
  // «Entrar a todas las que bajan hasta X %» (Fer, 13/10): cuántas serían, una por producto.
  const hastaPct = PCTS.includes(Number(sp.hasta)) && sp.hasta !== undefined && sp.hasta !== "" ? Number(sp.hasta) : 5;
  const todasCuentasFilas = todasCuentas ? todas : await relampagos(s.org.id, null);
  const envios0 = await enviosRelampago(s.org.id);
  const nHasta = elegirOfertas(todas.filter((f) => f.estado === "candidate" && f.rel != null && f.bajaPct != null && f.bajaPct <= hastaPct + 0.05
    && f.alcanza !== false && f.stock != null && f.stock > 0 && (f.stock_min == null || f.stock >= f.stock_min)), todasCuentasFilas, envios0, () => 0).length;
  const aqui = (extra: Record<string, unknown> = {}) => url(RELAMPAGO_PML, {
    canal: canal?.id, q: q || null, contiene: comienza ? null : "1", todas: todasCuentas ? "1" : null, aceptadas: soloAceptadas ? "1" : null, ...extra });
  return (
    <Pantalla titulo="Precios en Mercado Libre" ancho="max-w-[1500px]"
      subtitulo="Ofertas relámpago y compartidas: las que te propone Mercado Libre en la cuenta elegida, con cuánto recibís en la oferta contra lo que recibís hoy."
      acciones={<BotonPreguntar grupo="preparar" clase={VERDE} texto={`Preparar las que alcanzan el piso (${listas})`} corriendo="Preparando…"
        campos={{ canal: todasCuentas ? "" : String(canal?.id ?? ""), volver: aqui() }}
        pregunta="¿Preparar el lote para entrar a las ofertas que alcanzan el piso y tienen el stock que piden? Sale a Mercado Libre recién con tu clic en «Mandar a Mercado Libre». Una oferta relámpago aceptada no se puede borrar." />}>
      <Avisos sp={sp} />
      {canal && !todasCuentas && (
        <div className="mb-3">
          <Interruptor accion={accionInterruptor} prendido={canal.relampagoAuto} campos={{ canal: String(canal.id), clave: "relampago_auto", volver: aqui() }}
            etiqueta={`Entrar solo a las ofertas relámpago de ${canal.nombre} (hasta ${RELAMPAGO_AUTO_PCT} % debajo del precio del esquema para su tipo de publicación, con todas las unidades)`}
            ayuda={canal.relampagoAuto
              ? `Prendido: cada 10 minutos Laucen entra solo a las propuestas de esta cuenta cuyo precio de «Entraría a» no baja más de ${RELAMPAGO_AUTO_PCT} % el precio del esquema (columna «Esquema») y que alcanzan el piso (si tiene), con todas las unidades disponibles hasta el máximo que acepta la oferta. Tiene prioridad sobre las otras campañas. Las que entrarían ahora: ${todas.filter((f) => f.canal_id === canal.id && entraSola(f)).length}.`
              : "Apagado: a las ofertas relámpago se entra sólo con «Entrar» o con «Preparar las que alcanzan el piso»."} />
          <Interruptor accion={accionInterruptor} prendido={canal.compartidasAuto} campos={{ canal: String(canal.id), clave: "compartidas_auto", volver: aqui() }}
            etiqueta={`Entrar solo a las ofertas compartidas de ${canal.nombre} (lo que ponés vos, hasta ${RELAMPAGO_AUTO_PCT} % debajo del precio del esquema)`}
            ayuda={canal.compartidasAuto
              ? `Prendido: cada 10 minutos Laucen acepta solo las relámpago compartidas y las ofertas compartidas («Potencia tus ventas», «Tec Week»…) de esta cuenta en las que lo que ponés vos no baja más de ${RELAMPAGO_AUTO_PCT} % el precio del esquema y alcanzan el piso (si tiene). Las relámpago, una por producto; las otras, una por publicación (la que menos te cuesta). Las que entrarían ahora: ${todas.filter((f) => f.canal_id === canal.id && esCompartida(f.tipo_promo) && entraSola(f)).length}.`
              : "Apagado: a las ofertas compartidas se entra sólo con «Entrar»."} />
        </div>
      )}
      {canal && <BarraPml org={s.org.id} canales={canales} canal={canal} ver="relampago" todas={todasCuentas} derecha={<>
        <CasillaViva parametro="aceptadas" activo={soloAceptadas} etiqueta="Sólo aceptadas" />
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por SKU, producto o publicación" limpiar={["editar"]} />
        <span className="text-[11px] text-[#5C6B76]">{filas.length} de {todas.length}</span>
      </>} />}
      {/* Entrar de una a todas las que bajan hasta X % (una por producto, con todas las unidades). */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#5C6B76]">
        <span>Entrar a todas las que bajan hasta</span>
        <FiltroVivo parametro="hasta" valor={String(hastaPct)} etiqueta="Baja máxima">
          {PCTS.map((x) => <option key={x} value={x}>{x} %</option>)}
        </FiltroVivo>
        <BotonPreguntar grupo="hasta" clase={VERDE} texto={`Entrar a ${nHasta}`} corriendo="Mandando…"
          campos={{ canal: todasCuentas ? "" : String(canal?.id ?? ""), pct: String(hastaPct), volver: aqui() }}
          pregunta={`¿Entrar a ${nHasta} ofertas relámpago${todasCuentas ? " (todas las cuentas)" : ` de ${canal?.nombre ?? ""}`} que bajan ${hastaPct} % o menos el precio del esquema? Una sola publicación por producto (al azar entre sus publicaciones y cuentas), con todas las unidades disponibles. El día y la hora los fija Mercado Libre; una vez activa no se puede borrar.`} />
        <span>· una por producto, con todas las unidades</span>
      </div>
      <PreguntaArriba accion={accionEntrarRelampagosHasta} grupo="hasta" />
      {/* La confirmación de «Entrar» (y de «Preparar…») se abre acá, arriba de la tabla, sin desarmar la fila. */}
      <PreguntaArriba accion={accionEntrarRelampago} />
      <PreguntaArriba accion={accionPrepararRelampagos} grupo="preparar" />
      {/* Con alto propio: la barra para correr de costado queda a la vista y los títulos quedan fijos arriba. */}
      <div className={`${CAJA_TABLA} mb-2 max-h-[70vh] overflow-auto`}>
        <table className="text-xs min-w-max">
          <thead className={`${THEAD} sticky top-0 z-10`}>
            <tr>
              <th className={TH}>Entrar</th><ThOrden col="oferta" className={TH}>Oferta</ThOrden><ThOrden col="sku" className={TH}>SKU</ThOrden><ThOrden col="producto" className={TH}>Producto</ThOrden><ThOrden col="cuenta" className={TH}>Cuenta</ThOrden><th className={TH}>Publicación</th><ThOrden col="plan" className={TH}>Plan</ThOrden><ThOrden col="estado" className={TH}>Estado</ThOrden>
              <ThOrden col="cuando" className={TH}>Cuándo</ThOrden><ThOrden col="stock" n className={THN}>Stock<br />tenés</ThOrden><ThOrden col="entra" n className={THN}>Entra<br />con</ThOrden><ThOrden col="hoy" n className={THN}>Hoy<br />paga</ThOrden><ThOrden col="recibis" n className={THN}>Hoy<br />recibís</ThOrden><ThOrden col="costo" n className={THN}>Costo<br />hoy</ThOrden>
              <th className={THN}>Rango<br />de ML</th><ThOrden col="base" n className={THN} title="El precio del esquema para esta publicación: la base para medir cuánto baja">Esquema</ThOrden><ThOrden col="rel" n className={THN}>Entraría<br />a</ThOrden><ThOrden col="baja" n desc={false} className={THN} title="Cuánto más barato que el precio del esquema entra">Baja<br />%</ThOrden><ThOrden col="recibiras" n className={THN}>Recibirás</ThOrden><ThOrden col="costorel" n className={THN}>Costo<br />relámpago</ThOrden>
              <ThOrden col="dif" n className={THN}>Diferencia</ThOrden><ThOrden col="difpct" n desc={false} className={THN}>Diferencia<br />%</ThOrden><ThOrden col="piso" n className={THN}>Piso</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={23} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna coincide con la búsqueda." : "Mercado Libre no te propone ninguna oferta relámpago en esta cuenta ahora."}</td></tr>}
            {filas.map((f) => {
              const color = f.alcanza === true && f.conStock !== false ? "text-[#1E7B3A]" : f.alcanza === false || f.conStock === false ? "text-[#C03420]" : "";
              const difPct = f.costoRelPct != null && f.costoHoyPct != null ? Math.round((f.costoRelPct - f.costoHoyPct) * 10) / 10 : null;
              const edita = editar === `${f.canal_id}-${f.item_id}-${f.promocion_id}`;
              const compartida = esCompartida(f.tipo_promo);
              const idForm = `fila-${f.canal_id}-${f.item_id}-${f.promocion_id}`;
              return (
                <tr key={`${f.canal_id}-${f.item_id}-${f.promocion_id}`} className={TR} data-canal={f.canal_id}>
                  <td className={`${TD} whitespace-nowrap`}>
                    {(() => {
                      const e = envios.get(claveCola(f));
                      if (f.estado !== "candidate") return <span className="text-[11px] text-[#1E7B3A]">Adentro</span>;
                      if (e?.estado === "pendiente" || e?.estado === "enviando") return <span className="text-[11px] text-[#5C6B76]">Mandándose…</span>;
                      if (e?.estado === "preparado") return <span className="text-[11px] text-[#5C6B76]">En un lote</span>;
                      if (e?.estado === "ok") return <span className="text-[11px] text-[#1E7B3A]">Aceptada</span>;
                      const boton = f.rel != null && f.stockEntrar != null && f.conStock !== false
                        ? <BotonPreguntar clase={VERDE} texto="Entrar" corriendo="Mandando…" campos={{ canal: String(f.canal_id), item: f.item_id, promo: f.promocion_id, volver: aqui() }}
                            pregunta={`¿Entrar a ${compartida ? `la ${OFERTA(f).toLowerCase()}` : "la oferta relámpago"} ${f.item_id} (${f.sku}, ${f.cuenta})? El comprador paga ${pesos(f.rel)}${compartida ? ` (ponés ${pct(f.pct_vendedor)}, Mercado Libre ${pct(f.pct_meli)})` : ""}${f.tipo_promo === "SMART" ? "" : ` con ${f.stockEntrar} unidades`}. Recibirás ${pesos(f.recibisRel)} por venta (hoy ${pesos(f.recibisHoy)}). El día y la hora los fija Mercado Libre. Una vez activa no se puede borrar.`} />
                        : <span className="text-[11px] text-[#C03420]">{f.rel == null ? "No entra" : "Sin stock"}</span>;
                      return <>{boton}{e?.estado === "error" && <span className="block text-[10px] text-[#C03420] max-w-[180px] whitespace-normal" title={e.error ?? ""}>La rechazó: {(e.error ?? "").slice(0, 80)}</span>}</>;
                    })()}
                  </td>
                  <td className={`${TD} text-[11px] whitespace-nowrap`}>{OFERTA(f)}</td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <FotosProducto fotos={fotos.get(f.producto_id) ?? null} titulo={f.titulo} />
                      <Link href={`/catalogo/productos/${f.producto_id}`} className="text-[#16577F] hover:underline">{f.sku}</Link>
                    </span>
                  </td>
                  <td className={TD}><span className="line-clamp-2 block w-[170px] text-[11px] leading-tight" title={f.titulo}>{f.titulo}</span></td>
                  <td className={`${TD} whitespace-nowrap text-[11px]`}>{f.cuenta}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <Link href={historialPublicacion(f.item_id)} className="font-mono text-[#16577F] hover:underline">{f.item_id}</Link>{" "}
                    <a href={enlaceMl(f.item_id)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[11px]`}>{f.plan ? PLAN_INFO[f.plan].nombre : "—"}</td>
                  <td className={`${TD} text-[11px]`}>{ESTADO[f.estado] ?? f.estado}</td>
                  <td className={`${TD} whitespace-nowrap text-[11px] ${f.desde ? "" : "text-[#5C6B76]"}`}>{cuando(f)}</td>
                  <td className={TDN}>{f.stock ?? "—"}</td>
                  <td className={`${TDN} ${f.conStock === false ? "text-[#C03420]" : ""}`}>
                    {edita && f.estado === "candidate"
                      ? <CampoNumero name="stock" form={idForm} valor={f.elegido_stock} tipo="entero" placeholder={String(f.stock_min ?? "")} className="w-14" />
                      : <b>{f.stockEntrar ?? "—"}</b>}
                    {f.estado === "candidate" && <span className="block text-[10px] text-[#5C6B76]">pide {f.stock_min ?? "?"}–{f.stock_max ?? "?"}</span>}
                  </td>
                  <td className={TDN}>{pesos(f.hoy)}</td>
                  <td className={TDN}>{pesos(f.recibisHoy)}{f.aporte ? <span className="block text-[10px] text-[#5C6B76]" title="Lo que pone Mercado Libre en la campaña de hoy; en la relámpago no lo pone.">con {pesos(f.aporte)} de ML</span> : null}</td>
                  <td className={TDN}>{pct(f.costoHoyPct)}</td>
                  <td className={`${TDN} text-[11px] text-[#5C6B76]`}>{compartida
                    ? <>ponés {pct(f.pct_vendedor)}<br />ML {pct(f.pct_meli)}</>
                    : <>{pesos(f.min)} a<br />{pesos(f.max)}</>}</td>
                  <td className={TDN}>{pesos(f.base)}</td>
                  <td className={TDN}>
                    {edita && f.estado === "candidate" && !compartida
                      ? <CampoNumero name="precio" form={idForm} valor={f.elegido} tipo="pesos" placeholder={f.rel == null ? "" : formatear(f.rel, "ARS")} className="w-28" />
                      : <><b>{f.rel == null ? "no entra" : pesos(f.rel)}</b>{f.elegido != null && <span className="block text-[10px] text-[#5C6B76]">a mano</span>}</>}
                  </td>
                  <td className={`${TDN} ${f.bajaPct != null && f.bajaPct <= 5 ? "text-[#1E7B3A]" : ""}`}>{pct(f.bajaPct)}</td>
                  <td className={`${TDN} ${color}`}><b>{pesos(f.recibisRel)}</b></td>
                  <td className={TDN}>{pct(f.costoRelPct)}</td>
                  <td className={`${TDN} ${f.diferencia != null && f.diferencia < 0 ? "text-[#C03420]" : ""}`}>{f.diferencia == null ? "—" : `${f.diferencia > 0 ? "+" : ""}${formatear(f.diferencia, "ARS")}`}</td>
                  <td className={`${TDN} ${difPct != null && difPct > 0 ? "text-[#C03420]" : ""}`}>{pct(difPct, true)}</td>
                  <td className={TDN}>
                    {edita ? <CampoNumero name="piso" form={idForm} valor={f.piso} tipo="pesos" className="w-28" /> : pesos(f.piso)}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {edita ? (
                      <form id={idForm} action={accionGuardarFilaRelampago} className="inline-flex items-center gap-1">
                        <input type="hidden" name="canal" value={f.canal_id} />
                        <input type="hidden" name="item" value={f.item_id} />
                        <input type="hidden" name="promo" value={f.promocion_id} />
                        <input type="hidden" name="volver" value={aqui()} />
                        <button className={VERDE}>Grabar</button>
                        <Link href={aqui()} className={SUAVE}>Cancelar</Link>
                      </form>
                    ) : <Lapiz href={aqui({ editar: `${f.canal_id}-${f.item_id}-${f.promocion_id}` })} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76]">
        <b>Recibís / Recibirás</b> = lo que paga el comprador, menos la comisión de Mercado Libre a ese precio (con el cargo fijo) y lo que te cobra por el envío gratis (desde el precio de envío gratis); «—» mientras se leen los costos (cada media hora).
        <b> Costo hoy</b>: qué parte de lo que paga hoy el comprador se lleva Mercado Libre (comisión y envío). <b>Costo relámpago</b>: qué parte de ese mismo precio de hoy no te llega si vendés en la oferta (el descuento más la comisión y el envío). <b>Diferencia %</b>: cuántos puntos más te cuesta cada venta en la oferta.
        <b> Rango de ML</b>: el precio más bajo y el más alto que acepta la propuesta; Mercado Libre lo calcula sobre el precio publicado (el tachado).
        <b> Entraría a</b>: un peso debajo de lo que paga hoy el comprador, sin pasar el más alto del rango; si Mercado Libre lo rechaza por «no creíble», el precio que propone para la relámpago (en general 5 % debajo de hoy).
        <b> Esquema</b>: lo que vale esa publicación según el esquema de precios: en una Clásica, la Clásica de la lista; en un plan de cuotas (Premium, 3, 9 o 12 cuotas), el precio del plan que sale de esa Clásica con la comisión del plan y el % extra del grupo. <b>Baja %</b>: cuánto más barato que el precio del esquema entra (negativo: entra más caro); nunca contra lo que paga hoy el comprador, que en la cuenta que no gana va más caro. <b>«Entrar a todas las que bajan hasta X %»</b>: con un clic entra a las que bajan eso o menos, alcanzan el piso y tienen el stock que piden; una sola publicación por producto (al azar entre sus publicaciones y cuentas; se saltea un producto que ya tiene una relámpago), con todas las unidades disponibles. Los títulos se tocan para ordenar.
        <b> Oferta</b>: «Relámpago» (el precio lo elegís vos dentro del rango), «Relámpago compartida» y «Compartida» («Potencia tus ventas», «Tec Week»…): en las compartidas el precio lo pone Mercado Libre y el descuento se reparte; en «Rango de ML» dice qué parte ponés vos y qué parte pone Mercado Libre, sobre tu precio publicado. En ellas, «Baja %» mide lo que ponés vos (tu precio publicado menos tu parte) contra el precio del esquema, y «Recibirás» suma lo que pone Mercado Libre.
        <b> Cuándo</b>: el día y la hora los fija Mercado Libre recién cuando aceptás; no se eligen.
        <b> Stock tenés</b>: el disponible de la publicación. <b>Entra con</b>: las unidades que se comprometen (de entrada, el mínimo que pide la propuesta; abajo, el mínimo y el máximo que acepta); en una aceptada, las que le quedan a la oferta.
        <b> Piso</b>: lo mínimo que aceptás recibir por una venta de ese producto (vale para todas las cuentas). En verde, las que lo alcanzan y tienen el stock; en rojo, las que no.
        <b> Lápiz</b> (a la derecha): cambiás en la fila el precio de entrada, las unidades y el piso, y apretás «Grabar»; un precio o unidades vacíos vuelven a lo sugerido.
        <b> Entrar</b> (primera columna): la pregunta se abre arriba de la tabla; con «Sí», la publicación entra a la oferta al precio de «Entraría a» con las unidades de «Entra con»; sale a Mercado Libre en un par de minutos y la columna pasa a «Aceptada» (o dice por qué la rechazó).
        «Preparar las que alcanzan el piso» arma un lote por cuenta: sale a Mercado Libre con tu clic en «Mandar a Mercado Libre». Una oferta relámpago aceptada no se puede borrar, y mientras dura, Laucen no le toca el precio ni las campañas a esa publicación.
      </p>
    </Pantalla>
  );
}
