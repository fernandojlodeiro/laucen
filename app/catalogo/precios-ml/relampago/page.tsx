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
import { relampagos, enviosRelampago, fechaRelampago, type Relampago } from "@/lib/precios-ml/relampago";
import BuscadorVivo, { CasillaViva } from "@/app/componentes/BuscadorVivo";
import { PLAN_INFO } from "@/lib/precios-ml/motor";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { accionEntrarRelampago, accionGuardarFilaRelampago, accionPrepararRelampagos } from "./acciones";
import { BarraPml } from "../comun";
import { RELAMPAGO_PML, canalElegido } from "../lista";

export const dynamic = "force-dynamic";

type SP = { canal?: string; editar?: string; q?: string; contiene?: string; todas?: string; aceptadas?: string; ok?: string; error?: string };

// Columnas apretadas (Fer, 12/10): la tabla no se estira al ancho de la pantalla y los títulos largos van en dos renglones.
const TH = "py-1.5 px-1.5 text-left font-semibold leading-tight align-bottom";
const THN = `${TH} text-right`;
const TD = "py-1 px-1.5";
const TDN = "py-1 px-1.5 text-right whitespace-nowrap tabular-nums";

const pesos = (v: number | null | undefined) => (v == null ? "—" : formatear(v, "ARS"));
const pct = (v: number | null | undefined, signo = false) =>
  v == null ? "—" : `${signo && v > 0 ? "+" : ""}${v.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const ESTADO: Record<string, string> = { candidate: "Propuesta", pending: "Aceptada (programada)", started: "En curso" };

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
  const envios = await enviosRelampago(s.org.id);
  const editar = sp.editar ?? "";
  const productos = [...new Set(filas.map((f) => f.producto_id))];
  const fotos = new Map((productos.length ? await consulta<{ producto_id: number; fotos: string[] }>(
    "select producto_id::int, array_agg(url order by orden) fotos from producto_foto where producto_id = any($1::bigint[]) group by producto_id", [productos]) : [])
    .map((x) => [x.producto_id, x.fotos]));
  const listas = filas.filter((f) => f.estado === "candidate" && f.alcanza === true && f.conStock !== false).length;
  const aqui = (extra: Record<string, unknown> = {}) => url(RELAMPAGO_PML, {
    canal: canal?.id, q: q || null, contiene: comienza ? null : "1", todas: todasCuentas ? "1" : null, aceptadas: soloAceptadas ? "1" : null, ...extra });
  return (
    <Pantalla titulo="Precios en Mercado Libre" ancho="max-w-[1500px]"
      subtitulo="Ofertas relámpago: las que te propone Mercado Libre en la cuenta elegida, con cuánto recibís en la oferta contra lo que recibís hoy."
      acciones={<BotonPreguntar grupo="preparar" clase={VERDE} texto={`Preparar las que alcanzan el piso (${listas})`} corriendo="Preparando…"
        campos={{ canal: todasCuentas ? "" : String(canal?.id ?? ""), volver: aqui() }}
        pregunta="¿Preparar el lote para entrar a las ofertas que alcanzan el piso y tienen el stock que piden? Sale a Mercado Libre recién con tu clic en «Mandar a Mercado Libre». Una oferta relámpago aceptada no se puede borrar." />}>
      <Avisos sp={sp} />
      {canal && <BarraPml org={s.org.id} canales={canales} canal={canal} ver="relampago" todas={todasCuentas} derecha={<>
        <CasillaViva parametro="aceptadas" activo={soloAceptadas} etiqueta="Sólo aceptadas" />
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por SKU, producto o publicación" limpiar={["editar"]} />
        <span className="text-[11px] text-[#5C6B76]">{filas.length} de {todas.length}</span>
      </>} />}
      {/* La confirmación de «Entrar» (y de «Preparar…») se abre acá, arriba de la tabla, sin desarmar la fila. */}
      <PreguntaArriba accion={accionEntrarRelampago} />
      <PreguntaArriba accion={accionPrepararRelampagos} grupo="preparar" />
      {/* Con alto propio: la barra para correr de costado queda a la vista y los títulos quedan fijos arriba. */}
      <div className={`${CAJA_TABLA} mb-2 max-h-[70vh] overflow-auto`}>
        <table className="text-xs min-w-max">
          <thead className={`${THEAD} sticky top-0 z-10`}>
            <tr>
              <th className={TH}>Entrar</th><th className={TH}>SKU</th><th className={TH}>Producto</th><th className={TH}>Cuenta</th><th className={TH}>Publicación</th><th className={TH}>Plan</th><th className={TH}>Estado</th>
              <th className={TH}>Cuándo</th><th className={THN}>Stock<br />tenés</th><th className={THN}>Entra<br />con</th><th className={THN}>Hoy<br />paga</th><th className={THN}>Hoy<br />recibís</th><th className={THN}>Costo<br />hoy</th>
              <th className={THN}>Rango<br />de ML</th><th className={THN}>Entraría<br />a</th><th className={THN}>Recibirás</th><th className={THN}>Costo<br />relámpago</th>
              <th className={THN}>Diferencia</th><th className={THN}>Diferencia<br />%</th><th className={THN}>Piso</th><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={20} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna coincide con la búsqueda." : "Mercado Libre no te propone ninguna oferta relámpago en esta cuenta ahora."}</td></tr>}
            {filas.map((f) => {
              const color = f.alcanza === true && f.conStock !== false ? "text-[#1E7B3A]" : f.alcanza === false || f.conStock === false ? "text-[#C03420]" : "";
              const difPct = f.costoRelPct != null && f.costoHoyPct != null ? Math.round((f.costoRelPct - f.costoHoyPct) * 10) / 10 : null;
              const edita = editar === `${f.canal_id}-${f.item_id}`;
              const idForm = `fila-${f.canal_id}-${f.item_id}`;
              return (
                <tr key={`${f.canal_id}-${f.item_id}`} className={TR} data-canal={f.canal_id}>
                  <td className={`${TD} whitespace-nowrap`}>
                    {(() => {
                      const e = envios.get(f.item_id);
                      if (f.estado !== "candidate") return <span className="text-[11px] text-[#1E7B3A]">Adentro</span>;
                      if (e?.estado === "pendiente" || e?.estado === "enviando") return <span className="text-[11px] text-[#5C6B76]">Mandándose…</span>;
                      if (e?.estado === "preparado") return <span className="text-[11px] text-[#5C6B76]">En un lote</span>;
                      if (e?.estado === "ok") return <span className="text-[11px] text-[#1E7B3A]">Aceptada</span>;
                      const boton = f.rel != null && f.stockEntrar != null && f.conStock !== false
                        ? <BotonPreguntar clase={VERDE} texto="Entrar" corriendo="Mandando…" campos={{ canal: String(f.canal_id), item: f.item_id, volver: aqui() }}
                            pregunta={`¿Entrar a la oferta relámpago ${f.item_id} (${f.sku}, ${f.cuenta}) a ${pesos(f.rel)} con ${f.stockEntrar} unidades? Recibirás ${pesos(f.recibisRel)} por venta (hoy ${pesos(f.recibisHoy)}). El día y la hora los fija Mercado Libre. Una vez activa no se puede borrar.`} />
                        : <span className="text-[11px] text-[#C03420]">{f.rel == null ? "No entra" : "Sin stock"}</span>;
                      return <>{boton}{e?.estado === "error" && <span className="block text-[10px] text-[#C03420] max-w-[180px] whitespace-normal" title={e.error ?? ""}>La rechazó: {(e.error ?? "").slice(0, 80)}</span>}</>;
                    })()}
                  </td>
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
                  <td className={TDN}>{pesos(f.recibisHoy)}</td>
                  <td className={TDN}>{pct(f.costoHoyPct)}</td>
                  <td className={`${TDN} text-[11px] text-[#5C6B76]`}>{pesos(f.min)} a<br />{pesos(f.max)}</td>
                  <td className={TDN}>
                    {edita && f.estado === "candidate"
                      ? <CampoNumero name="precio" form={idForm} valor={f.elegido} tipo="pesos" placeholder={f.rel == null ? "" : formatear(f.rel, "ARS")} className="w-28" />
                      : <><b>{f.rel == null ? "no entra" : pesos(f.rel)}</b>{f.elegido != null && <span className="block text-[10px] text-[#5C6B76]">a mano</span>}</>}
                  </td>
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
                        <input type="hidden" name="volver" value={aqui()} />
                        <button className={VERDE}>Grabar</button>
                        <Link href={aqui()} className={SUAVE}>Cancelar</Link>
                      </form>
                    ) : <Lapiz href={aqui({ editar: `${f.canal_id}-${f.item_id}` })} />}
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
        <b> Entraría a</b>: lo que paga hoy el comprador si entra en el rango (no hace falta bajarlo); si no, el más alto del rango.
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
