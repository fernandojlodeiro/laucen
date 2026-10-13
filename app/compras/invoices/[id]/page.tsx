// Ficha de un invoice de compra (vista previa): lo que se leyó del Excel —fecha, número, proveedor y renglones— para
// corregir antes de confirmar. Cabecera con el lápiz de arriba a la derecha; cada renglón, con su lápiz en la fila;
// «Nuevo renglón» para cargar a mano (los PDF). Sólo estadística: no mueve stock ni costos.

import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonConfirmar, TachoConfirmar } from "@/app/radar/Cliente";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import FotosProducto from "@/app/componentes/FotosProducto";
import CampoNumero from "@/app/componentes/CampoNumero";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, BotonesFicha, Dato, Estado, Lapiz, editandoFicha, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { supabaseServer } from "@/lib/supabase";
import { configInvoices, diaAr, invoice, opcionesProveedores, VIAS } from "@/lib/compras/invoices";
import {
  accionAgregarLineaInvoice, accionBorrarLineaInvoice, accionConfirmarInvoice, accionGuardarInvoice, accionGuardarLineaInvoice, accionRevisarInvoice,
} from "../acciones";

export const dynamic = "force-dynamic";

const masDias = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

export default async function FichaInvoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; editar?: string }> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const iid = Number((await params).id);
  if (!Number.isInteger(iid) || iid <= 0) notFound();
  const d = await invoice(s.org.id, iid);
  if (!d) notFound();
  const { cabecera: c, lineas } = d;
  const editando = editandoFicha(sp);
  const base = `/compras/invoices/${iid}`;
  const [cfg, proveedores, couriers, archivo] = await Promise.all([
    configInvoices(s.org.id),
    editando ? opcionesProveedores(s.org.id) : Promise.resolve([]),
    editando ? consulta<{ id: number; nombre: string }>("select id::int, nombre from compra_courier where organizacion_id = $1 order by nombre", [s.org.id]) : Promise.resolve([]),
    (async () => {
      const r = await consulta<{ ruta_storage: string | null }>("select ruta_storage from compra_invoice where id = $1", [iid]);
      const ruta = r[0]?.ruta_storage;
      if (!ruta) return null;
      const { data } = await (await supabaseServer()).storage.from("importaciones").createSignedUrl(ruta, 3600);
      return data?.signedUrl ?? null;
    })(),
  ]);
  const llegada = c.llegada_real ?? (c.fecha ? masDias(c.fecha, c.via === "barco" ? cfg.demoraBarco : cfg.demoraAvion) : null);
  const usd = (n: number, dec = 2) => `US$ ${formatearNumero(Math.round(n * 10 ** dec) / 10 ** dec, "decimal")}`;
  const precioVisto = (n: number | null) => (n == null ? "—" : c.ignorar_precio ? <span className="text-[#5C6B76] line-through">{usd(n, 4)}</span> : usd(n, 4));
  const editandoLinea = sp.editar && sp.editar !== "ficha" ? Number(sp.editar) : null;

  return (
    <Pantalla titulo={`Invoice ${c.numero ?? c.archivo}`} camino={[{ texto: c.numero ?? c.archivo }]}
      subtitulo={<>{c.estado === "confirmado" ? <Estado texto="Confirmado" tono="verde" /> : <Estado texto="A revisar" tono="ambar" />} Sólo estadística: no mueve stock ni costos.</>}
      acciones={
        <span className="inline-flex flex-wrap items-center gap-2">
          {archivo && <a href={archivo} target="_blank" rel="noopener noreferrer" className={SUAVE}>Ver el archivo ↗</a>}
          {!editando && <BotonNuevo texto="Nuevo renglón" />}
          {!editando && (c.estado === "revisar"
            ? <BotonConfirmar accion={accionConfirmarInvoice} campos={{ id: String(iid) }} clase={VERDE} texto="Confirmar" pregunta="¿Confirmar el invoice? Pasa a contar en el historial de cada producto." corriendo="Confirmando…" />
            : <BotonConfirmar accion={accionRevisarInvoice} campos={{ id: String(iid) }} clase={SUAVE} texto="Volver a revisar" pregunta="¿Sacarlo del historial hasta confirmarlo de nuevo?" corriendo="…" />)}
          <BotonesFicha editando={editando} ver={base} editar={`${base}?editar=ficha`} />
        </span>
      }>
      <Avisos sp={sp} />
      {c.avisos.length > 0 && c.estado === "revisar" && (
        <ul className="mb-3 rounded-xl border border-[#F0D9A8] bg-[#FFF8E8] px-3 py-2 text-xs text-[#8a6100] space-y-0.5">
          {c.avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}

      <form id="ficha" action={accionGuardarInvoice} className={`${CAJA} mb-4 grid grid-cols-2 sm:grid-cols-6 gap-3 items-start`}>
        <input type="hidden" name="id" value={iid} />
        {editando ? (
          <>
            <label><span className={ETIQUETA}>Fecha del invoice</span><input type="date" name="fecha" defaultValue={c.fecha ?? ""} className={`${CAMPO} w-full`} autoFocus /></label>
            <label><span className={ETIQUETA}>Vino por</span>
              <select name="via" defaultValue={c.via} className={`${CAMPO} w-full`}>
                {Object.entries(VIAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select></label>
            <label><span className={ETIQUETA}>Llegada real</span><input type="date" name="llegada" defaultValue={c.llegada_real ?? ""} className={`${CAMPO} w-full`} />
              <span className="block text-[10px] text-[#5C6B76]">Vacía: se estima con la demora de la vía.</span></label>
            <label><span className={ETIQUETA}>Número</span><input name="numero" defaultValue={c.numero ?? ""} className={`${CAMPO} w-full`} /></label>
            <div className="col-span-2 sm:col-span-2"><span className={ETIQUETA}>Proveedor</span>
              <ElegirDeLista name="proveedor_id" opciones={proveedores} valor={c.proveedor_id} vacio="Sin proveedor" placeholder="Buscá el proveedor…" etiqueta="Proveedor" />
            </div>
            <label><span className={ETIQUETA}>Es la compra por courier</span>
              <select name="compra_courier_id" defaultValue={c.compra_courier_id ?? ""} className={`${CAMPO} w-full`}>
                <option value="">Ninguna</option>
                {couriers.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}
              </select></label>
            <label className="col-span-2 flex items-center gap-2 text-xs self-end py-1.5">
              <input type="checkbox" name="ignorar_precio" defaultChecked={c.ignorar_precio} className="h-4 w-4 accent-[#16577F]" />
              No tomar el precio (no es confiable)
            </label>
            <label className="col-span-2 sm:col-span-4"><span className={ETIQUETA}>Notas</span><input name="notas" defaultValue={c.notas ?? ""} className={`${CAMPO} w-full`} /></label>
          </>
        ) : (
          <>
            <Dato etiqueta="Fecha del invoice" ayuda={c.fecha_texto ? `En el invoice: «${c.fecha_texto}»` : undefined}>
              {c.fecha ? <>{diaAr(c.fecha)}{c.fecha_dudosa && <span className="ml-1 text-[#8a6100]">⚠ revisar</span>}</> : null}
            </Dato>
            <Dato etiqueta="Vino por">{VIAS[c.via]}</Dato>
            <Dato etiqueta={c.llegada_real ? "Llegada real" : "Llegada estimada"}>{llegada ? diaAr(llegada) : null}</Dato>
            <Dato etiqueta="Número">{c.numero}</Dato>
            <Dato etiqueta="Proveedor" className="col-span-2">{c.proveedor_id ? <Link href={`/compras/proveedores?id=${c.proveedor_id}`} className="text-[#16577F] hover:underline">{c.proveedor}</Link> : null}</Dato>
            <Dato etiqueta="Es la compra por courier">{c.compra_courier_id ? <Link href={`/compras/courier/${c.compra_courier_id}`} className="text-[#16577F] hover:underline">{c.compra_courier}</Link> : null}</Dato>
            <label className="col-span-2 flex items-center gap-2 text-xs self-end py-1.5">
              <input type="checkbox" disabled checked={c.ignorar_precio} className="h-4 w-4 accent-[#16577F]" />
              No tomar el precio (no es confiable)
            </label>
            <Dato etiqueta="Archivo" className="col-span-2 sm:col-span-3"><span className="break-all">{c.archivo}{c.hoja ? ` · hoja ${c.hoja}` : ""}</span></Dato>
            <Dato etiqueta="Notas" className="col-span-2 sm:col-span-6">{c.notas}</Dato>
          </>
        )}
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Dato etiqueta="Renglones" numero>{formatearNumero(c.renglones, "entero")}</Dato>
        <Dato etiqueta="Sin producto en el sistema" numero>{formatearNumero(c.sin_producto, "entero")}</Dato>
        <Dato etiqueta="Unidades" numero>{formatearNumero(c.unidades, "entero")}</Dato>
        <Dato etiqueta="Total" numero>{c.total_usd == null ? "sin precio" : usd(c.total_usd)}</Dato>
      </div>

      <AltaNueva texto="Nuevo renglón" sinBoton>
        <form action={accionAgregarLineaInvoice} className={`${CAJA} flex flex-wrap items-end gap-3`}>
          <input type="hidden" name="invoice_id" value={iid} />
          <label className="w-40"><span className={ETIQUETA}>SKU</span><input name="sku" className={`${CAMPO} w-full font-mono`} autoFocus /></label>
          <label className="w-28"><span className={ETIQUETA}>Cantidad</span><CampoNumero name="cantidad" valor={null} tipo="entero" className={`${CAMPO} w-full`} /></label>
          <label className="w-32"><span className={ETIQUETA}>Precio unit. US$</span><CampoNumero name="precio" valor={null} tipo="decimal" className={`${CAMPO} w-full`} /></label>
          <label className="flex-1 min-w-48"><span className={ETIQUETA}>Descripción</span><input name="descripcion" className={`${CAMPO} w-full`} /></label>
          <button className={PRIMARIO}>Agregar</button>
        </form>
      </AltaNueva>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={THN}>Fila</th><th className={TH}>SKU del invoice</th><th className={TH}>Producto</th><th className={TH}>Descripción del invoice</th>
              <th className={THN}>Cantidad</th><th className={THN}>Precio unit.</th><th className={THN}>Total</th><th />
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>Sin renglones: cargalos con «Nuevo renglón».</td></tr>}
            {lineas.map((l) => editandoLinea === l.id ? (
              <tr key={l.id} className={`${TR} bg-[#F7F9FB]`}>
                <td className={TDN}>{l.fila ?? ""}</td>
                <td className={TD} colSpan={3}>
                  <form id={`l${l.id}`} action={accionGuardarLineaInvoice}>
                    <input type="hidden" name="id" value={l.id} /><input type="hidden" name="invoice_id" value={iid} />
                    <input name="sku" defaultValue={l.sku} className={`${CAMPO} w-48 font-mono`} autoFocus />
                    <span className="ml-2 text-[11px] text-[#5C6B76]">{l.descripcion}</span>
                  </form>
                </td>
                <td className={TDN}><CampoNumero form={`l${l.id}`} name="cantidad" valor={l.cantidad} tipo="entero" className={`${CAMPO} w-24`} /></td>
                <td className={TDN}><CampoNumero form={`l${l.id}`} name="precio" valor={l.precio_usd} tipo="decimal" className={`${CAMPO} w-28`} /></td>
                <td className={TDN} />
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <button form={`l${l.id}`} className={VERDE}>Grabar</button>{" "}
                  <Link href={base} className={SUAVE} scroll={false}>Cancelar</Link>
                </td>
              </tr>
            ) : (
              <tr key={l.id} className={TR}>
                <td className={`${TDN} text-[#5C6B76]`}>{l.fila ?? ""}</td>
                <td className={`${TD} font-mono`}>{l.sku || "—"}</td>
                <td className={TD}>
                  {l.producto_id ? (
                    <span className="inline-flex items-center gap-2 align-middle">
                      <FotosProducto fotos={l.fotos} titulo={l.titulo ?? l.sku} />
                      <Link href={`/catalogo/productos/${l.producto_id}?seccion=compras`} className="font-mono text-[#16577F] hover:underline">{l.sku_sistema}</Link>
                      <span className="text-[#5C6B76] max-w-[18rem] truncate" title={l.titulo ?? ""}>{l.titulo}</span>
                    </span>
                  ) : <span className="text-[#C03420]">No está en el sistema: corregí el SKU con el lápiz</span>}
                </td>
                <td className={`${TD} text-[#5C6B76] max-w-[16rem] truncate`} title={l.descripcion ?? ""}>{l.descripcion}</td>
                <td className={TDN}>{formatearNumero(l.cantidad, "entero")}</td>
                <td className={TDN}>{precioVisto(l.precio_usd)}</td>
                <td className={TDN}>{l.precio_usd == null || c.ignorar_precio ? "—" : usd(l.cantidad * l.precio_usd)}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <Lapiz href={`${base}?editar=${l.id}`} />{" "}
                  <TachoConfirmar accion={accionBorrarLineaInvoice} campos={{ id: String(l.id), invoice_id: String(iid) }} pregunta="¿Borrar el renglón?" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
