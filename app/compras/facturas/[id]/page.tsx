// Detalle de una factura de compra. En borrador: cabecera editable (con
// percepciones), líneas (con producto o libres) editables en la fila,
// totales y "Registrar". Registrada: sólo lectura, con el link a la cuenta
// corriente del proveedor.

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { TachoConfirmar, BotonConfirmar, BotonEnviar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import {
  entrarErp, Pantalla, Avisos, Estado, Lapiz, url, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha as fechaAR, fechaHora } from "@/app/ventas/formato";
import { ESTADO_FACTURA, ALICUOTAS, numeroFactura, pct, buscarVariaciones } from "../../comun";
import { verInactivos, MostrarInactivos } from "@/app/componentes/Inactivos";
import { CamposCabecera, opcionesCabecera } from "../Cabecera";
import {
  accionGuardarCabecera, accionAgregarLinea, accionGuardarLinea, accionBorrarLinea, accionBorrarFactura, accionRegistrarFactura,
} from "../acciones";

export const dynamic = "force-dynamic";

type SP = { editar?: string; q?: string; inactivos?: string; ok?: string; error?: string };

type Factura = {
  id: number; proveedor_id: number; proveedor: string; letra: string; es_nota_credito: boolean; punto_venta: number | null; numero: string | null;
  fecha: string; vencimiento: string | null; moneda: "ARS" | "USD"; cotizacion: number; neto: number; iva: number;
  iva_detalle: { pct: number; base: number; importe: number }[]; percepcion_iva: number; percepcion_iibb: number; otros_impuestos: number;
  no_gravado: number; total: number; total_ars: number; total_usd: number; deposito_id: number | null; deposito: string | null;
  recepcion_id: number | null; cuenta_gasto_id: number | null; cuenta_gasto: string | null; estado: string; notas: string | null; registrada_ts: Date | null;
};
type Linea = { id: number; variacion_id: number | null; sku: string | null; descripcion: string; cantidad: number; costo_unit: number; iva_pct: number; neto: number; iva: number };

export default async function DetalleFacturaCompra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const fid = Number((await params).id);
  if (!Number.isInteger(fid) || fid <= 0) notFound();
  const f = await una<Factura>(`
    select f.id::int, f.proveedor_id::int, p.nombre proveedor, f.letra, f.es_nota_credito, f.punto_venta, f.numero::text,
           to_char(f.fecha, 'YYYY-MM-DD') fecha, to_char(f.vencimiento, 'YYYY-MM-DD') vencimiento, f.moneda, f.cotizacion::float,
           f.neto::float, f.iva::float, f.iva_detalle, f.percepcion_iva::float, f.percepcion_iibb::float, f.otros_impuestos::float,
           f.no_gravado::float, f.total::float, f.total_ars::float, f.total_usd::float, f.deposito_id::int, d.nombre deposito,
           f.recepcion_id::int, f.cuenta_gasto_id::int, (pc.codigo || ' ' || pc.nombre) cuenta_gasto, f.estado, f.notas, f.registrada_ts
      from factura_compra f join proveedor p on p.id = f.proveedor_id
      left join deposito d on d.id = f.deposito_id
      left join plan_cuenta pc on pc.id = f.cuenta_gasto_id and pc.organizacion_id = f.organizacion_id
     where f.id = $1 and f.organizacion_id = $2`, [fid, s.org.id]);
  if (!f) notFound();
  const borrador = f.estado === "borrador";
  const q = sp.q?.trim() ?? "";
  const [lineas, opciones, encontradas] = await Promise.all([
    consulta<Linea>(`
      select l.id::int, l.variacion_id::int, v.sku, l.descripcion, l.cantidad::float, l.costo_unit::float, l.iva_pct::float, l.neto::float, l.iva::float
        from factura_compra_linea l left join variacion v on v.id = l.variacion_id
       where l.factura_id = $1 and l.organizacion_id = $2 order by l.orden, l.id`, [fid, s.org.id]),
    borrador ? opcionesCabecera(s.org.id) : null,
    borrador ? buscarVariaciones(s.org.id, q, verInactivos(sp)) : [],
  ]);
  const editar = borrador ? Number(sp.editar) || 0 : 0;
  const aqui = (extra: Record<string, string | number | null> = {}) => url(`/compras/facturas/${fid}`, { q: q || null, ...extra });
  const m = f.moneda;
  const ivaPorDefecto = ["A", "M"].includes(f.letra) ? 21 : 0;
  const est = ESTADO_FACTURA[f.estado] ?? ESTADO_FACTURA.borrador;
  const Dato = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <div><span className={ETIQUETA}>{t}</span><div className="text-xs">{children}</div></div>
  );
  const SelectIva = ({ valor }: { valor: number }) => (
    <select name="iva_pct" defaultValue={String(valor)} className={CAMPO} aria-label="IVA">
      {ALICUOTAS.map((a) => <option key={a} value={a}>{pct(a)}</option>)}
    </select>
  );

  return (
    <Pantalla ancho="max-w-5xl"
      titulo={<>{f.es_nota_credito ? "Nota de crédito de compra" : "Factura de compra"} <span className="font-mono">{numeroFactura(f)}</span></>}
      subtitulo={<><Link href="/compras/facturas" className="text-[#16577F] hover:underline">← Facturas de compra</Link> · {f.proveedor} · {fechaAR(f.fecha)}</>}
      acciones={borrador ? <TachoConfirmar accion={accionBorrarFactura} campos={{ id: String(fid) }} pregunta="¿Borrar el borrador?" /> : undefined}>
      <Avisos sp={sp} />

      {borrador && opciones ? (
        <form action={accionGuardarCabecera} className={`${CAJA} grid gap-3 mb-4`}>
          <input type="hidden" name="id" value={fid} />
          <div className="flex items-center gap-2"><h2 className="text-sm font-bold">Cabecera</h2><Estado texto={est.texto} tono={est.tono} /></div>
          <CamposCabecera o={opciones} conImpuestos d={{ ...f, cotizacion: f.moneda === "USD" ? f.cotizacion : null }} />
          <div><BotonEnviar clase={PRIMARIO} corriendo="Guardando…">Guardar cabecera</BotonEnviar></div>
        </form>
      ) : (
        <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4`}>
          <Dato t="Estado"><Estado texto={est.texto} tono={est.tono} />{f.registrada_ts && <div className="text-[#5C6B76]">{fechaHora(f.registrada_ts)}</div>}</Dato>
          <Dato t="Proveedor">
            <Link href={`/administracion/cuentas-corrientes?tercero=proveedor&id=${f.proveedor_id}`} className="font-semibold text-[#16577F] hover:underline">{f.proveedor}</Link>
            <div className="text-[#5C6B76]">ver cuenta corriente</div>
          </Dato>
          <Dato t="Fecha">{fechaAR(f.fecha)}{f.vencimiento && <div className="text-[#5C6B76]">vence {fechaAR(f.vencimiento)}</div>}</Dato>
          <Dato t="Moneda">{m === "USD" ? `Dólares · cotización ${f.cotizacion.toLocaleString("es-AR")}` : "Pesos"}</Dato>
          <Dato t="Depósito">{f.recepcion_id ? <Link href={`/deposito/recepcion/${f.recepcion_id}`} className="text-[#16577F] hover:underline">Recepción #{f.recepcion_id}</Link> : (f.deposito ?? "—")}</Dato>
          <Dato t="Cuenta de gasto">{f.cuenta_gasto ?? "Mercadería"}</Dato>
          {f.notas && <div className="col-span-2"><Dato t="Notas">{f.notas}</Dato></div>}
        </div>
      )}

      <h2 className="text-sm font-bold mb-2">Líneas</h2>
      <div className={`${CAJA_TABLA} mb-3`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Descripción</th><th className={THN}>Cantidad</th><th className={THN}>Costo unit. (neto)</th><th className={THN}>IVA</th>
              <th className={THN}>Neto</th><th className={THN}>IVA $</th>{borrador && <th />}
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>Todavía no hay líneas.</td></tr>}
            {lineas.map((l) => editar === l.id ? (
              <tr key={l.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={7} className={TD}>
                  <form action={accionGuardarLinea} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={l.id} /><input type="hidden" name="factura" value={fid} />
                    <input name="descripcion" defaultValue={l.descripcion} className={`${CAMPO} flex-1 min-w-48`} aria-label="Descripción" autoFocus />
                    <CampoNumero name="cantidad" valor={l.cantidad} tipo="decimal" className={`${CAMPO} w-20`} placeholder="Cantidad" />
                    <CampoNumero name="costo_unit" valor={l.costo_unit} tipo="decimal" className={`${CAMPO} w-28`} placeholder="Costo unit." />
                    <SelectIva valor={l.iva_pct} />
                    <button className={VERDE}>Guardar</button>
                    <Link href={aqui()} className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={l.id} className={TR}>
                <td className={TD}>{l.descripcion}{!l.variacion_id && <span className="text-[10px] text-[#5C6B76]"> (sin producto)</span>}</td>
                <td className={TDN}>{l.cantidad.toLocaleString("es-AR")}</td>
                <td className={TDN}>{formatear(l.costo_unit, m)}</td>
                <td className={TDN}>{pct(l.iva_pct)}</td>
                <td className={TDN}>{formatear(l.neto, m)}</td>
                <td className={TDN}>{formatear(l.iva, m)}</td>
                {borrador && (
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <span className="inline-flex gap-1">
                      <Lapiz href={aqui({ editar: l.id })} />
                      <TachoConfirmar accion={accionBorrarLinea} campos={{ id: String(l.id), factura: String(fid) }} pregunta="¿Borrar?" />
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {borrador && (
        <div className={`${CAJA} mb-4 grid gap-2`} id="agregar">
          <h3 className="text-xs font-bold">Agregar línea</h3>
          <form className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-48"><span className={ETIQUETA}>Buscar producto por SKU, código o título</span>
              <input name="q" defaultValue={q} className={`${CAMPO} w-full`} /></label>
            <MostrarInactivos activo={verInactivos(sp)} />
            <button className={SUAVE}>Buscar</button>
          </form>
          <form action={accionAgregarLinea} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="factura" value={fid} />
            <label className="min-w-56 flex-1"><span className={ETIQUETA}>Producto</span>
              <select name="variacion" defaultValue={encontradas.length === 1 ? encontradas[0].id : ""} className={`${CAMPO} w-full`}>
                <option value="">— Línea libre (sin producto: no mueve stock) —</option>
                {encontradas.map((v) => <option key={v.id} value={v.id}>{v.sku} · {v.titulo}</option>)}
              </select></label>
            <label className="min-w-48 flex-1"><span className={ETIQUETA}>Descripción (si es libre)</span>
              <input name="descripcion" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Cantidad</span>
              <CampoNumero name="cantidad" valor={1} tipo="decimal" className={`${CAMPO} w-20`} /></label>
            <label><span className={ETIQUETA}>Costo unit. neto ({m === "USD" ? "US$" : "$"})</span>
              <CampoNumero name="costo_unit" valor={null} tipo="decimal" className={`${CAMPO} w-28`} /></label>
            <label><span className={ETIQUETA}>IVA</span><SelectIva valor={ivaPorDefecto} /></label>
            <BotonEnviar clase={PRIMARIO} corriendo="Agregando…">Agregar</BotonEnviar>
          </form>
          {q && encontradas.length === 0 && <p className="text-[11px] text-[#8a6100]">No hay productos con “{q}”.</p>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <h2 className="text-sm font-bold mb-2">IVA por alícuota</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Alícuota</th><th className={THN}>Neto gravado</th><th className={THN}>IVA</th></tr></thead>
              <tbody>
                {f.iva_detalle.length === 0 && <tr><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Sin líneas.</td></tr>}
                {f.iva_detalle.map((a) => (
                  <tr key={a.pct} className={TR}><td className={TD}>{pct(a.pct)}</td><td className={TDN}>{formatear(a.base, m)}</td><td className={TDN}>{formatear(a.importe, m)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={`${CAJA} text-xs grid grid-cols-[1fr_auto] gap-y-1 self-start`}>
          <span className="text-[#5C6B76]">Neto</span><span className="text-right tabular-nums">{formatear(f.neto, m)}</span>
          <span className="text-[#5C6B76]">IVA</span><span className="text-right tabular-nums">{formatear(f.iva, m)}</span>
          {f.percepcion_iva > 0 && <><span className="text-[#5C6B76]">Percepción IVA</span><span className="text-right tabular-nums">{formatear(f.percepcion_iva, m)}</span></>}
          {f.percepcion_iibb > 0 && <><span className="text-[#5C6B76]">Percepción IIBB</span><span className="text-right tabular-nums">{formatear(f.percepcion_iibb, m)}</span></>}
          {f.otros_impuestos > 0 && <><span className="text-[#5C6B76]">Otros impuestos</span><span className="text-right tabular-nums">{formatear(f.otros_impuestos, m)}</span></>}
          {f.no_gravado > 0 && <><span className="text-[#5C6B76]">No gravado</span><span className="text-right tabular-nums">{formatear(f.no_gravado, m)}</span></>}
          <span className="font-bold">Total</span><span className="text-right tabular-nums font-bold">{formatear(f.total, m)}</span>
          {m === "USD" && <>
            <span className="text-[#5C6B76]">En pesos</span>
            <span className="text-right tabular-nums">{formatear(borrador ? Math.round(f.total * f.cotizacion * 100) / 100 : f.total_ars, "ARS")}</span>
          </>}
        </div>
      </div>

      {borrador && (
        <div className="grid gap-1 justify-items-start">
          <BotonConfirmar accion={accionRegistrarFactura} campos={{ id: String(fid) }} clase={VERDE} texto="Registrar"
            pregunta="¿Registrar? Después no se puede cambiar." corriendo="Registrando…" />
          <p className="text-[11px] text-[#5C6B76]">Ingresa el stock al depósito, actualiza el costo y deja la deuda en la cuenta corriente del proveedor.</p>
        </div>
      )}
      {!borrador && (
        <Link href={`/administracion/cuentas-corrientes?tercero=proveedor&id=${f.proveedor_id}`} className={SUAVE}>Estado de cuenta del proveedor</Link>
      )}
    </Pantalla>
  );
}
