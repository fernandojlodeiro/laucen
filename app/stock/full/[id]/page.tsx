// Ficha de un envío a Full (lib/full/envios.ts). Borrador: se suman productos (buscador o «Agregar
// sugeridos»), se cambian cantidades y se imprimen las etiquetas; «Despachar» pasa las unidades a
// «En camino a Full». En camino: la lectura de Full lo recibe sola (o «Recibir» a mano por línea) y
// «Cerrar el envío» decide qué pasa con lo que no llegó. El flete (monto o factura de gasto) se
// carga en cualquier momento y se reparte entre las líneas.

import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { consulta } from "@/lib/erp/base";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { camposVariacionYProducto } from "@/app/catalogo/busqueda";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { BotonConfirmar, BotonEnviar, TachoConfirmar } from "@/app/radar/Cliente";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import CampoNumero from "@/app/componentes/CampoNumero";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import FotosProducto from "@/app/componentes/FotosProducto";
import {
  entrarErp, Pantalla, Avisos, Estado, Dato, Lapiz, BotonesFicha, TituloSeccion, editandoFicha, url,
  CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { formatear } from "@/lib/moneda";
import { formatearNumero, ANCHO_NUMERO } from "@/lib/numeros";
import { fechaHora } from "@/app/ventas/formato";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { MarcaCatalogo, textoPlan } from "@/app/catalogo/publicaciones/lista";
import { COOKIE_IMPRESORA_FULL, esImpresoraFull } from "@/lib/deposito/etiquetas-full-tipos";
import { SQL_CODIGO } from "@/lib/deposito/etiquetas-full";
import {
  envio as leerEnvio, contexto, lineasReparto, sugeridos as calcularSugeridos, publicacionesDe, repartirFlete, facturasParaFlete,
  ESTADOS_ENVIO, CRITERIOS_FLETE, SUGERENCIA_DEFECTO,
} from "@/lib/full/envios";
import { diaAR } from "../piezas";
import {
  accionGuardarEnvio, accionGuardarFlete, accionBorrarEnvio, accionAgregarLinea, accionCantidadLinea, accionBorrarLinea,
  accionAgregarTildados, accionVaciarEnvio, accionDespachar, accionRecibirAMano, accionCerrarEnvio, accionLeerFull,
} from "../acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string; editar?: string; recibir?: string; q?: string; contiene?: string; sugeridos?: string; df?: string; dd?: string; dv?: string };
type Linea = {
  id: number; variacion_id: number; producto_id: number; sku: string; titulo: string; fotos: string[] | null; item_id: string | null; variation_id: string;
  codigo: string | null; cantidad: number; recibido: number; faltante: number; flete_unit_ars: number | null;
};

export default async function FichaEnvioFull({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("full_ver");
  const sp = await searchParams;
  const eid = Number((await params).id);
  if (!Number.isInteger(eid) || eid <= 0) notFound();
  const e = await leerEnvio(s.org.id, eid);
  if (!e) notFound();
  const borrador = e.estado === "borrador";
  const enCamino = e.estado === "despachado";
  const editando = editandoFicha(sp);
  const editandoFlete = editandoFicha(sp, "flete");
  const base = `/stock/full/${eid}`;
  // La sugerencia se abre con «Ver sugeridos» y se cierra con «Cerrar sugeridos» (?sugeridos=1, con sus días).
  const verSugeridos = borrador && sp.sugeridos === "1";
  const diasDe = (x: string | undefined, d: number) => Math.min(365, Math.max(1, Math.trunc(Number(x)) || d));
  const param = { diasFull: diasDe(sp.df, SUGERENCIA_DEFECTO.diasFull), diasDejar: diasDe(sp.dd, SUGERENCIA_DEFECTO.diasDejar), diasVentas: diasDe(sp.dv, SUGERENCIA_DEFECTO.diasVentas) };
  const conSug = verSugeridos ? { sugeridos: "1", df: sp.df ?? null, dd: sp.dd ?? null, dv: sp.dv ?? null } : {};
  const aqui = (extra: Record<string, string | number | null> = {}) => url(base, { q: sp.q, contiene: sp.contiene, ...conSug, ...extra });

  const lineas = await consulta<Linea>(`
    select l.id::int, l.variacion_id::int, v.producto_id::int, v.sku, titulo_variacion(v.id) titulo,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = v.producto_id) fotos,
           l.item_id, l.variation_id,
           (select ${SQL_CODIGO} from meli_item m where m.canal_id = $3 and m.item_id = l.item_id and coalesce(m.variation_id, '') = l.variation_id limit 1) codigo,
           l.cantidad, l.recibido, l.faltante, l.flete_unit_ars::float
      from full_envio_linea l join variacion v on v.id = l.variacion_id
     where l.organizacion_id = $1 and l.envio_id = $2 order by v.sku`, [s.org.id, eid, e.canal_id]);
  const [ctx, reparto, facturas, pubs, sug] = await Promise.all([
    lineas.length ? contexto(s.org.id, e, SUGERENCIA_DEFECTO.diasVentas, lineas.map((l) => l.variacion_id)) : Promise.resolve([]),
    lineasReparto(s.org.id, eid),
    editandoFlete ? facturasParaFlete(s.org.id, e.flete_factura_id) : Promise.resolve([]),
    publicacionesDe(s.org.id, e.canal_id, lineas.map((l) => l.variacion_id)),
    verSugeridos ? calcularSugeridos(s.org.id, eid, param) : Promise.resolve([]),
  ]);
  const pubsDe = (v: number) => pubs.filter((p) => p.variacion_id === v);
  const sugPubs = verSugeridos ? await publicacionesDe(s.org.id, e.canal_id, sug.map((x) => x.variacion_id)) : [];
  const ctxDe = new Map(ctx.map((c) => [c.variacion_id, c]));
  const { usado, sinDato } = repartirFlete(reparto, e.flete_criterio, e.flete_ars);
  const unidades = lineas.reduce((t, l) => t + l.cantidad, 0);
  const recibidas = lineas.reduce((t, l) => t + l.recibido, 0);
  const faltantes = lineas.reduce((t, l) => t + l.faltante, 0);
  const pendientes = unidades - recibidas - faltantes;
  const n = (x: number) => formatearNumero(x, "entero");
  const dias = SUGERENCIA_DEFECTO.diasVentas;
  const porDia = (x: number) => formatearNumero(Math.round((x / dias) * 10) / 10, "decimal");

  // Etiquetas: el PDF de Stock › Etiquetas › Full, con estas publicaciones y cantidades.
  const imp = (await cookies()).get(COOKIE_IMPRESORA_FULL)?.value;
  const conCodigo = lineas.filter((l) => l.item_id);
  const etiquetas = conCodigo.length
    ? `/deposito/etiquetas/full/pdf?canal=${e.canal_id}&imp=${esImpresoraFull(imp) ? imp : "termica"}&${conCodigo.map((l) => `e=${encodeURIComponent(`${l.item_id}~${l.variation_id}~${l.cantidad}`)}`).join("&")}`
    : null;

  // Buscador para sumar productos (borrador).
  const q = (sp.q ?? "").trim();
  const hallados = borrador && q.length >= 2 ? await consulta<{ id: number; producto_id: number; sku: string; titulo: string; fotos: string[] | null; origen: number; publicada: boolean }>(`
    select v.id::int, v.producto_id::int, v.sku, titulo_variacion(v.id) titulo,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = v.producto_id) fotos,
           stock_disponible_deposito($1, v.id, $3) origen,
           exists (select 1 from publicacion pu where pu.variacion_id = v.id and pu.canal_id = $4 and pu.estado <> 'cerrada') publicada
      from variacion v join producto p on p.id = v.producto_id
     where v.organizacion_id = $1 and v.estado <> 'archivada' and p.estado <> 'archivado' and ${sqlBusqueda("$2", camposVariacionYProducto("v", "p"))}
     order by v.sku limit 15`, [s.org.id, parametroBusqueda(q, sp.contiene !== "1"), e.deposito_origen_id, e.canal_id]) : [];

  const est = ESTADOS_ENVIO[e.estado];
  return (
    <Pantalla titulo={<>Envío a Full {eid} <Estado texto={est.texto} tono={est.tono} /></>} camino={[{ texto: `Envío ${eid}` }]}
      subtitulo={`${e.canal} · sale de ${e.origen} · llega a ${e.full}`}
      acciones={
        <span className="inline-flex flex-wrap items-center gap-2">
          {etiquetas && !editando && <a href={etiquetas} target="_blank" rel="noopener noreferrer" className={SUAVE}>Etiquetas</a>}
          {enCamino && !editando && <BotonTarea accion={accionLeerFull} tipo="full-lectura" texto="Leer Full ahora" clase={SUAVE} campos={{ canal: String(e.canal_id) }} />}
          {borrador && !editando && lineas.length > 0 && (
            <BotonConfirmar accion={accionDespachar} campos={{ id: String(eid) }} clase={VERDE} texto="Despachar" corriendo="Despachando…"
              pregunta={`¿Despachar? ${n(unidades)} unidades salen de ${e.origen} y quedan «En camino a Full» (ya no se venden por ningún canal).`} />
          )}
          <BotonesFicha editando={editando} ver={aqui()} editar={aqui({ editar: "ficha" })} />
          {borrador && !editando && <TachoConfirmar accion={accionBorrarEnvio} campos={{ id: String(eid) }} pregunta="¿Borrar el envío?" />}
        </span>
      }>
      <Avisos sp={sp} />

      <form id="ficha" action={accionGuardarEnvio} className={`${CAJA} mb-4 flex flex-wrap gap-4 items-start`}>
        <input type="hidden" name="id" value={eid} />
        {editando ? (
          <>
            <label className="w-48"><span className={ETIQUETA}>Nº del envío en Mercado Libre</span><input name="numero_ml" defaultValue={e.numero_ml ?? ""} className={`${CAMPO} w-full font-mono`} />
              <span className="block text-[10px] text-[#5C6B76] mt-0.5">De referencia: Mercado Libre no deja leer el envío desde otro sistema; los productos se cargan acá.</span></label>
            <label className="w-40"><span className={ETIQUETA}>Entrega en Full (turno)</span><input type="date" name="fecha_entrega" defaultValue={e.fecha_entrega ?? ""} className={`${CAMPO} w-full`} /></label>
            <label className="flex-1 min-w-60"><span className={ETIQUETA}>Notas</span><textarea name="notas" rows={2} defaultValue={e.notas ?? ""} className={`${CAMPO} w-full`} /></label>
          </>
        ) : (
          <>
            <Dato etiqueta="Nº del envío en Mercado Libre" className="w-48">{e.numero_ml ? <span className="font-mono">{e.numero_ml}</span> : null}</Dato>
            <Dato etiqueta="Entrega en Full (turno)" className="w-40">{e.fecha_entrega ? diaAR(e.fecha_entrega) : null}</Dato>
            <Dato etiqueta="Notas" largo className="flex-1 min-w-60">{e.notas}</Dato>
          </>
        )}
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-4">
        <Dato etiqueta="Productos" numero>{n(lineas.length)}</Dato>
        <Dato etiqueta="Unidades" numero>{n(unidades)}</Dato>
        <Dato etiqueta="Recibidas en Full" numero>{borrador ? null : n(recibidas)}</Dato>
        <Dato etiqueta="Pendientes" numero>{borrador ? null : n(pendientes)}</Dato>
        <Dato etiqueta="Despachado" >{e.despachado_ts ? fechaHora(e.despachado_ts) : null}</Dato>
        <Dato etiqueta={e.estado === "cerrado" ? "Cerrado" : "Recibido"}>{e.cerrado_ts ? fechaHora(e.cerrado_ts) : e.recibido_ts ? fechaHora(e.recibido_ts) : null}</Dato>
      </div>

      <div className={`${CAJA} mb-4`}>
        <TituloSeccion titulo="Flete del envío">
          <BotonesFicha editando={editandoFlete} ver={aqui()} editar={aqui({ editar: "flete" })} form="flete" />
        </TituloSeccion>
        <form id="flete" action={accionGuardarFlete} className="flex flex-wrap gap-4 items-start">
          <input type="hidden" name="id" value={eid} />
          {editandoFlete ? (
            <>
              <label className="w-40"><span className={ETIQUETA}>Monto ($, sin IVA)</span>
                <CampoNumero name="monto" valor={e.flete_ars} tipo="pesos" className={`${CAMPO} w-full`} /></label>
              <label className="flex-1 min-w-72"><span className={ETIQUETA}>Factura de gasto (opcional)</span>
                <ElegirDeLista name="factura" opciones={facturas} valor={e.flete_factura_id} vacio="Sin factura" placeholder="Buscá por proveedor, número o fecha…" etiqueta="Factura de gasto" /></label>
              <label className="w-64"><span className={ETIQUETA}>Cómo se reparte</span>
                <select name="criterio" defaultValue={e.flete_criterio} className={`${CAMPO} w-full`}>
                  {Object.entries(CRITERIOS_FLETE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <p className="basis-full text-[11px] text-[#5C6B76]">Si vinculás una factura y dejás el monto vacío, se toma lo que cuesta la factura sin IVA (neto + no gravado + otros impuestos). Para tomarlo de nuevo de la factura, borrá el monto.</p>
            </>
          ) : (
            <>
              <Dato etiqueta="Monto (sin IVA)" numero className="w-40">{e.flete_ars != null ? formatear(e.flete_ars, "ARS") : null}</Dato>
              <Dato etiqueta="Factura de gasto" className="flex-1 min-w-72">
                {e.flete_factura_id ? <Link href={`/compras/facturas/${e.flete_factura_id}`} className="text-[#16577F] hover:underline">{e.factura ?? `Factura ${e.flete_factura_id}`}</Link> : null}
              </Dato>
              <Dato etiqueta="Cómo se reparte" className="w-64">{CRITERIOS_FLETE[e.flete_criterio]}</Dato>
              {e.flete_ars != null && (
                <p className="basis-full text-[11px] text-[#5C6B76]">
                  {unidades ? `En promedio, ${formatear(Math.round((e.flete_ars / unidades) * 100) / 100, "ARS")} por unidad. ` : ""}
                  {usado !== e.flete_criterio && sinDato.length ? <span className="text-[#8a6100]">Se repartió por unidades porque a {sinDato.length === 1 ? "un producto le falta" : `${n(sinDato.length)} productos les falta`} el dato ({sinDato.slice(0, 5).join(", ")}{sinDato.length > 5 ? "…" : ""}). </span> : null}
                  Lo que le toca a cada unidad se resta en la <Link href="/informes/rentabilidad" className="text-[#16577F] hover:underline">rentabilidad</Link> de cada venta que sale de Full.
                </p>
              )}
            </>
          )}
        </form>
      </div>

      <TituloSeccion titulo={`Productos (${lineas.length})`}>
        {borrador && lineas.length > 0 && (
          <BotonConfirmar accion={accionVaciarEnvio} campos={{ id: String(eid) }} clase={SUAVE} texto="Vaciar el envío" corriendo="Vaciando…"
            pregunta={`¿Sacar los ${n(lineas.length)} productos del envío?`} />
        )}
      </TituloSeccion>
      <p className="text-[11px] text-[#5C6B76] mb-1">
        Vendidas por día: promedio de los últimos {dias} días. «En camino» es lo de otros envíos que todavía no llegó. En Full el stock es de cada
        publicación, no del producto: lo que mandás sólo lo vende la publicación elegida (con el lápiz se cambia). Viene elegida la que más vendió.
      </p>
      <div className={`${CAJA_TABLA} mb-3`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Producto</th><th className={TH}>Publicación</th><th className={TH}>Código ML</th>
              <th className={THN}>Vende/día en la cuenta</th><th className={THN}>Vende/día en lo demás</th><th className={THN}>En Full</th><th className={THN}>En camino</th>
              <th className={THN}>Disponible en {e.origen}</th><th className={THN}>Cantidad</th>
              {!borrador && <><th className={THN}>Recibido</th><th className={THN}>Faltante</th></>}
              <th className={THN}>Flete por unidad</th><th />
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <tr><td colSpan={13} className={`${TD} text-[#5C6B76]`}>Todavía no hay productos: buscalos abajo o mirá los sugeridos.</td></tr>}
            {lineas.map((l) => {
              const c = ctxDe.get(l.variacion_id);
              const editarFila = borrador && sp.editar === `l-${l.id}`;
              const recibirFila = enCamino && sp.recibir === String(l.id);
              const pend = l.cantidad - l.recibido - l.faltante;
              return (
                <tr key={l.id} className={TR} data-canal={e.canal_id}>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2 align-middle">
                      <FotosProducto fotos={l.fotos} titulo={l.titulo} />
                      <Link href={`/catalogo/productos/${l.producto_id}`} className="font-mono text-[#16577F] hover:underline">{l.sku}</Link>
                    </span>{" "}<span className="text-[#5C6B76]">{l.titulo}</span>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {editarFila ? (
                      <select name="publicacion" form={`fl-${l.id}`} defaultValue={l.item_id ? `${l.item_id}~${l.variation_id}` : ""} className={CAMPO} aria-label="Publicación">
                        {pubsDe(l.variacion_id).map((p) => (
                          <option key={`${p.item_id}~${p.variation_id}`} value={`${p.item_id}~${p.variation_id}`}>
                            {p.item_id} · {textoPlan(p.plan) ?? "—"}{p.catalogo ? " · Catálogo" : ""} · vendió {p.vendidas}{p.estado !== "active" ? " · pausada" : ""}
                          </option>
                        ))}
                      </select>
                    ) : l.item_id ? (() => {
                      const p = pubsDe(l.variacion_id).find((x) => x.item_id === l.item_id && x.variation_id === l.variation_id);
                      return (
                        <>
                          <span className="font-mono"><Link href={historialPublicacion(l.item_id)} className="text-[#16577F] hover:underline">{l.item_id}</Link> <a href={enlaceMl(l.item_id)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a></span>
                          {p && <span className="block text-[10px] text-[#5C6B76]">{textoPlan(p.plan)} {p.catalogo && <MarcaCatalogo />} · vendió {n(p.vendidas)} en {dias} días{pubsDe(l.variacion_id).length > 1 ? ` · ${pubsDe(l.variacion_id).length} publicaciones` : ""}</span>}
                        </>
                      );
                    })() : <span className="text-[#C03420]">Sin publicación en la cuenta</span>}
                  </td>
                  <td className={`${TD} font-mono`}>{l.codigo ?? "—"}</td>
                  <td className={TDN}>{c ? porDia(c.vendidas_cuenta) : "—"}</td>
                  <td className={TDN}>{c ? porDia(c.vendidas_otros) : "—"}</td>
                  <td className={TDN}>{c ? n(c.en_full) : "—"}</td>
                  <td className={TDN}>{c ? n(c.en_camino) : "—"}</td>
                  <td className={`${TDN} ${borrador && c && c.disponible_origen < l.cantidad ? "text-[#C03420] font-bold" : ""}`}>{c ? n(c.disponible_origen) : "—"}</td>
                  <td className={TDN}>
                    {editarFila ? (
                      <form id={`fl-${l.id}`} action={accionCantidadLinea} className="inline-flex items-center gap-1">
                        <input type="hidden" name="envio" value={eid} /><input type="hidden" name="linea" value={l.id} />
                        <CampoNumero name="cantidad" valor={l.cantidad} tipo="entero" className={`${CAMPO} w-20`} />
                        <button className={VERDE}>Guardar</button>
                        <Link href={aqui()} className={SUAVE} scroll={false}>Cancelar</Link>
                      </form>
                    ) : n(l.cantidad)}
                  </td>
                  {!borrador && <><td className={TDN}>{n(l.recibido)}</td><td className={TDN}>{l.faltante ? n(l.faltante) : ""}</td></>}
                  <td className={TDN}>{l.flete_unit_ars != null ? formatear(l.flete_unit_ars, "ARS") : "—"}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {borrador && !editarFila && (
                      <span className="inline-flex gap-1">
                        <Lapiz href={aqui({ editar: `l-${l.id}` })} />
                        <TachoConfirmar accion={accionBorrarLinea} campos={{ envio: String(eid), linea: String(l.id) }} pregunta="¿Sacarlo del envío?" />
                      </span>
                    )}
                    {enCamino && pend > 0 && (recibirFila ? (
                      <form action={accionRecibirAMano} className="inline-flex items-center gap-1">
                        <input type="hidden" name="envio" value={eid} /><input type="hidden" name="linea" value={l.id} />
                        <CampoNumero name="cantidad" valor={pend} tipo="entero" className={`${CAMPO} w-16`} />
                        <BotonEnviar clase={VERDE} corriendo="Recibiendo…">Recibir</BotonEnviar>
                        <Link href={aqui()} className={SUAVE} scroll={false}>Cancelar</Link>
                      </form>
                    ) : <Link href={aqui({ recibir: l.id })} className={SUAVE} scroll={false}>Recibir…</Link>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {borrador && (
        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <div className={CAJA}>
            <TituloSeccion titulo="Agregar productos" />
            <BuscadorVivo q={q} comienza={sp.contiene !== "1"} placeholder="Buscar por SKU, código de barras o título" limpiar={["editar", "recibir"]} />
            {hallados.length > 0 && (
              <table className={`${TABLA} mt-2`}>
                <tbody>
                  {hallados.map((h) => (
                    <tr key={h.id} className={TR}>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-2 align-middle">
                          <FotosProducto fotos={h.fotos} titulo={h.titulo} />
                          <Link href={`/catalogo/productos/${h.producto_id}`} className="font-mono text-[#16577F] hover:underline">{h.sku}</Link>
                        </span>{" "}<span className="text-[#5C6B76]">{h.titulo}</span>
                        {!h.publicada && <span className="block text-[10px] text-[#C03420]">No está publicado en {e.canal}</span>}
                      </td>
                      <td className={TDN} title={`Disponible en ${e.origen}`}>{n(h.origen)}</td>
                      <td className={`${TD} text-right`}>
                        <form action={accionAgregarLinea} className="inline-flex items-center gap-1">
                          <input type="hidden" name="envio" value={eid} /><input type="hidden" name="variacion" value={h.id} />
                          <CampoNumero name="cantidad" valor={1} tipo="entero" className={`${CAMPO} w-16`} />
                          <BotonEnviar clase={PRIMARIO} corriendo="…">Agregar</BotonEnviar>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {q.length >= 2 && hallados.length === 0 && <p className="text-[11px] text-[#8a6100] mt-2">No hay productos con «{q}».</p>}
          </div>
          <div className={CAJA}>
            <TituloSeccion titulo="Sugeridos">
              {verSugeridos
                ? <Link href={url(base, { q: sp.q, contiene: sp.contiene })} className={SUAVE} scroll={false}>Cerrar sugeridos</Link>
                : <Link href={aqui({ sugeridos: "1" })} className={PRIMARIO} scroll={false}>Ver sugeridos</Link>}
            </TituloSeccion>
            <p className="text-[11px] text-[#5C6B76]">
              Muestra, sin agregar nada, los productos que {e.canal} publica y vendió: lo que vende en los días a cubrir, menos lo que ya hay en Full y en camino,
              sin dejar {e.origen} por debajo de lo que venden los demás canales en los días a dejar. Tildás los que querés mandar y apretás «Agregar los tildados».
            </p>
          </div>
        </div>
      )}

      {verSugeridos && (
        <div className={`${CAJA} mb-4`}>
          <TituloSeccion titulo={`Sugeridos (${sug.length})`}>
            <button type="submit" form="tildados" className={PRIMARIO}>Agregar los tildados</button>
            <Link href={url(base, { q: sp.q, contiene: sp.contiene })} className={SUAVE} scroll={false}>Cerrar sugeridos</Link>
          </TituloSeccion>
          <form className="flex flex-wrap items-end gap-3 mb-2">
            <input type="hidden" name="sugeridos" value="1" />
            <label><span className={ETIQUETA}>Días de venta a cubrir en Full</span><input name="df" inputMode="numeric" defaultValue={param.diasFull} className={`${CAMPO} ${ANCHO_NUMERO} w-24 text-right`} /></label>
            <label><span className={ETIQUETA}>Días de venta a dejar en {e.origen}</span><input name="dd" inputMode="numeric" defaultValue={param.diasDejar} className={`${CAMPO} ${ANCHO_NUMERO} w-24 text-right`} /></label>
            <label><span className={ETIQUETA}>Promedio de ventas de los últimos (días)</span><input name="dv" inputMode="numeric" defaultValue={param.diasVentas} className={`${CAMPO} ${ANCHO_NUMERO} w-24 text-right`} /></label>
            <button className={SUAVE}>Recalcular</button>
          </form>
          <form id="tildados" action={accionAgregarTildados}>
            <input type="hidden" name="envio" value={eid} />
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Mandar</th><th className={TH}>Producto</th><th className={TH}>Iría a la publicación</th>
                  <th className={THN}>Vende/día en la cuenta</th><th className={THN}>Vende/día en lo demás</th><th className={THN}>En Full</th>
                  <th className={THN}>En camino</th><th className={THN}>Disponible en {e.origen}</th><th className={THN}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {sug.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>Con esos días no hay nada para sugerir (o ya está todo en el envío).</td></tr>}
                {sug.map((x) => {
                  const p = sugPubs.find((y) => y.variacion_id === x.variacion_id);
                  const d = param.diasVentas;
                  const pd = (v: number) => formatearNumero(Math.round((v / d) * 10) / 10, "decimal");
                  return (
                    <tr key={x.variacion_id} className={TR}>
                      <td className={TD}><input type="checkbox" name={`s_${x.variacion_id}`} aria-label={`Mandar ${x.sku}`} className="h-4 w-4" /></td>
                      <td className={TD}><span className="font-mono">{x.sku}</span> <span className="text-[#5C6B76]">{x.titulo}</span></td>
                      <td className={`${TD} whitespace-nowrap`}>{p ? <><span className="font-mono">{p.item_id}</span> <span className="text-[10px] text-[#5C6B76]">{textoPlan(p.plan)}</span> {p.catalogo && <MarcaCatalogo />}</> : "—"}</td>
                      <td className={TDN}>{pd(x.vendidas_cuenta)}</td>
                      <td className={TDN}>{pd(x.vendidas_otros)}</td>
                      <td className={TDN}>{n(x.en_full)}</td>
                      <td className={TDN}>{x.en_camino ? n(x.en_camino) : ""}</td>
                      <td className={TDN}>{n(x.disponible_origen)}</td>
                      <td className={TDN}><CampoNumero name={`c_${x.variacion_id}`} valor={x.sugerido} tipo="entero" className={`${CAMPO} w-20`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </form>
        </div>
      )}

      {enCamino && (
        <div className={`${CAJA} mb-4`}>
          <TituloSeccion titulo="Cerrar el envío" />
          <p className="text-[11px] text-[#5C6B76] mb-2">
            {pendientes > 0
              ? `Faltan ${n(pendientes)} unidades. Se reciben solas cuando Mercado Libre las cuenta en Full; si no van a llegar, cerralo y elegí qué pasa con ellas.`
              : "Llegó todo."}
          </p>
          <span className="inline-flex flex-wrap gap-2">
            <BotonConfirmar accion={accionCerrarEnvio} campos={{ id: String(eid), faltantes: "volver" }} clase={SUAVE} texto="Cerrar: lo que falta vuelve al depósito"
              corriendo="Cerrando…" pregunta={`¿Cerrar? Las ${n(pendientes)} unidades que faltan vuelven a ${e.origen}.`} />
            <BotonConfirmar accion={accionCerrarEnvio} campos={{ id: String(eid), faltantes: "perdido" }} clase={SUAVE} texto="Cerrar: lo que falta se perdió"
              corriendo="Cerrando…" pregunta={`¿Cerrar? Las ${n(pendientes)} unidades que faltan salen del stock como perdidas.`} />
          </span>
        </div>
      )}
      {borrador && <p className="text-[11px] text-[#5C6B76]">El envío también se arma en la Central de vendedores de Mercado Libre (Full › Enviar productos) con las mismas cantidades; ahí te dan el número y el turno, que se cargan arriba con el lápiz.</p>}
    </Pantalla>
  );
}
