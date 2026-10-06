// Nota de crédito de una factura emitida FUERA de Laucen (ventas de Virtual
// Seller que vuelven; bitácora #341). Paso 1: tipo, punto de venta y número
// de la factura → se busca en ARCA. Paso 2: cliente, líneas (total o
// parcial) y "Emitir nota de crédito" arriba a la derecha.

import Link from "next/link";
import { ErrorErp, motivoErp } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { emisoresDe, DOC_TIPOS, CONDICION_RECEPTOR, CONDICION_RECEPTOR_TEXTO } from "@/lib/arca/facturar";
import { buscarFacturaExterna, notasDeFacturaExterna, LINEAS_NC, NC_DE, type FacturaExterna } from "@/lib/arca/nota-credito-externa";
import { PRIMARIO, VERDE } from "@/app/botones";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, Avisos, Estado, Dato, CAJA, CAMPO, ETIQUETA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD } from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import { ESTADOS_CBTE, numeroCbte, nombreTipo, type EstadoCbte } from "../comun";
import { accionNotaCreditoExterna } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { rs?: string; tipo?: string; pv?: string; nro?: string; monto?: string; ref?: string; cliente?: string; reclamo?: string; ok?: string; error?: string };

const ALICUOTAS = [21, 10.5, 27, 5, 2.5, 0];

export default async function NotaCreditoExterna({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("facturacion_ver");
  const sp = await searchParams;
  const razones = await emisoresDe(s.org.id);
  const rs = razones.find((r) => String(r.id) === sp.rs) ?? razones[0] ?? null;
  const tipo = Number(sp.tipo ?? 6);
  const pv = Number(sp.pv), nro = Number(sp.nro);

  let f: FacturaExterna | null = null;
  let problema: string | null = null;
  if (rs && sp.pv && sp.nro) {
    try {
      f = await buscarFacturaExterna(s.org.id, rs.id, tipo, pv, nro);
    } catch (e) {
      problema = e instanceof ErrorErp ? e.message : motivoErp(e);
    }
  }
  const notas = f ? await notasDeFacturaExterna(s.org.id, f.emisorId, tipo, pv, nro) : [];
  const disponible = f ? Math.round((f.total - f.devuelto) * 100) / 100 : 0;
  const conIva = tipo !== 11;
  const nombreFactura = `${nombreTipo(tipo)} ${numeroCbte(pv, nro)}`;

  // Líneas propuestas: la factura entera (una por alícuota) o, si ya hubo
  // devoluciones o vino un monto (desde un reclamo), una sola por lo que queda.
  const monto = Number(sp.monto);
  const desc = `Devolución — ${nombreFactura}${sp.ref ? ` (${sp.ref})` : ""}`;
  const propuestas = !f ? [] : f.devuelto === 0 && !(monto > 0)
    ? f.porAlicuota.map((a) => ({ desc, cant: 1, precio: a.total, iva: a.pct }))
    : [{ desc, cant: 1, precio: Math.min(monto > 0 ? monto : disponible, disponible), iva: f.porAlicuota[0]?.pct ?? 21 }];
  const clienteId = sp.cliente ? Number(sp.cliente) : f?.cliente?.id ?? null;
  const condicionDefecto = f?.cliente?.condicion_iva ? CONDICION_RECEPTOR[f.cliente.condicion_iva] ?? 5 : tipo === 1 ? 1 : 5;
  const emitible = !!f && disponible > 0;

  return (
    <Pantalla titulo="Nota de crédito de una factura de afuera" ancho="max-w-4xl"
      subtitulo="Para devolver una venta facturada antes de Laucen (por ejemplo, en Virtual Seller): la factura se busca en ARCA"
      camino={[{ texto: "Nueva nota de crédito" }]}
      acciones={emitible ? <button type="submit" form="nc" className={VERDE}>Emitir nota de crédito</button> : undefined}>
      <Avisos sp={sp} />
      {!rs && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">
          Todavía no están cargados los datos para facturar. <Link href="/config/arca" className="font-bold underline">Ir a Configuración</Link>
        </p>
      )}

      {rs && (
        <form className={`${CAJA} flex flex-wrap items-end gap-2 mb-4`}>
          {sp.monto && <input type="hidden" name="monto" value={sp.monto} />}
          {sp.ref && <input type="hidden" name="ref" value={sp.ref} />}
          {sp.cliente && <input type="hidden" name="cliente" value={sp.cliente} />}
          {sp.reclamo && <input type="hidden" name="reclamo" value={sp.reclamo} />}
          {razones.length > 1 ? (
            <label><span className={ETIQUETA}>Razón social que la emitió</span>
              <select name="rs" defaultValue={rs.id} className={CAMPO}>
                {razones.map((r) => <option key={r.id} value={r.id}>{r.nombre || r.razon_social}</option>)}
              </select></label>
          ) : <input type="hidden" name="rs" value={rs.id} />}
          <label><span className={ETIQUETA}>Factura</span>
            <select name="tipo" defaultValue={tipo} className={CAMPO}>
              {Object.keys(NC_DE).map((t) => <option key={t} value={t}>{nombreTipo(Number(t))}</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Punto de venta</span>
            <input name="pv" defaultValue={sp.pv ?? ""} inputMode="numeric" required className={`${CAMPO} w-24 text-right`} /></label>
          <label><span className={ETIQUETA}>Número</span>
            <input name="nro" defaultValue={sp.nro ?? ""} inputMode="numeric" required className={`${CAMPO} w-32 text-right`} /></label>
          <button className={PRIMARIO}>Buscar en ARCA</button>
          {sp.ref && <span className="text-[11px] text-[#5C6B76] self-center">Para: {sp.ref}</span>}
        </form>
      )}

      {problema && <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FDECEA] text-[#C03420]">{problema}</p>}

      {f && (
        <>
          <h2 className="text-sm font-bold mb-2">La factura, según ARCA</h2>
          <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4`}>
            <Dato etiqueta="Factura">{nombreFactura}</Dato>
            <Dato etiqueta="Fecha">{f.fecha ? fecha(new Date(`${f.fecha}T12:00:00`)) : null}</Dato>
            <Dato etiqueta="Documento del comprador">{f.docTipo === 99 ? "Consumidor final" : `${DOC_TIPOS[f.docTipo] ?? f.docTipo} ${f.docNro}`}</Dato>
            <Dato etiqueta="Total" numero>{formatear(f.total, "ARS")}</Dato>
            <Dato etiqueta="Ya devuelto con notas de crédito" numero>{formatear(f.devuelto, "ARS")}</Dato>
            <Dato etiqueta="Queda por devolver" numero>{formatear(disponible, "ARS")}</Dato>
            <Dato etiqueta="Condición frente al IVA">{f.condicionIvaReceptor ? CONDICION_RECEPTOR_TEXTO[f.condicionIvaReceptor] : null}</Dato>
            <Dato etiqueta="Razón social">{f.nombre}</Dato>
          </div>

          {notas.length > 0 && (
            <div className={`${CAJA_TABLA} mb-4`}>
              <table className={TABLA}>
                <thead className={THEAD}><tr><th className={TH}>Notas de crédito de esta factura</th><th className={TH}>Estado</th><th className={THN}>Total</th></tr></thead>
                <tbody>
                  {notas.map((n) => {
                    const e = ESTADOS_CBTE[n.estado as EstadoCbte] ?? ESTADOS_CBTE.pendiente;
                    return (
                      <tr key={n.id} className={TR}>
                        <td className={TD}><Link href={`/administracion/facturacion/${n.id}`} className="text-[#16577F] hover:underline">{nombreTipo(n.tipo_cbte)} {numeroCbte(n.punto_venta, n.numero)}</Link></td>
                        <td className={TD}><Estado texto={e.texto} tono={e.tono} /></td>
                        <td className={`${TD} text-right tabular-nums`}>{formatear(n.importe_total, "ARS")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {disponible <= 0 ? (
            <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#EEF3F8] text-[#16577F]">Esta factura ya está devuelta entera con notas de crédito.</p>
          ) : (
            <form id="nc" action={accionNotaCreditoExterna} className="space-y-4">
              <input type="hidden" name="rs" value={f.emisorId} /><input type="hidden" name="tipo" value={tipo} />
              <input type="hidden" name="pv" value={pv} /><input type="hidden" name="nro" value={nro} />
              {sp.reclamo && <input type="hidden" name="reclamo" value={sp.reclamo} />}
              <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start`}>
                <label><span className={ETIQUETA}>N.º de cliente (opcional)</span>
                  <input name="cliente" defaultValue={clienteId ?? ""} inputMode="numeric" className={`${CAMPO} w-full text-right`} />
                  <span className="block text-[11px] text-[#5C6B76] mt-0.5">
                    {f.cliente ? <>Con ese documento está <Link href={`/ventas/clientes/${f.cliente.id}`} className="text-[#16577F] hover:underline">{f.cliente.nombre}</Link>.</> : "Ningún cliente de Laucen tiene ese documento."}
                    {" "}Con cuenta corriente, la nota de crédito le entra como crédito.</span></label>
                <label><span className={ETIQUETA}>Nombre del receptor</span>
                  <input name="receptor" defaultValue={f.cliente?.nombre ?? ""} placeholder="El del cliente, o Consumidor final" className={`${CAMPO} w-full`} /></label>
                {f.condicionIvaReceptor ? null : (
                  <label><span className={ETIQUETA}>Condición frente al IVA</span>
                    <select name="condicion" defaultValue={condicionDefecto} className={`${CAMPO} w-full`}>
                      {Object.entries(CONDICION_RECEPTOR_TEXTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <span className="block text-[11px] text-[#5C6B76] mt-0.5">La factura vieja no la tiene: elegila.</span></label>
                )}
              </div>

              <div className={CAJA_TABLA}>
                <table className={TABLA}>
                  <thead className={THEAD}><tr>
                    <th className={TH}>Qué se devuelve</th><th className={THN}>Cantidad</th><th className={THN}>Precio unitario (con IVA)</th>
                    {conIva && <th className={THN}>IVA</th>}
                  </tr></thead>
                  <tbody>
                    {Array.from({ length: LINEAS_NC }, (_, i) => {
                      const p = propuestas[i];
                      return (
                        <tr key={i} className={TR}>
                          <td className={TD}><input name={`desc${i}`} defaultValue={p?.desc ?? ""} className={`${CAMPO} w-full`} /></td>
                          <td className={`${TD} w-24`}><CampoNumero name={`cant${i}`} valor={p?.cant ?? null} tipo="decimal" className="w-full" /></td>
                          <td className={`${TD} w-40`}><CampoNumero name={`precio${i}`} valor={p?.precio ?? null} tipo="pesos" className="w-full" /></td>
                          {conIva ? (
                            <td className={`${TD} w-24`}>
                              <select name={`iva${i}`} defaultValue={p?.iva ?? f.porAlicuota[0]?.pct ?? 21} className={`${CAMPO} w-full text-right`}>
                                {ALICUOTAS.map((a) => <option key={a} value={a}>{a.toLocaleString("es-AR")} %</option>)}
                              </select></td>
                          ) : <input type="hidden" name={`iva${i}`} value="0" />}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[#5C6B76]">
                De entrada, la factura entera (o lo que queda por devolver). Para una devolución parcial, cambiá las cantidades o los precios: el total
                no puede pasar {formatear(disponible, "ARS")}. Sale una {nombreTipo(NC_DE[tipo])} asociada a la {nombreFactura}.
                La mercadería que vuelve se recibe aparte, en <Link href="/deposito/recepcion" className="text-[#16577F] hover:underline">Recepción</Link>.
              </p>
            </form>
          )}
        </>
      )}
    </Pantalla>
  );
}
