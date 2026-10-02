// Depósitos y ubicaciones (orden 136, §7). Todo depósito tiene su ubicación
// GENERAL (la crea sola la base y no se borra ni se renombra): si el depósito
// no usa ubicaciones es la única; si las usa, es donde queda lo que todavía
// no se ubicó.

import Link from "next/link";
import { Fragment } from "react";
import { consulta } from "@/lib/erp/base";
import { VERDE, SUAVE, PRIMARIO, APAGAR } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva from "@/app/componentes/AltaNueva";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, CAJA,
} from "@/app/componentes/erp";
import {
  accionArchivarDeposito, accionBorrarDeposito, accionBorrarUbicacion, accionCrearDeposito, accionCrearUbicacion,
  accionGuardarDeposito, accionGuardarUbicacion, accionUsaUbicaciones,
} from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/stock/depositos";

const TIPOS: Record<string, string> = { propio: "Propio", full_ml: "Full de Mercado Libre", tercerizado: "Tercerizado", caja_abierta: "Caja abierta" };

type SP = { d?: string; editar?: string; eu?: string; archivar?: string; q?: string; contiene?: string; u?: string; ok?: string; error?: string };

/** Interruptor dentro de un formulario (una casilla dibujada como interruptor):
 *  para el alta y la edición en fila, donde no se guarda al tocarlo. */
function InterruptorCampo({ name, prendido, etiqueta }: { name: string; prendido: boolean; etiqueta: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={prendido} role="switch" className="peer sr-only" />
      <span className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-[#C9D3DD] transition peer-checked:bg-[#167655] peer-focus-visible:ring-2 peer-focus-visible:ring-[#16577F]
                       after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition after:content-[''] peer-checked:after:translate-x-4" />
      {etiqueta}
    </label>
  );
}

export default async function Depositos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("depositos_ver");
  const sp = await searchParams;
  const editar = Number(sp.editar) || 0;
  const editarUbic = Number(sp.eu) || 0;
  const archivar = Number(sp.archivar) || 0;
  // Buscador de ubicaciones (por código o descripción) y la ubicación abierta (?u=).
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const patron = q ? `${comienza ? "" : "%"}${q.replace(/[\\%_]/g, "\\$&")}%` : null;
  const abierta = Number(sp.u) || 0;

  const depositos = await consulta<{
    id: number; nombre: string; tipo: string; usa_ubicaciones: boolean; direccion: string | null; estado: string; ubicaciones: number; unidades: number;
  }>(`
    select d.id::int, d.nombre, d.tipo, d.usa_ubicaciones, d.direccion, d.estado,
           (select count(*) from ubicacion u where u.deposito_id = d.id)::int ubicaciones,
           (select coalesce(sum(s.cantidad), 0) from stock s join ubicacion u on u.id = s.ubicacion_id where u.deposito_id = d.id)::int unidades
      from deposito d where d.organizacion_id = $1 order by d.estado, d.nombre`, [s.org.id]);
  // Con un solo depósito activo, sus ubicaciones se ven de entrada.
  const activos = depositos.filter((d) => d.estado === "activo");
  const elegido = depositos.find((d) => d.id === Number(sp.d)) ?? (activos.length === 1 ? activos[0] : undefined);
  const aqui = url(BASE, { d: elegido?.id, q: q || null, contiene: comienza ? null : "1" });
  const paraArchivar = depositos.find((d) => d.id === archivar && d.estado === "activo");

  const ubicaciones = elegido ? await consulta<{
    id: number; codigo: string; descripcion: string | null; orden_recorrido: number; es_default: boolean; estado: string; unidades: number;
  }>(`
    select u.id::int, u.codigo, u.descripcion, u.orden_recorrido, u.es_default, u.estado,
           (select coalesce(sum(s.cantidad), 0) from stock s where s.ubicacion_id = u.id)::int unidades
      from ubicacion u where u.deposito_id = $2 and u.organizacion_id = $1
       and (u.es_default or $3::boolean)
       and ($4::text is null or u.codigo ilike $4 or u.descripcion ilike $4)
     order by u.es_default desc, u.orden_recorrido, u.codigo`, [s.org.id, elegido.id, elegido.usa_ubicaciones, patron]) : [];

  // Lo que hay adentro de la ubicación abierta.
  const contenido = abierta && ubicaciones.some((u) => u.id === abierta) ? await consulta<{
    variacion_id: number; sku: string; titulo: string; cantidad: number; reservado: number;
  }>(`
    select v.id::int variacion_id, v.sku, titulo_variacion(v.id) titulo, st.cantidad, st.reservado
      from stock st join variacion v on v.id = st.variacion_id
     where st.ubicacion_id = $2 and st.organizacion_id = $1 and (st.cantidad <> 0 or st.reservado <> 0)
     order by v.sku`, [s.org.id, abierta]) : [];
  // Ubicaciones que quedaron con algo de cuando el depósito sí las usaba.
  const ocultasConStock = elegido && !elegido.usa_ubicaciones ? (await consulta<{ n: number }>(`
    select count(*)::int n from ubicacion u where u.deposito_id = $2 and u.organizacion_id = $1 and not u.es_default
       and exists (select 1 from stock s where s.ubicacion_id = u.id and s.cantidad <> 0)`, [s.org.id, elegido.id]))[0]?.n ?? 0 : 0;

  return (
    <Pantalla titulo="Depósitos y ubicaciones" subtitulo="Dónde está la mercadería. Con “Ubicaciones” ves, agregás y editás las de cada depósito.">
      <Avisos sp={sp} />
      {paraArchivar && (
        <form action={accionArchivarDeposito} className="flex flex-wrap items-center gap-2 text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">
          <input type="hidden" name="id" value={paraArchivar.id} />
          <span>En lugar de borrar “{paraArchivar.nombre}”, lo podés archivar: queda guardado con su historia pero deja de contar para los canales.</span>
          <button className={APAGAR}>Archivarlo</button>
          <Link href={BASE} className={SUAVE}>No</Link>
        </form>
      )}

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Depósito</th><th className={TH}>Tipo</th><th className={TH}>Usa ubicaciones</th><th className={TH}>Dirección</th>
              <th className={TH}>Estado</th><th className={THN}>Ubicaciones</th><th className={THN}>Unidades</th><th />
            </tr>
          </thead>
          <tbody>
            {depositos.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>Todavía no hay depósitos. Agregá el primero abajo.</td></tr>}
            {depositos.map((d) => editar === d.id ? (
              <tr key={d.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={8} className={TD}>
                  <form action={accionGuardarDeposito} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="volver" value={aqui} />
                    <input name="nombre" defaultValue={d.nombre} className={`${CAMPO} flex-1 min-w-40`} autoFocus />
                    <select name="tipo" defaultValue={d.tipo} className={CAMPO} aria-label="Tipo">
                      {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <InterruptorCampo name="usa_ubicaciones" prendido={d.usa_ubicaciones} etiqueta="Usa ubicaciones" />
                    <input name="direccion" defaultValue={d.direccion ?? ""} placeholder="Dirección" className={`${CAMPO} flex-1 min-w-40`} />
                    <select name="estado" defaultValue={d.estado} className={CAMPO} aria-label="Estado">
                      <option value="activo">Activo</option><option value="archivado">Archivado</option>
                    </select>
                    <button className={VERDE}>Guardar</button>
                    <Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={d.id} className={`${TR} ${elegido?.id === d.id ? "bg-[#EEF3F8]" : ""}`}>
                <td className={TD}><Link href={url(BASE, { d: d.id })} className="font-semibold text-[#16577F] hover:underline">{d.nombre}</Link></td>
                <td className={TD}>{TIPOS[d.tipo] ?? d.tipo}</td>
                <td className={TD}>
                  <Interruptor accion={accionUsaUbicaciones} prendido={d.usa_ubicaciones} campos={{ id: String(d.id), volver: url(BASE, { d: d.id }) }}
                    etiqueta={d.usa_ubicaciones ? "Sí" : "No"} />
                </td>
                <td className={TD}>{d.direccion ?? "—"}</td>
                <td className={TD}><Estado texto={d.estado === "activo" ? "Activo" : "Archivado"} tono={d.estado === "activo" ? "verde" : "gris"} /></td>
                <td className={TDN}>
                  <Link href={url(BASE, { d: d.id })} className={SUAVE} scroll={false}>Ubicaciones ({d.ubicaciones})</Link>
                </td>
                <td className={TDN}>{d.unidades}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE, { d: elegido?.id, editar: d.id })} />
                    <TachoConfirmar accion={accionBorrarDeposito} campos={{ id: String(d.id) }} pregunta="¿Borrar el depósito?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AltaNueva texto="Nuevo depósito" className="mt-3">
      <form action={accionCrearDeposito} className="flex flex-wrap items-center gap-2">
        <input name="nombre" placeholder="Nombre (ej. Depósito Once)" className={`${CAMPO} flex-1 min-w-48`} autoFocus />
        <select name="tipo" defaultValue="propio" className={CAMPO} aria-label="Tipo">
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <InterruptorCampo name="usa_ubicaciones" prendido={false} etiqueta="Usa ubicaciones" />
        <input name="direccion" placeholder="Dirección (opcional)" className={`${CAMPO} min-w-40`} />
        <button className={PRIMARIO}>Crear</button>
      </form>
      </AltaNueva>

      {elegido && (
        <section className={`${CAJA} mt-6`}>
          <h2 className="text-sm font-bold mb-1">Ubicaciones de “{elegido.nombre}”</h2>
          {!elegido.usa_ubicaciones && (
            <p className="text-[11px] text-[#5C6B76] mb-2">
              Este depósito no usa ubicaciones: todo su stock va a la ubicación general. Si querés ordenarlo por estantes (ej. A-03-2), prendé “Usa ubicaciones” arriba.
              {ocultasConStock > 0 && ` Ojo: ${ocultasConStock} ubicación(es) de antes todavía tienen stock; se ven en la consulta de stock.`}
            </p>
          )}
          {elegido.usa_ubicaciones && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
              <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar ubicación por código o descripción" limpiar={["u", "eu"]} />
            </div>
          )}
          {elegido.usa_ubicaciones && (
            <AltaNueva texto="Nueva ubicación" className="mb-3">
            <form action={accionCrearUbicacion} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="deposito" value={elegido.id} />
              <input type="hidden" name="volver" value={aqui} />
              <input name="codigo" placeholder="Código (ej. A-03-2)" className={`${CAMPO} w-36`} autoFocus />
              <input name="descripcion" placeholder="Descripción (opcional)" className={`${CAMPO} flex-1 min-w-40`} />
              <CampoNumero name="orden" valor={null} tipo="entero" placeholder="Orden" className={`${CAMPO} w-20`} />
              <button className={PRIMARIO}>Crear</button>
            </form>
            </AltaNueva>
          )}
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr><th className={TH}>Código</th><th className={TH}>Descripción</th><th className={THN}>Orden de recorrido</th><th className={TH}>Estado</th><th className={THN}>Unidades</th><th /></tr>
              </thead>
              <tbody>
                {ubicaciones.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna ubicación coincide." : "Todavía no hay ubicaciones."}</td></tr>}
                {ubicaciones.map((u) => editarUbic === u.id && !u.es_default ? (
                  <tr key={u.id} className={`${TR} bg-[#FAFBFC]`}>
                    <td colSpan={6} className={TD}>
                      <form action={accionGuardarUbicacion} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="volver" value={aqui} />
                        <input name="codigo" defaultValue={u.codigo} className={`${CAMPO} w-28`} autoFocus />
                        <input name="descripcion" defaultValue={u.descripcion ?? ""} placeholder="Descripción" className={`${CAMPO} flex-1 min-w-40`} />
                        <CampoNumero name="orden" valor={u.orden_recorrido} tipo="entero" className={`${CAMPO} w-20`} />
                        <select name="estado" defaultValue={u.estado} className={CAMPO} aria-label="Estado">
                          <option value="activa">Activa</option><option value="archivada">Archivada</option>
                        </select>
                        <button className={VERDE}>Guardar</button>
                        <Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <Fragment key={u.id}>
                  <tr className={`${TR} ${u.id === abierta ? "bg-[#EEF3F8]" : ""}`}>
                    <td className={`${TD} font-semibold whitespace-nowrap`}>
                      <Link href={url(BASE, { d: elegido.id, q: q || null, contiene: comienza ? null : "1", u: u.id === abierta ? null : u.id })} scroll={false}
                        className="text-[#16577F] hover:underline" title="Ver los productos que tiene">{u.codigo}</Link>
                      {u.es_default && <span className="ml-2"><Estado texto="General" tono="azul" /></span>}</td>
                    <td className={TD}>{u.descripcion ?? "—"}</td>
                    <td className={TDN}>{u.orden_recorrido}</td>
                    <td className={TD}><Estado texto={u.estado === "activa" ? "Activa" : "Archivada"} tono={u.estado === "activa" ? "verde" : "gris"} /></td>
                    <td className={TDN}>{u.unidades}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      {u.es_default ? <span className="text-[10px] text-[#5C6B76]">la crea el sistema</span> : (
                        <span className="inline-flex gap-1">
                          <Lapiz href={url(BASE, { d: elegido.id, q: q || null, contiene: comienza ? null : "1", eu: u.id })} />
                          <TachoConfirmar accion={accionBorrarUbicacion} campos={{ id: String(u.id), volver: aqui }} pregunta="¿Borrar?" />
                        </span>
                      )}
                    </td>
                  </tr>
                  {u.id === abierta && (
                    <tr className="bg-[#FAFBFC]">
                      <td colSpan={6} className={TD}>
                        {contenido.length === 0 ? <span className="text-[#5C6B76]">No tiene nada adentro.</span> : (
                          <table className="text-xs">
                            <thead><tr><th className="text-left pr-4 pb-1">SKU</th><th className="text-left pr-4 pb-1">Producto</th><th className="text-right pr-4 pb-1">Cantidad</th><th className="text-right pb-1">Reservado</th></tr></thead>
                            <tbody>
                              {contenido.map((c) => (
                                <tr key={c.variacion_id}>
                                  <td className="pr-4 py-0.5 whitespace-nowrap"><Link href={url("/stock/consulta", { v: c.variacion_id })} className="text-[#16577F] hover:underline">{c.sku}</Link></td>
                                  <td className="pr-4 py-0.5">{c.titulo}</td>
                                  <td className="pr-4 py-0.5 text-right tabular-nums">{c.cantidad}</td>
                                  <td className="py-0.5 text-right tabular-nums">{c.reservado}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[#5C6B76] mt-2">El orden de recorrido es el que va a seguir el picking: de menor a mayor.</p>
        </section>
      )}
    </Pantalla>
  );
}
