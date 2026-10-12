// Precios en ML › Ofertas relámpago (Fer, 12/10): las propuestas de oferta relámpago de Mercado Libre de todas las
// cuentas, con cuánto se recibe en la oferta contra hoy, el piso por producto (lápiz en la fila) y el lote para entrar
// (lib/precios-ml/relampago.ts).

import Link from "next/link";
import CampoNumero from "@/app/componentes/CampoNumero";
import FotosProducto from "@/app/componentes/FotosProducto";
import { BotonConfirmar } from "@/app/radar/Cliente";
import { VERDE, SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Lapiz, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { relampagos, enviosRelampago, BAJA_RELAMPAGO_PCT } from "@/lib/precios-ml/relampago";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import { PLAN_INFO } from "@/lib/precios-ml/motor";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { accionEntrarRelampago, accionGuardarPiso, accionPrepararRelampagos } from "./acciones";
import { BarraPml } from "../comun";
import { RELAMPAGO_PML, canalElegido } from "../lista";

export const dynamic = "force-dynamic";

type SP = { canal?: string; editar?: string; q?: string; contiene?: string; ok?: string; error?: string };

const pesos = (v: number | null | undefined) => (v == null ? "—" : formatear(v, "ARS"));
const fecha = (t: string | null) => (t ? new Date(t).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" }) : null);
const ESTADO: Record<string, string> = { candidate: "Propuesta", pending: "Aceptada (programada)", started: "En curso" };

export default async function Relampago({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ml_ver");
  const sp = await searchParams;
  const { canales, canal } = await canalElegido(s.org.id, sp);
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const palabras = norm(q).split(/\s+/).filter(Boolean);
  // Buscar por SKU, título o número de publicación (todas las palabras; «Comienza por»: al principio de una palabra).
  const coincide = (t: string) => palabras.every((p) => comienza ? norm(t).split(/[\s\-/]+/).some((w) => w.startsWith(p)) : norm(t).includes(p));
  const todas = await relampagos(s.org.id, canal?.id ?? null);
  const filas = q ? todas.filter((f) => coincide(`${f.sku} ${f.titulo} ${f.item_id}`)) : todas;
  const envios = await enviosRelampago(s.org.id);
  const editar = Number(sp.editar) || 0;
  const productos = [...new Set(filas.map((f) => f.producto_id))];
  const fotos = new Map((productos.length ? await consulta<{ producto_id: number; fotos: string[] }>(
    "select producto_id::int, array_agg(url order by orden) fotos from producto_foto where producto_id = any($1::bigint[]) group by producto_id", [productos]) : [])
    .map((x) => [x.producto_id, x.fotos]));
  const listas = filas.filter((f) => f.estado === "candidate" && f.alcanza === true && f.conStock !== false).length;
  const aqui = (extra: Record<string, unknown> = {}) => url(RELAMPAGO_PML, { canal: canal?.id, q: q || null, contiene: comienza ? null : "1", ...extra });
  return (
    <Pantalla titulo="Precios en Mercado Libre" ancho="max-w-[1500px]"
      subtitulo="Ofertas relámpago: las que te propone Mercado Libre en la cuenta elegida, con cuánto recibís en la oferta contra lo que recibís hoy."
      acciones={<BotonConfirmar accion={accionPrepararRelampagos} campos={{ canal: String(canal?.id ?? "") }} clase={VERDE}
        texto={`Preparar las que alcanzan el piso (${listas})`} corriendo="Preparando…"
        pregunta="¿Preparar el lote para entrar a las ofertas que alcanzan el piso y tienen el stock que piden? Sale a Mercado Libre recién con tu clic en «Mandar a Mercado Libre». Una oferta relámpago aceptada no se puede borrar." />}>
      <Avisos sp={sp} />
      {canal && <BarraPml org={s.org.id} canales={canales} canal={canal} ver="relampago" />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por SKU, producto o publicación" limpiar={["editar"]} />
        <span className="text-[11px] text-[#5C6B76]">{filas.length} de {todas.length}</span>
      </div>
      {/* Con alto propio: la barra para correr de costado queda a la vista y los títulos quedan fijos arriba. */}
      <div className={`${CAJA_TABLA} mb-2 max-h-[70vh] overflow-auto`}>
        <table className={`${TABLA} min-w-max`}>
          <thead className={`${THEAD} sticky top-0 z-10`}>
            <tr>
              <th className={TH}>Entrar</th><th className={TH}>SKU</th><th className={TH}>Producto</th><th className={TH}>Cuenta</th><th className={TH}>Publicación</th><th className={TH}>Plan</th><th className={TH}>Estado</th>
              <th className={THN}>Stock (pide)</th><th className={THN}>Hoy paga</th><th className={THN}>Hoy recibís</th>
              <th className={THN}>Rango de ML</th><th className={THN}>Entraría a</th><th className={THN}>Recibís en relámpago</th><th className={THN}>Diferencia</th><th className={THN}>Piso</th><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={16} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna coincide con la búsqueda." : "Mercado Libre no te propone ninguna oferta relámpago en esta cuenta ahora."}</td></tr>}
            {filas.map((f) => {
              const color = f.alcanza === true && f.conStock !== false ? "text-[#1E7B3A]" : f.alcanza === false || f.conStock === false ? "text-[#C03420]" : "";
              return (
                <tr key={`${f.canal_id}-${f.item_id}`} className={TR} data-canal={f.canal_id}>
                  <td className={`${TD} whitespace-nowrap`}>
                    {(() => {
                      const e = envios.get(f.item_id);
                      if (f.estado !== "candidate") return <span className="text-[11px] text-[#1E7B3A]">Adentro</span>;
                      if (e?.estado === "pendiente" || e?.estado === "enviando") return <span className="text-[11px] text-[#5C6B76]">Mandándose…</span>;
                      if (e?.estado === "preparado") return <span className="text-[11px] text-[#5C6B76]">En un lote</span>;
                      if (e?.estado === "ok") return <span className="text-[11px] text-[#1E7B3A]">Aceptada</span>;
                      const boton = f.rel != null && f.stock_min != null && f.conStock !== false
                        ? <BotonConfirmar accion={accionEntrarRelampago} campos={{ canal: String(f.canal_id), item: f.item_id, volver: aqui() }} clase={VERDE} texto="Entrar" corriendo="Mandando…"
                            pregunta={`¿Entrar a la oferta relámpago ${f.item_id} (${f.sku}, ${f.cuenta}) a ${pesos(f.rel)} con ${f.stock_min} unidades? Recibís ${pesos(f.recibisRel)} por venta (hoy ${pesos(f.recibisHoy)}). Una vez activa no se puede borrar.`} />
                        : <span className="text-[11px] text-[#C03420]">{f.rel == null ? "No entra" : "Sin stock"}</span>;
                      return <>{boton}{e?.estado === "error" && <span className="block text-[10px] text-[#C03420] max-w-[180px] whitespace-normal" title={e.error ?? ""}>La rechazó: {(e.error ?? "").slice(0, 80)}</span>}</>;
                    })()}
                  </td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <FotosProducto fotos={fotos.get(f.producto_id) ?? null} titulo={f.titulo} />
                      <Link href={`/catalogo/productos/${f.producto_id}`} className="text-[#16577F] hover:underline">{f.sku}</Link>
                    </span>
                  </td>
                  <td className={TD}><span className="line-clamp-2 block w-[180px] text-[11px] leading-tight" title={f.titulo}>{f.titulo}</span></td>
                  <td className={`${TD} whitespace-nowrap text-[11px]`}>{f.cuenta}</td>
                  <td className={TD}>
                    <Link href={historialPublicacion(f.item_id)} className="font-mono text-[#16577F] hover:underline">{f.item_id}</Link>{" "}
                    <a href={enlaceMl(f.item_id)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[11px]`}>{f.plan ? PLAN_INFO[f.plan].nombre : "—"}</td>
                  <td className={`${TD} text-[11px]`}>{ESTADO[f.estado] ?? f.estado}{f.desde || f.hasta ? <span className="block text-[#5C6B76]">{[fecha(f.desde), fecha(f.hasta)].filter(Boolean).join(" → ")}</span> : null}</td>
                  <td className={`${TDN} ${f.conStock === false ? "text-[#C03420]" : ""}`}>{f.stock ?? "—"} ({f.stock_min ?? "?"}–{f.stock_max ?? "?"})</td>
                  <td className={TDN}>{pesos(f.hoy)}</td>
                  <td className={TDN}>{pesos(f.recibisHoy)}</td>
                  <td className={`${TDN} text-[11px] text-[#5C6B76]`}>{pesos(f.min)} a {pesos(f.max)}</td>
                  <td className={TDN}><b>{f.rel == null ? "no entra" : pesos(f.rel)}</b></td>
                  <td className={`${TDN} ${color}`}><b>{pesos(f.recibisRel)}</b></td>
                  <td className={`${TDN} ${f.diferencia != null && f.diferencia < 0 ? "text-[#C03420]" : ""}`}>{f.diferencia == null ? "—" : `${f.diferencia > 0 ? "+" : ""}${formatear(f.diferencia, "ARS")}`}</td>
                  {editar === f.producto_id ? (
                    <td className={TDN} colSpan={2}>
                      <form action={accionGuardarPiso} className="inline-flex items-center gap-1">
                        <input type="hidden" name="producto" value={f.producto_id} />
                        <input type="hidden" name="canal" value={String(canal?.id ?? "")} />
                        <CampoNumero name="piso" valor={f.piso} tipo="pesos" className="w-28" />
                        <button className={VERDE}>Grabar</button>
                        <Link href={aqui()} className={SUAVE}>Cancelar</Link>
                      </form>
                    </td>
                  ) : (<>
                    <td className={TDN}>{pesos(f.piso)}</td>
                    <td className={`${TD} text-right`}><Lapiz href={aqui({ editar: f.producto_id })} /></td>
                  </>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76]">
        <b>Recibís</b> = lo que paga el comprador, menos la comisión de Mercado Libre a ese precio (con el cargo fijo) y lo que te cobra por el envío gratis (desde el precio de envío gratis); «—» mientras se leen los costos (cada media hora).
        <b> Rango de ML</b>: el precio más bajo y el más alto que acepta la propuesta; Mercado Libre lo calcula sobre el precio publicado (el tachado), por eso el más alto suele quedar arriba de lo que paga hoy el comprador.
        <b> Entraría a</b>: el más alto del rango, pero siempre al menos {BAJA_RELAMPAGO_PCT} % más barato que lo que paga hoy el comprador (una oferta tiene que ser más barata que hoy); «no entra» si eso queda debajo del más bajo del rango.
        Por eso <b>Recibís en relámpago</b> es menos que hoy: la <b>Diferencia</b> es lo que cuesta cada venta en la oferta (Mercado Libre puede sumar un descuento propio para el comprador, que no sale de lo tuyo). <b>Stock</b>: el que tenés, y entre paréntesis lo que pide la propuesta (mínimo–máximo); se entra con el mínimo.
        <b> Piso</b>: lo mínimo que aceptás recibir por una venta de ese producto (lápiz). En verde, las que lo alcanzan y tienen el stock; en rojo, las que no.
        <b>Entrar</b> (primera columna): con tu clic y una confirmación, la publicación entra a la oferta al precio de «Entraría a» con el stock mínimo; sale a Mercado Libre en un par de minutos y la columna pasa a «Aceptada» (o dice por qué la rechazó).
        «Preparar las que alcanzan el piso» arma un lote por cuenta: sale a Mercado Libre con tu clic en «Mandar a Mercado Libre». Una oferta relámpago aceptada no se puede borrar, y mientras dura, Laucen no le toca el precio ni las campañas a esa publicación.
      </p>
    </Pantalla>
  );
}
