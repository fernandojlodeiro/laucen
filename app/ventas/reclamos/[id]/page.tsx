// La ficha de un reclamo: sus datos (pedido, comprador, productos, motivo,
// etapa, montos), la conversación, lo que se puede hacer y su historia.
//   · Mercado Libre: los botones salen de lo que ML ofrece en ese momento
//     (available_actions del vendedor). Cada botón es el clic de Fer: va a la
//     cola (ml_cola, tipo 'reclamo') y sale enseguida. Nada se contesta solo.
//   · Web / local: la ficha se edita con el lápiz (modo vista de entrada),
//     estados abierto / en proceso / resuelto, y el reembolso sólo se anota.
// En los dos, "Recibir devolución" abre la recepción de devolución del pedido.

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import FotosProducto from "@/app/componentes/FotosProducto";
import CampoNumero from "@/app/componentes/CampoNumero";
import {
  entrarErp, Pantalla, Avisos, Estado, Dato, TituloSeccion, BotonesFicha, editandoFicha, CAJA, CAMPO, ETIQUETA,
  CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN,
} from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import { ESTADOS_RECLAMO, TIPOS_RECLAMO, ORIGENES_RECLAMO, type EstadoReclamo, type TipoReclamo } from "@/lib/reclamos";
import {
  ACCIONES_RECLAMO, ETAPAS_ML, ESTADOS_DEVOLUCION, textoAccion, type AccionMl, type ResolucionEsperadaMl,
} from "@/lib/mercadolibre/reclamos";
import { ESTADOS_COLA, TONO_COLA } from "@/app/config/canales/cola/formato";
import { tiempoParaResponder, TONO_RECLAMO } from "../formato";
import BotonAccion from "../BotonAccion";
import {
  accionEditarReclamo, accionReembolso, accionNota, accionRecibirDevolucion, accionActualizarReclamo, accionReclamoMl, accionEstadoReclamo,
} from "../acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string; editar?: string };

type Reclamo = {
  id: number; origen: "mercadolibre" | "web" | "local"; canal_id: number | null; canal: string | null; id_externo: string | null;
  pedido_id: number | null; pedido_externo: string | null; cliente_id: number | null; cliente: string | null; orden_externa: string | null;
  comprador_externo: string | null; tipo: TipoReclamo; motivo: string | null; estado: EstadoReclamo; etapa: string | null; estado_externo: string | null;
  fecha: Date; vence_ts: Date | null; espera_respuesta: boolean; acciones_disponibles: AccionMl[]; resolucion: string | null;
  monto: number | null; reembolso_ars: number | null; devolucion_id: string | null; devolucion_estado: string | null;
  devolucion_envio_estado: string | null; devolucion_tracking: string | null; recepcion_id: number | null; recepcion_estado: string | null;
  notas: string | null; datos_externos: { resoluciones_esperadas?: ResolucionEsperadaMl[] | null } | null; actualizado_ts: Date;
};

const DE: Record<string, string> = { comprador: "Comprador", vendedor: "Vos", ml: "Mercado Libre", interno: "Nota interna" };
const ESPERADA: Record<string, string> = {
  refund: "Que le devuelvan el dinero", product: "Que le manden el producto", change_product: "Cambiar el producto",
  return_product: "Devolver el producto", partial_refund: "Que le devuelvan parte del dinero",
};
const ESTADO_ESPERADA: Record<string, string> = { pending: "pendiente", accepted: "aceptada", rejected: "rechazada", completed: "cumplida" };

export default async function FichaReclamo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("reclamos_ver");
  const sp = await searchParams;
  const rid = Number((await params).id);
  if (!Number.isInteger(rid) || rid <= 0) notFound();
  const r = await una<Reclamo>(`
    select r.id::int, r.origen, r.canal_id::int, ca.nombre canal, r.id_externo, r.pedido_id::int, pe.id_externo pedido_externo,
           r.cliente_id::int, cl.nombre cliente, r.orden_externa, r.comprador_externo, r.tipo, r.motivo, r.estado, r.etapa, r.estado_externo,
           r.fecha, r.vence_ts, r.espera_respuesta, r.acciones_disponibles, r.resolucion, r.monto::float, r.reembolso_ars::float,
           r.devolucion_id, r.devolucion_estado, r.devolucion_envio_estado, r.devolucion_tracking, r.recepcion_id::int, rc.estado recepcion_estado,
           r.notas, r.datos_externos - 'ml' datos_externos, r.actualizado_ts
      from reclamo r
      left join canal ca on ca.id = r.canal_id
      left join pedido pe on pe.id = r.pedido_id
      left join cliente cl on cl.id = r.cliente_id
      left join recepcion rc on rc.id = r.recepcion_id
     where r.id = $1 and r.organizacion_id = $2`, [rid, s.org.id]);
  if (!r) notFound();
  const esMl = r.origen === "mercadolibre";
  const editando = !esMl && editandoFicha(sp);
  const VER = `/ventas/reclamos/${rid}`;

  const [lineas, mensajes, eventos, cola] = await Promise.all([
    // Los productos: las líneas del pedido de esa orden (en un carrito de ML, sólo las suyas).
    r.pedido_id ? consulta<{ id: number; sku: string | null; titulo: string; cantidad: number; precio: number; producto_id: number | null; fotos: string[] | null }>(`
      select l.id::int, l.sku, l.titulo, l.cantidad, l.precio_unit_ars::float precio, v.producto_id::int,
             (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = v.producto_id) fotos
        from pedido_linea l left join variacion v on v.id = l.variacion_id
       where l.pedido_id = $1
         and ($2::text is null or l.datos_externos #>> '{ml,order_id}' = $2
              or not exists (select 1 from pedido_linea x where x.pedido_id = $1 and x.datos_externos #>> '{ml,order_id}' = $2))
       order by l.orden, l.id`, [r.pedido_id, r.orden_externa]) : Promise.resolve([]),
    consulta<{ id: number; de: string; texto: string | null; adjuntos: unknown[]; fecha: Date; usuario: string | null }>(`
      select m.id::int, m.de, m.texto, m.adjuntos, m.fecha, u.nombre usuario from reclamo_mensaje m left join usuarios u on u.id = m.usuario_id
       where m.reclamo_id = $1 and m.organizacion_id = $2 order by m.fecha, m.id`, [rid, s.org.id]),
    consulta<{ id: number; tipo: string; detalle: string | null; fecha: Date; usuario: string | null }>(`
      select e.id::int, e.tipo, e.detalle, e.fecha, u.nombre usuario from reclamo_evento e left join usuarios u on u.id = e.usuario_id
       where e.reclamo_id = $1 and e.organizacion_id = $2 order by e.fecha desc, e.id desc limit 100`, [rid, s.org.id]),
    esMl && r.id_externo ? consulta<{ id: number; estado: string; descripcion: string | null; ultimo_error: string | null; creado_ts: Date }>(`
      select id::int, estado, payload ->> 'descripcion' descripcion, ultimo_error, creado_ts from ml_cola
       where organizacion_id = $1 and tipo = 'reclamo' and item_id = $2 order by id desc limit 10`, [s.org.id, `reclamo:${r.id_externo}`]) : Promise.resolve([]),
  ]);

  const vence = r.estado !== "resuelto" ? tiempoParaResponder(r.vence_ts) : null;
  const esperadas = Array.isArray(r.datos_externos?.resoluciones_esperadas) ? r.datos_externos!.resoluciones_esperadas! : [];
  const acciones = esMl && r.estado !== "resuelto" ? (r.acciones_disponibles ?? []) : [];
  const devolucionTexto = r.devolucion_envio_estado ?? r.devolucion_estado;

  return (
    <Pantalla titulo={`Reclamo ${rid}`} camino={[{ texto: `Reclamo ${rid}` }]}
      subtitulo={<>{ORIGENES_RECLAMO[r.origen]}{r.canal ? ` · ${r.canal}` : ""}{r.id_externo ? ` · reclamo de ML ${r.id_externo}` : ""}</>}
      acciones={esMl
        ? <form action={accionActualizarReclamo}><input type="hidden" name="id" value={rid} /><BotonEnviar clase={SUAVE} corriendo="Actualizando…">Actualizar desde ML</BotonEnviar></form>
        : <BotonesFicha editando={editando} ver={VER} editar={`${VER}?editar=ficha`} />}>
      <Avisos sp={sp} />

      {vence && r.espera_respuesta && (
        <p className={`text-xs rounded-lg px-3 py-2 mb-3 ${vence.tono === "rojo" ? "bg-[#FDF1EF] text-[#C03420] font-bold" : "bg-[#FFF8E6] text-[#8a6100]"}`}>
          Mercado Libre espera tu respuesta · {vence.texto} (vence {fechaHora(r.vence_ts)})
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3 min-w-0">
          {/* Datos */}
          <section className={CAJA}>
            <TituloSeccion titulo="Datos" />
            {editando ? (
              <form id="ficha" action={accionEditarReclamo} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <input type="hidden" name="id" value={rid} />
                <Dato etiqueta="Pedido">{r.pedido_id ? `${r.pedido_id}` : null}</Dato>
                <Dato etiqueta="Cliente">{r.cliente}</Dato>
                <label><span className={ETIQUETA}>Estado</span>
                  <select name="estado" defaultValue={r.estado} className={`${CAMPO} w-full`}>
                    {Object.entries(ESTADOS_RECLAMO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></label>
                <label><span className={ETIQUETA}>Tipo</span>
                  <select name="tipo" defaultValue={r.tipo} className={`${CAMPO} w-full`}>
                    {Object.entries(TIPOS_RECLAMO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></label>
                <label className="sm:col-span-2"><span className={ETIQUETA}>Motivo</span>
                  <input name="motivo" defaultValue={r.motivo ?? ""} required className={`${CAMPO} w-full`} /></label>
                <label><span className={ETIQUETA}>Monto reclamado $</span>
                  <CampoNumero name="monto" valor={r.monto} tipo="pesos" className="w-full" /></label>
                <label className="sm:col-span-2 lg:col-span-3"><span className={ETIQUETA}>Notas</span>
                  <textarea name="notas" defaultValue={r.notas ?? ""} rows={3} className={`${CAMPO} w-full`} /></label>
              </form>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Dato etiqueta="Pedido">{r.pedido_id
                  ? <Link href={`/ventas/pedidos/${r.pedido_id}`} className="font-semibold text-[#16577F] hover:underline">{r.pedido_id}{r.pedido_externo ? ` · ${r.pedido_externo}` : ""}</Link>
                  : r.orden_externa ? <span>Orden de ML {r.orden_externa} (sin pedido en Laucen)</span> : null}</Dato>
                <Dato etiqueta={r.origen === "mercadolibre" ? "Comprador" : "Cliente"}>{r.cliente_id
                  ? <Link href={`/ventas/clientes/${r.cliente_id}`} className="text-[#16577F] hover:underline">{r.cliente}</Link>
                  : r.comprador_externo ? `Usuario de ML ${r.comprador_externo}` : null}</Dato>
                <Dato etiqueta="Estado"><Estado texto={ESTADOS_RECLAMO[r.estado]} tono={TONO_RECLAMO[r.estado]} /></Dato>
                <Dato etiqueta="Tipo">{TIPOS_RECLAMO[r.tipo] ?? r.tipo}</Dato>
                <Dato etiqueta="Motivo" className="sm:col-span-2">{r.motivo}</Dato>
                {esMl && <Dato etiqueta="Etapa">{r.etapa ? ETAPAS_ML[r.etapa] ?? r.etapa : null}</Dato>}
                <Dato etiqueta="Fecha">{fechaHora(r.fecha)}</Dato>
                {esMl && <Dato etiqueta="Para responder">{vence ? <Estado texto={`${vence.texto} · ${fechaHora(r.vence_ts)}`} tono={r.espera_respuesta ? vence.tono : "gris"} /> : null}</Dato>}
                <Dato etiqueta="Monto" numero>{r.monto != null ? formatear(r.monto, "ARS") : null}</Dato>
                {!esMl && <Dato etiqueta="Devuelto" numero>{r.reembolso_ars != null ? formatear(r.reembolso_ars, "ARS") : null}</Dato>}
                {(esMl || r.estado === "resuelto") && <Dato etiqueta="Resolución" className="sm:col-span-2">{r.resolucion}</Dato>}
                {!esMl && <Dato etiqueta="Notas" largo className="sm:col-span-2 lg:col-span-3">{r.notas}</Dato>}
              </div>
            )}
            {esMl && esperadas.length > 0 && (
              <div className="mt-3 text-xs">
                <span className={ETIQUETA}>Qué pide cada parte</span>
                <ul className="space-y-0.5">
                  {esperadas.map((e, i) => (
                    <li key={i}>{e.player_role === "complainant" ? "El comprador" : e.player_role === "respondent" ? "Vos" : "Mercado Libre"}:{" "}
                      <b>{ESPERADA[e.expected_resolution] ?? e.expected_resolution}</b>{e.status ? ` (${ESTADO_ESPERADA[e.status] ?? e.status})` : ""}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Productos */}
          <section className={CAJA}>
            <TituloSeccion titulo={`Productos (${lineas.length})`} />
            {lineas.length === 0 ? <p className="text-xs text-[#5C6B76]">{r.pedido_id ? "El pedido no tiene líneas." : "Sin pedido en Laucen: no se sabe qué productos son."}</p> : (
              <div className={CAJA_TABLA}>
                <table className={TABLA}>
                  <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Producto</th><th className={THN}>Cantidad</th><th className={THN}>Precio</th></tr></thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.id} className={TR}>
                        <td className={`${TD} font-mono whitespace-nowrap`}>{l.producto_id
                          ? <><Link href={`/catalogo/productos/${l.producto_id}`} className="text-[#16577F] hover:underline">{l.sku ?? "—"}</Link>{" "}<FotosProducto fotos={l.fotos} titulo={l.titulo} /></>
                          : l.sku ?? "—"}</td>
                        <td className={TD}>{l.titulo}</td>
                        <td className={TDN}>{l.cantidad}</td>
                        <td className={TDN}>{formatear(l.precio, "ARS")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Conversación */}
          <section className={CAJA}>
            <TituloSeccion titulo={`Conversación (${mensajes.length})`} />
            <div className="space-y-2 mb-3">
              {mensajes.length === 0 && <p className="text-xs text-[#5C6B76]">Todavía no hay mensajes.</p>}
              {mensajes.map((m) => {
                const derecha = m.de === "vendedor" || m.de === "interno";
                const color = m.de === "vendedor" ? "bg-[#EEF3F8] text-[#16577F]" : m.de === "interno" ? "bg-[#FFF8E6] border border-[#F1E2B8]"
                  : m.de === "ml" ? "bg-[#F3F0FA] border border-[#E2DCF2]" : "bg-[#FAFBFC] border border-[#E3E9F0]";
                return (
                  <div key={m.id} className={`flex ${derecha ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${color}`}>
                      <div className="whitespace-pre-wrap break-words">{m.texto ?? <i className="text-[#5C6B76]">(adjunto)</i>}</div>
                      {Array.isArray(m.adjuntos) && m.adjuntos.length > 0 && <div className="text-[10px] text-[#5C6B76]">+ {m.adjuntos.length} adjunto{m.adjuntos.length === 1 ? "" : "s"} (se ven en Mercado Libre)</div>}
                      <div className="text-[10px] text-[#5C6B76] mt-0.5 text-right">{m.de === "vendedor" ? (m.usuario ? `Respondió ${m.usuario}` : "Respondió alguien desde Mercado Libre") : `${DE[m.de] ?? m.de}${m.usuario ? ` (${m.usuario})` : ""}`} · {fechaHora(m.fecha)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <form action={accionNota} className="space-y-2">
              <input type="hidden" name="id" value={rid} />
              <label className="block">
                <span className={ETIQUETA}>Nota interna (sólo se ve en Laucen{esMl ? "; al comprador se le escribe con «Mandar mensaje al comprador»" : ""})</span>
                <textarea name="texto" rows={2} className={`${CAMPO} w-full`} />
              </label>
              <BotonEnviar clase={SUAVE} corriendo="Anotando…">Anotar nota</BotonEnviar>
            </form>
          </section>
        </div>

        <div className="space-y-3 min-w-0">
          {/* Lo que se puede hacer */}
          {esMl ? (
            <section className={CAJA}>
              <TituloSeccion titulo={`Qué podés hacer (${acciones.length})`} />
              {r.estado === "resuelto" ? <p className="text-xs text-[#5C6B76]">El reclamo está cerrado.</p>
                : acciones.length === 0 ? <p className="text-xs text-[#5C6B76]">Mercado Libre no espera nada de vos ahora. Tocá «Actualizar desde ML» si cambió algo.</p> : (
                  <div className="space-y-3">
                    {acciones.map((a) => {
                      const def = ACCIONES_RECLAMO[a.action];
                      const plazo = a.due_date ? tiempoParaResponder(a.due_date) : null;
                      const pie = (
                        <div className="text-[11px] text-[#5C6B76]">
                          {a.mandatory && <b className="text-[#8a6100]">Obligatoria · </b>}
                          {plazo ? <>{plazo.texto} (hasta {fechaHora(a.due_date)})</> : "Sin plazo"}
                        </div>
                      );
                      if (!def) {
                        return (
                          <div key={a.action} className="space-y-1">
                            <button type="button" disabled className={`${SUAVE} opacity-50 cursor-not-allowed`}>{textoAccion(a.action)}</button>
                            <div className="text-[11px] text-[#5C6B76]">Próximamente desde Laucen: por ahora, desde Mercado Libre.</div>
                            {pie}
                          </div>
                        );
                      }
                      return (
                        <form key={a.action} action={accionReclamoMl} className="space-y-1 border-t first:border-t-0 border-[#EEF1F4] pt-2 first:pt-0">
                          <input type="hidden" name="id" value={rid} />
                          <input type="hidden" name="accion" value={a.action} />
                          {def.campo === "mensaje" && (
                            <textarea name="mensaje" rows={3} maxLength={2000} required placeholder="Escribí el mensaje…" className={`${CAMPO} w-full`} />
                          )}
                          {def.campo === "porcentaje" && (
                            <label className="flex items-center gap-2 text-xs"><span>Porcentaje a devolver</span>
                              <CampoNumero name="porcentaje" valor={null} tipo="pct" className="w-20" /> %</label>
                          )}
                          <BotonAccion texto={def.texto} confirmar={def.confirmar} pregunta={`¿${def.texto}? Va a Mercado Libre.`} />
                          <div className="text-[11px] text-[#5C6B76]">{def.ayuda}</div>
                          {pie}
                        </form>
                      );
                    })}
                  </div>
                )}
              {cola.length > 0 && (
                <div className="mt-3 border-t border-[#EEF1F4] pt-2">
                  <span className={ETIQUETA}>Mandado a Mercado Libre</span>
                  <ul className="text-xs space-y-1">
                    {cola.map((c) => (
                      <li key={c.id}>
                        <Estado texto={ESTADOS_COLA[c.estado] ?? c.estado} tono={TONO_COLA[c.estado] ?? "gris"} /> {c.descripcion ?? "Acción"}
                        <span className="text-[10px] text-[#5C6B76]"> · {fechaHora(c.creado_ts)}</span>
                        {c.ultimo_error && <div className="text-[11px] text-[#C03420]">{c.ultimo_error}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : (
            <section className={CAJA}>
              <TituloSeccion titulo="Estado y reembolso" />
              <form action={accionEstadoReclamo} className="flex flex-wrap gap-2 mb-3">
                <input type="hidden" name="id" value={rid} />
                {(Object.keys(ESTADOS_RECLAMO) as EstadoReclamo[]).filter((e) => e !== r.estado).map((e) => (
                  <BotonEnviar key={e} clase={e === "resuelto" ? PRIMARIO : SUAVE} corriendo="Cambiando…" nombre="estado" valor={e}>
                    {e === "abierto" ? "Volver a abrir" : e === "en_proceso" ? "Pasar a en proceso" : "Marcar resuelto"}
                  </BotonEnviar>
                ))}
              </form>
              <form action={accionReembolso} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={rid} />
                <label><span className={ETIQUETA}>Reembolso $ (sólo se anota)</span>
                  <CampoNumero name="monto" valor={null} tipo="pesos" className="w-32" /></label>
                <BotonEnviar clase={SUAVE} corriendo="Anotando…">Anotar reembolso</BotonEnviar>
              </form>
            </section>
          )}

          {/* La devolución física */}
          <section className={CAJA}>
            <TituloSeccion titulo="Devolución">
              {r.pedido_id && (r.recepcion_id
                ? <Link href={`/deposito/recepcion/${r.recepcion_id}`} className={SUAVE}>Ver recepción {r.recepcion_id}</Link>
                : <form action={accionRecibirDevolucion}><input type="hidden" name="id" value={rid} /><BotonEnviar clase={PRIMARIO} corriendo="Abriendo…">Recibir devolución</BotonEnviar></form>)}
            </TituloSeccion>
            <div className="grid gap-2">
              {esMl && <Dato etiqueta="Envío de vuelta">{devolucionTexto
                ? <Estado texto={ESTADOS_DEVOLUCION[devolucionTexto] ?? devolucionTexto} tono={devolucionTexto === "delivered" ? "verde" : devolucionTexto === "shipped" ? "azul" : "gris"} />
                : r.devolucion_id ? "Sin datos" : "No hay devolución"}</Dato>}
              {esMl && r.devolucion_tracking && <Dato etiqueta="Seguimiento"><span className="font-mono">{r.devolucion_tracking}</span></Dato>}
              <Dato etiqueta="Recepción en el depósito">{r.recepcion_id
                ? <Link href={`/deposito/recepcion/${r.recepcion_id}`} className="text-[#16577F] hover:underline">Recepción {r.recepcion_id} ({r.recepcion_estado === "cerrada" ? "cerrada" : "abierta"})</Link>
                : null}</Dato>
            </div>
            {!r.pedido_id && <p className="mt-2 text-[11px] text-[#5C6B76]">Sin pedido en Laucen no se puede recibir la devolución desde acá.</p>}
            {r.pedido_id && !r.recepcion_id && <p className="mt-2 text-[11px] text-[#5C6B76]">Abre la recepción de devolución del pedido: se escanea lo que vuelve y se elige si es nuevo o caja abierta.</p>}
          </section>

          {/* Historia */}
          <section className={CAJA}>
            <TituloSeccion titulo={`Historia (${eventos.length})`} />
            {eventos.length === 0 ? <p className="text-xs text-[#5C6B76]">Sin movimientos.</p> : (
              <ul className="text-xs space-y-1.5">
                {eventos.map((e) => (
                  <li key={e.id}>
                    <div className="text-[10px] text-[#5C6B76]">{fechaHora(e.fecha)}{e.usuario ? ` · ${e.usuario}` : ""}</div>
                    <div className={e.tipo === "accion_error" ? "text-[#C03420]" : ""}>{e.detalle ?? e.tipo}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Pantalla>
  );
}
