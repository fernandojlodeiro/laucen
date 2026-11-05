// Ficha de una orden de compra al exterior: la cabecera (lápiz arriba a la derecha), la preventa en la web y en Mercado
// Libre, recibir, y las pestañas Renglones, Cajas y Preventas.

import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonConfirmar, TachoConfirmar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import FotosProducto from "@/app/componentes/FotosProducto";
import CampoNumero from "@/app/componentes/CampoNumero";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import Pestanas from "@/app/componentes/Pestanas";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, BotonesFicha, Dato, Estado, Lapiz, TituloSeccion, editandoFicha, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { supabaseServer } from "@/lib/supabase";
import { diaAr, opcionesProveedores } from "@/lib/compras/invoices";
import { cajasOrden, ESTADOS_ORDEN, lineasOrden, ordenCabecera, TONO_ESTADO, VIAS_ORDEN } from "@/lib/compras/ordenes";
import { configPreventa, pedidosEnPreventa } from "@/lib/preventa";
import SubirPacking from "./SubirPacking";
import {
  accionAgregarLineaOrden, accionBorrarLineaOrden, accionConfirmarOrden, accionGuardarLineaOrden, accionGuardarOrden, accionPublicarOrden, accionRecibirOrden, accionVolverABorrador,
} from "../acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type SP = { ok?: string; error?: string; editar?: string; ver?: string; nuevo?: string };

const usd = (n: number, dec = 2) => `US$ ${formatearNumero(Math.round(n * 10 ** dec) / 10 ** dec, "decimal")}`;
const kg = (n: number | null) => (n == null ? "—" : `${formatearNumero(Math.round(n * 10) / 10, "decimal")} kg`);

export default async function FichaOrden({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const oid = Number((await params).id);
  if (!Number.isInteger(oid) || oid <= 0) notFound();
  const o = await ordenCabecera(s.org.id, oid);
  if (!o) notFound();
  const editando = editandoFicha(sp);
  const base = `/compras/ordenes/${oid}`;
  const ver = sp.ver === "cajas" ? "cajas" : sp.ver === "preventas" ? "preventas" : "renglones";
  const [lineas, cajas, preventas, proveedores, depositos, recepcion, cfg, archivo] = await Promise.all([
    lineasOrden(s.org.id, oid),
    cajasOrden(s.org.id, oid),
    pedidosEnPreventa(s.org.id, { ordenId: oid }),
    editando ? opcionesProveedores(s.org.id) : Promise.resolve([]),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' and tipo not in ('full_ml', 'transito') order by (tipo = 'propio') desc, id", [s.org.id]),
    consulta<{ id: number; estado: string }>("select id::int, estado from recepcion where orden_compra_id = $1 order by id desc limit 1", [oid]),
    configPreventa(s.org.id),
    (async () => {
      const r = await consulta<{ ruta_storage: string | null }>("select ruta_storage from compra_invoice where id = $1", [o.invoice_id]);
      const ruta = r[0]?.ruta_storage;
      if (!ruta) return null;
      const { data } = await (await supabaseServer()).storage.from("importaciones").createSignedUrl(ruta, 3600);
      return data?.signedUrl ?? null;
    })(),
  ]);
  const editandoLinea = sp.editar && sp.editar !== "ficha" ? Number(sp.editar) : null;
  const abierta = o.estado !== "recibida";
  const enCamino = o.estado === "en_camino";
  const recAbierta = recepcion[0]?.estado === "abierta" ? recepcion[0].id : null;
  const cajasRecibidas = cajas.filter((k) => k.recibida_ts).length;

  return (
    <Pantalla titulo={`Orden ${o.codigo}`} camino={[{ texto: o.codigo }]}
      subtitulo={<><Estado texto={ESTADOS_ORDEN[o.estado]} tono={TONO_ESTADO[o.estado]} /> {VIAS_ORDEN[o.via].texto}{o.proveedor ? ` · ${o.proveedor}` : ""}</>}
      acciones={
        <span className="inline-flex flex-wrap items-center gap-2">
          {archivo && <a href={archivo} target="_blank" rel="noopener noreferrer" className={SUAVE}>Ver el Excel ↗</a>}
          {cajas.length > 0 && <Link href={`${base}/etiquetas`} target="_blank" className={SUAVE}>Etiquetas de las cajas ↗</Link>}
          {!editando && abierta && ver === "renglones" && <BotonNuevo texto="Nuevo renglón" />}
          {!editando && o.estado === "borrador" && (
            <BotonConfirmar accion={accionConfirmarOrden} campos={{ id: String(oid) }} clase={VERDE} texto="Confirmar"
              pregunta="¿Confirmar la orden? Pasa a mercadería en camino y el FOB de cada producto toma el del Excel." corriendo="Confirmando…" />
          )}
          {!editando && enCamino && !o.recibido && !o.prevendido && (
            <BotonConfirmar accion={accionVolverABorrador} campos={{ id: String(oid) }} clase={SUAVE} texto="Volver a revisar" pregunta="¿Sacarla de la mercadería en camino?" corriendo="…" />
          )}
          {abierta && <BotonesFicha editando={editando} ver={base} editar={`${base}?editar=ficha`} />}
        </span>
      }>
      <Avisos sp={sp} />

      <form id="ficha" action={accionGuardarOrden} className={`${CAJA} mb-4 grid grid-cols-2 sm:grid-cols-6 gap-3 items-start`}>
        <input type="hidden" name="id" value={oid} />
        {editando ? (
          <>
            <label><span className={ETIQUETA}>Llega por</span>
              <select name="via" defaultValue={o.via} className={`${CAMPO} w-full`}>
                {Object.entries(VIAS_ORDEN).map(([k, v]) => <option key={k} value={k}>{v.texto} ({v.letra})</option>)}
              </select></label>
            <label><span className={ETIQUETA}>Número del año</span><CampoNumero name="numero" valor={o.numero} tipo="entero" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Año</span><CampoNumero name="anio" valor={o.anio} tipo="entero" className={`${CAMPO} w-full`} /></label>
            <div className="col-span-2 sm:col-span-3"><span className={ETIQUETA}>Proveedor</span>
              <ElegirDeLista name="proveedor_id" opciones={proveedores} valor={o.proveedor_id} vacio="Sin proveedor" placeholder="Buscá el proveedor…" etiqueta="Proveedor" />
            </div>
            <label><span className={ETIQUETA}>Fecha de la orden</span><input type="date" name="fecha" defaultValue={o.fecha ?? ""} className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Arribo (web)</span><input type="date" name="llegada" defaultValue={o.llegada ?? ""} className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Arribo para Mercado Libre</span><input type="date" name="llegada_ml" defaultValue={o.llegada_ml ?? ""} className={`${CAMPO} w-full`} />
              <span className="block text-[10px] text-[#5C6B76]">Con más margen que la de la web.</span></label>
            <label><span className={ETIQUETA}>Descuento de preventa %</span><CampoNumero name="descuento_pct" valor={o.descuento_pct} tipo="pct" className={`${CAMPO} w-full`} />
              <span className="block text-[10px] text-[#5C6B76]">Vacío: el general ({formatearNumero(cfg.descuentoPct, "pct")} %).</span></label>
            <label><span className={ETIQUETA}>Margen de seguridad (u.)</span><CampoNumero name="margen_unidades" valor={o.margen_unidades} tipo="entero" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Margen de seguridad %</span><CampoNumero name="margen_pct" valor={o.margen_pct} tipo="pct" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Toma</span>
              <select name="margen_modo" defaultValue={o.margen_modo ?? ""} className={`${CAMPO} w-full`}>
                <option value="">El general</option><option value="menor">El menor</option><option value="mayor">El mayor</option>
              </select>
              <span className="block text-[10px] text-[#5C6B76]">Vacíos: el general ({cfg.margenUnidades ?? "—"} u. / {cfg.margenPct ?? "—"} %, el {cfg.margenModo}).</span></label>
            <label className="col-span-2 sm:col-span-6"><span className={ETIQUETA}>Notas</span><input name="notas" defaultValue={o.notas ?? ""} className={`${CAMPO} w-full`} /></label>
          </>
        ) : (
          <>
            <Dato etiqueta="Llega por">{VIAS_ORDEN[o.via].texto} ({VIAS_ORDEN[o.via].letra})</Dato>
            <Dato etiqueta="Número del año" numero>{String(o.numero)}</Dato>
            <Dato etiqueta="Año" numero>{String(o.anio)}</Dato>
            <Dato etiqueta="Proveedor" className="col-span-2 sm:col-span-3">{o.proveedor_id ? <Link href={`/compras/proveedores?id=${o.proveedor_id}`} className="text-[#16577F] hover:underline">{o.proveedor}</Link> : null}</Dato>
            <Dato etiqueta="Fecha de la orden">{o.fecha ? diaAr(o.fecha) : null}</Dato>
            <Dato etiqueta="Arribo (web)">{o.llegada ? diaAr(o.llegada) : null}</Dato>
            <Dato etiqueta="Arribo para Mercado Libre">{o.llegada_ml ? diaAr(o.llegada_ml) : null}</Dato>
            <Dato etiqueta="Descuento de preventa %" numero>{o.descuento_pct != null ? formatearNumero(o.descuento_pct, "pct") : `${formatearNumero(cfg.descuentoPct, "pct")} (general)`}</Dato>
            <Dato etiqueta="Margen de seguridad (u.)" numero>{o.margen_unidades != null ? String(o.margen_unidades) : null}</Dato>
            <Dato etiqueta="Margen de seguridad %" numero>{o.margen_pct != null ? formatearNumero(o.margen_pct, "pct") : null}</Dato>
            <Dato etiqueta="Toma">{o.margen_modo ? `El ${o.margen_modo}` : o.margen_unidades == null && o.margen_pct == null ? `El general (${cfg.margenUnidades ?? "—"} u. / ${cfg.margenPct ?? "—"} %, el ${cfg.margenModo})` : null}</Dato>
            <Dato etiqueta="Notas" className="col-span-2 sm:col-span-6">{o.notas}</Dato>
            {o.compra_courier_id && <Dato etiqueta="Compra por courier" className="col-span-2"><Link href={`/compras/courier/${o.compra_courier_id}`} className="text-[#16577F] hover:underline">{o.compra_courier}</Link></Dato>}
            {o.invoice_id && <Dato etiqueta="Invoice" className="col-span-2"><Link href={`/compras/invoices/${o.invoice_id}`} className="text-[#16577F] hover:underline">{o.archivo ?? "Ver"}</Link></Dato>}
          </>
        )}
      </form>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <section className={CAJA}>
          <TituloSeccion titulo="Preventa" />
          {o.estado === "borrador" && <p className="text-[11px] text-[#8a6100] mb-2">Se puede publicar cuando la orden está confirmada.</p>}
          <div className="space-y-2">
            <Interruptor accion={accionPublicarOrden} prendido={o.publicar_web} campos={{ id: String(oid), canal: "web" }} compacto deshabilitado={!enCamino}
              etiqueta="Publicar en la web" ayuda={`Los productos de esta orden sin stock se ofrecen en preventa con llegada aprox. el ${diaAr(o.llegada)}.`} />
            <Interruptor accion={accionPublicarOrden} prendido={o.publicar_ml} campos={{ id: String(oid), canal: "ml" }} compacto deshabilitado={!enCamino}
              etiqueta="Publicar en Mercado Libre" ayuda={`Las publicaciones sin stock pasan a «disponible N días después de la compra» hasta el ${diaAr(o.llegada_ml ?? o.llegada)} (tope ${cfg.mlMaxDias} días). Sólo en los canales con «Preventa automática» prendida; si no, queda preparado en la cola.`} />
          </div>
          <p className="text-[11px] text-[#5C6B76] mt-2">
            Vendido en preventa: <b>{o.prevendido}</b> u. — <Link href={`/ventas/preventas?orden=${oid}`} className="text-[#16577F] hover:underline">ver en Preventas</Link>
          </p>
        </section>
        <section className={CAJA}>
          <TituloSeccion titulo="Recepción" />
          {o.estado === "borrador" && <p className="text-xs text-[#5C6B76]">Se recibe cuando la orden está confirmada.</p>}
          {enCamino && (recAbierta ? (
            <Link href={`/deposito/recepcion/${recAbierta}`} className={PRIMARIO}>Seguir recibiendo (recepción #{recAbierta})</Link>
          ) : (
            <form action={accionRecibirOrden} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={oid} />
              <label><span className={ETIQUETA}>Depósito</span>
                <select name="deposito" className={CAMPO}>{depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></label>
              <button className={PRIMARIO}>Recibir</button>
            </form>
          ))}
          {o.estado === "recibida" && <p className="text-xs">Recibida el {o.recibida_ts ? new Date(o.recibida_ts).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "—"}{recepcion[0] ? <> · <Link href={`/deposito/recepcion/${recepcion[0].id}`} className="text-[#16577F] hover:underline">recepción #{recepcion[0].id}</Link></> : null}</p>}
          <p className="text-[11px] text-[#5C6B76] mt-2">Recibido: <b>{o.recibido}</b> de {formatearNumero(o.unidades, "entero")} u.{cajas.length ? ` · cajas recibidas: ${cajasRecibidas} de ${cajas.length}` : ""}</p>
        </section>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Dato etiqueta="Renglones" numero>{formatearNumero(o.renglones, "entero")}</Dato>
        <Dato etiqueta="Sin producto en el sistema" numero>{formatearNumero(o.sin_producto, "entero")}</Dato>
        <Dato etiqueta="Unidades" numero>{formatearNumero(o.unidades, "entero")}</Dato>
        <Dato etiqueta="Total" numero>{o.total_usd == null ? "sin precio" : usd(o.total_usd)}</Dato>
      </div>

      <Pestanas items={[
        { href: base, texto: "Renglones", activa: ver === "renglones", cuenta: lineas.length },
        { href: `${base}?ver=cajas`, texto: "Cajas", activa: ver === "cajas", cuenta: cajas.length },
        { href: `${base}?ver=preventas`, texto: "Preventas", activa: ver === "preventas", cuenta: preventas.length },
      ]} />

      {ver === "renglones" && (
        <>
          <AltaNueva texto="Nuevo renglón" sinBoton>
            <form action={accionAgregarLineaOrden} className={`${CAJA} flex flex-wrap items-end gap-3`}>
              <input type="hidden" name="orden_id" value={oid} />
              <label className="w-40"><span className={ETIQUETA}>SKU</span><input name="sku" className={`${CAMPO} w-full font-mono`} autoFocus /></label>
              <label className="w-28"><span className={ETIQUETA}>Cantidad</span><CampoNumero name="cantidad" valor={null} tipo="entero" className={`${CAMPO} w-full`} /></label>
              <label className="w-32"><span className={ETIQUETA}>FOB unit. US$</span><CampoNumero name="precio" valor={null} tipo="decimal" className={`${CAMPO} w-full`} /></label>
              <label className="flex-1 min-w-48"><span className={ETIQUETA}>Descripción</span><input name="descripcion" className={`${CAMPO} w-full`} /></label>
              <button className={PRIMARIO}>Agregar</button>
            </form>
          </AltaNueva>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Producto</th><th className={THN} title="Cantidad pedida">Cant.</th><th className={THN} title="Lo que ya entró por la recepción">Recib.</th>
                  <th className={THN} title="Vendido en preventa">Prevend.</th><th className={THN} title="Lo que traen las cajas del packing list">En cajas</th>
                  <th className={THN}>FOB unit.</th><th className={THN}>Total</th><th className={TH}>SKU del Excel</th><th />
                </tr>
              </thead>
              <tbody>
                {lineas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>Sin renglones.</td></tr>}
                {lineas.map((l) => editandoLinea === l.id ? (
                  <tr key={l.id} className={`${TR} bg-[#F7F9FB]`}>
                    <td className={TD}>
                      <form id={`l${l.id}`} action={accionGuardarLineaOrden}>
                        <input type="hidden" name="id" value={l.id} /><input type="hidden" name="orden_id" value={oid} />
                        <input name="sku" defaultValue={l.sku} className={`${CAMPO} w-40 font-mono`} autoFocus />
                      </form>
                    </td>
                    <td className={TDN}><CampoNumero form={`l${l.id}`} name="cantidad" valor={l.cantidad} tipo="entero" className={`${CAMPO} w-24`} /></td>
                    <td className={TDN}>{l.recibido}</td><td className={TDN}>{l.prevendido}</td><td className={TDN}>{l.en_cajas || "—"}</td>
                    <td className={TDN}><CampoNumero form={`l${l.id}`} name="precio" valor={l.precio_usd} tipo="decimal" className={`${CAMPO} w-28`} /></td>
                    <td className={TDN} /><td className={`${TD} text-[11px] text-[#5C6B76]`}>{l.descripcion}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <button form={`l${l.id}`} className={VERDE}>Grabar</button>{" "}
                      <Link href={base} className={SUAVE} scroll={false}>Cancelar</Link>
                    </td>
                  </tr>
                ) : (
                  <tr key={l.id} className={TR}>
                    <td className={TD}>
                      {l.producto_id ? (
                        <span className="inline-flex items-center gap-2 align-middle">
                          <FotosProducto fotos={l.fotos} titulo={l.titulo ?? l.sku} />
                          <span>
                            <Link href={`/catalogo/productos/${l.producto_id}`} className="font-mono text-[#16577F] hover:underline">{l.sku_sistema}</Link>
                            <span className="block text-[10px] text-[#5C6B76] max-w-80 line-clamp-2" title={l.titulo ?? ""}>{l.titulo}</span>
                          </span>
                        </span>
                      ) : <span className="text-[#C03420]">No está en el sistema: corregí el SKU con el lápiz o dalo de alta</span>}
                    </td>
                    <td className={TDN}>{formatearNumero(l.cantidad, "entero")}</td>
                    <td className={TDN}>{l.recibido || "—"}</td>
                    <td className={TDN}>{l.prevendido || "—"}</td>
                    <td className={`${TDN} ${cajas.length && l.en_cajas !== l.cantidad ? "text-[#C03420] font-bold" : ""}`}>{cajas.length ? l.en_cajas : "—"}</td>
                    <td className={TDN}>{l.precio_usd == null ? "—" : usd(l.precio_usd, 4)}</td>
                    <td className={TDN}>{l.precio_usd == null ? "—" : usd(l.cantidad * l.precio_usd)}</td>
                    <td className={`${TD} font-mono text-[11px] text-[#5C6B76]`} title={l.descripcion ?? ""}>{l.sku}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      {abierta && <><Lapiz href={`${base}?editar=${l.id}`} />{" "}
                        <TachoConfirmar accion={accionBorrarLineaOrden} campos={{ id: String(l.id), orden_id: String(oid) }} pregunta="¿Borrar el renglón?" /></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ver === "cajas" && (
        <>
          {abierta && !cajasRecibidas && <div className={`${CAJA} mb-3`}><SubirPacking organizacionId={s.org.id} ordenId={oid} reemplaza={cajas.length > 0} /></div>}
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr><th className={TH}>Caja</th><th className={TH}>Contenido</th><th className={THN}>Peso</th><th className={THN}>CBM</th><th className={TH}>Medidas</th><th className={TH}>Estado</th></tr>
              </thead>
              <tbody>
                {cajas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Todavía no se subió el packing list.</td></tr>}
                {cajas.map((k) => (
                  <tr key={k.id} className={TR}>
                    <td className={`${TD} font-bold font-mono whitespace-nowrap`}>{k.codigo}</td>
                    <td className={TD}>
                      {k.items.map((i) => (
                        <span key={i.id} className="block">
                          {i.cantidad} × {i.producto_id ? <Link href={`/catalogo/productos/${i.producto_id}`} className="font-mono text-[#16577F] hover:underline">{i.sku}</Link> : <span className="font-mono text-[#C03420]" title="No está en el sistema">{i.sku}</span>}
                        </span>
                      ))}
                    </td>
                    <td className={TDN}>{kg(k.peso_kg)}</td>
                    <td className={TDN}>{k.cbm == null ? "—" : formatearNumero(k.cbm, "decimal")}</td>
                    <td className={`${TD} whitespace-nowrap`}>{k.largo_cm && k.ancho_cm && k.alto_cm ? `${k.largo_cm} × ${k.ancho_cm} × ${k.alto_cm} cm` : "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {k.recibida_ts ? <><Estado texto="Recibida" tono="verde" /> <span className="text-[11px] text-[#5C6B76]">{k.deposito} · {k.en_ubicacion} u. en la caja</span></> : <Estado texto="Sin recibir" tono="gris" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ver === "preventas" && (
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr><th className={TH}>Pedido</th><th className={TH}>Fecha</th><th className={TH}>Canal</th><th className={TH}>Cliente</th><th className={TH}>Productos</th><th className={TH}>Estado</th></tr>
            </thead>
            <tbody>
              {preventas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Nada vendido en preventa de esta orden.</td></tr>}
              {preventas.map((p) => (
                <tr key={p.id} className={TR} data-canal={p.canal_id}>
                  <td className={TD}><Link href={`/ventas/pedidos/${p.id}`} className="font-bold text-[#16577F] hover:underline">#{p.id}</Link></td>
                  <td className={`${TD} whitespace-nowrap`}>{new Date(p.fecha).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</td>
                  <td className={TD}>{p.canal}</td>
                  <td className={TD}>{p.cliente_id ? <Link href={`/ventas/clientes/${p.cliente_id}`} className="text-[#16577F] hover:underline">{p.cliente}</Link> : "—"}</td>
                  <td className={TD}>{p.productos}</td>
                  <td className={TD}>{p.cubierto ? <Estado texto="Llegó: reservado" tono="verde" /> : p.en_espera ? <Estado texto="En espera sin orden" tono="naranja" /> : <Estado texto="Esperando la orden" tono="azul" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Pantalla>
  );
}
