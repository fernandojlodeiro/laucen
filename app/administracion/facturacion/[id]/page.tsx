// Detalle de un comprobante: cabecera, líneas, IVA por alícuota, CAE, lo que
// contestó ARCA y el XML de ida y vuelta. Desde acá se anula una factura con
// nota de crédito o se reintenta un rechazado.

import Link from "next/link";
import { notFound } from "next/navigation";
import { una, consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { DOC_TIPOS, CONDICION_RECEPTOR_TEXTO } from "@/lib/arca/facturar";
import { SUAVE, APAGAR, DESPLEGABLE, FLECHA } from "@/app/botones";
import { BotonEnviar, BotonConfirmar } from "@/app/radar/Cliente";
import {
  entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAJA, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha, fechaHora } from "@/app/ventas/formato";
import { ESTADOS_CBTE, numeroCbte, nombreTipo, type EstadoCbte } from "../comun";
import { accionReintentar } from "../acciones";
import { accionAnular } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

type Cbte = {
  id: number; pedido_id: number | null; cliente_id: number | null; ambiente: string; tipo_cbte: number; punto_venta: number; numero: string | null;
  fecha: Date; doc_tipo: number; doc_nro: string; receptor_nombre: string | null; receptor_condicion_iva: number | null; receptor_domicilio: string | null;
  importe_total: number; importe_neto: number; importe_iva: number; iva_detalle: { pct: number; base: number; importe: number }[];
  asociado_id: number | null; estado: EstadoCbte; cae: string | null; cae_vto: Date | null; observaciones: string | null; intentos: number;
  pedido_a_arca: { xml?: string } | null; respuesta_arca: { xml?: string } | null; creado_ts: Date; autorizado_ts: Date | null;
};
type Relacionado = { id: number; tipo_cbte: number; punto_venta: number; numero: string | null; estado: EstadoCbte };

/** El XML sin el token y la firma del login de ARCA (siguen sirviendo unas horas). */
const sinCredenciales = (xml: string) =>
  xml.replace(/<((?:\w+:)?(?:Token|Sign))>[\s\S]*?<\/\1>/g, "<$1>(oculto)</$1>");

const pct = (n: number) => `${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;

export default async function DetalleComprobante({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("facturacion_ver");
  const { id } = await params;
  const sp = await searchParams;
  const cid = Number(id);
  if (!Number.isInteger(cid) || cid <= 0) notFound();
  const c = await una<Cbte>(`
    select id::int, pedido_id::int, cliente_id::int, ambiente, tipo_cbte, punto_venta, numero::text, fecha, doc_tipo, doc_nro, receptor_nombre,
           receptor_condicion_iva, receptor_domicilio, importe_total::float importe_total, importe_neto::float importe_neto,
           importe_iva::float importe_iva, iva_detalle, comprobante_asociado_id::int asociado_id, estado, cae, cae_vto, observaciones, intentos,
           pedido_a_arca, respuesta_arca, creado_ts, autorizado_ts
      from comprobante where id = $1 and organizacion_id = $2`, [cid, s.org.id]);
  if (!c) notFound();
  const [lineas, notas, asociado] = await Promise.all([
    consulta<{ id: number; descripcion: string; cantidad: number; precio_unit: number; iva_pct: number; neto: number; iva: number; total: number }>(`
      select id::int, descripcion, cantidad::float, precio_unit::float, iva_pct::float, neto::float, iva::float, total::float
        from comprobante_linea where comprobante_id = $1 and organizacion_id = $2 order by orden, id`, [cid, s.org.id]),
    consulta<Relacionado>(`select id::int, tipo_cbte, punto_venta, numero::text, estado from comprobante
                            where comprobante_asociado_id = $1 and organizacion_id = $2 order by id`, [cid, s.org.id]),
    c.asociado_id ? una<Relacionado>("select id::int, tipo_cbte, punto_venta, numero::text, estado from comprobante where id = $1 and organizacion_id = $2",
      [c.asociado_id, s.org.id]) : null,
  ]);
  const est = ESTADOS_CBTE[c.estado] ?? ESTADOS_CBTE.pendiente;
  const esFactura = [1, 6, 11].includes(c.tipo_cbte);
  const ncViva = notas.some((n) => n.estado !== "rechazado");
  const volver = `/administracion/facturacion/${cid}`;
  const discrimina = c.iva_detalle.length > 0;
  const Dato = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <div><span className={ETIQUETA}>{t}</span><div className="text-xs">{children}</div></div>
  );
  const Rel = ({ r }: { r: Relacionado }) => (
    <Link href={`/administracion/facturacion/${r.id}`} className="text-[#16577F] hover:underline">
      {nombreTipo(r.tipo_cbte)} {numeroCbte(r.punto_venta, r.numero)}
    </Link>
  );

  return (
    <Pantalla ancho="max-w-5xl"
      titulo={<>{nombreTipo(c.tipo_cbte)} <span className="font-mono">{numeroCbte(c.punto_venta, c.numero)}</span></>}
      camino={[{ texto: `${nombreTipo(c.tipo_cbte)} ${numeroCbte(c.punto_venta, c.numero)}` }]}
      subtitulo={<>{fecha(c.fecha)}
        {c.ambiente === "homologacion" && " · homologación (prueba, sin validez fiscal)"}</>}
      acciones={<>
        {c.estado === "autorizado" && <a href={`/administracion/facturacion/${cid}/pdf`} target="_blank" rel="noopener" className={SUAVE}>PDF</a>}
        {(c.estado === "rechazado" || c.estado === "error") && (
          <form action={accionReintentar}>
            <input type="hidden" name="id" value={cid} /><input type="hidden" name="volver" value={volver} />
            <BotonEnviar clase={SUAVE} corriendo="Mandando…">Reintentar</BotonEnviar>
          </form>
        )}
        {c.estado === "autorizado" && esFactura && !ncViva && (
          <BotonConfirmar accion={accionAnular} campos={{ id: String(cid) }} clase={APAGAR} texto="Anular con nota de crédito"
            pregunta="¿Anular? Se emite una nota de crédito por el total." corriendo="Emitiendo…" />
        )}
      </>}>
      <Avisos sp={sp} />

      <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4`}>
        <Dato t="Estado"><Estado texto={est.texto} tono={est.tono} />{c.intentos > 1 && <span className="text-[#5C6B76]"> · {c.intentos} intentos</span>}</Dato>
        <Dato t="CAE"><span className="font-mono">{c.cae ?? "—"}</span>{c.cae_vto && <div className="text-[#5C6B76]">vence {fecha(c.cae_vto)}</div>}</Dato>
        <Dato t="Total"><span className="font-bold tabular-nums">{formatear(c.importe_total, "ARS")}</span></Dato>
        <Dato t="Pedido">{c.pedido_id ? <Link href={`/ventas/pedidos/${c.pedido_id}`} className="text-[#16577F] hover:underline">{c.pedido_id}</Link> : "—"}</Dato>
        <Dato t="Receptor">
          {c.cliente_id ? <Link href={`/ventas/clientes/${c.cliente_id}`} className="font-semibold text-[#16577F] hover:underline">{c.receptor_nombre ?? "—"}</Link> : (c.receptor_nombre ?? "—")}
          {c.receptor_domicilio && <div className="text-[#5C6B76]">{c.receptor_domicilio}</div>}
        </Dato>
        <Dato t="Documento">{c.doc_tipo === 99 ? "Consumidor final" : `${DOC_TIPOS[c.doc_tipo] ?? c.doc_tipo} ${c.doc_nro}`}</Dato>
        <Dato t="Condición IVA">{c.receptor_condicion_iva ? CONDICION_RECEPTOR_TEXTO[c.receptor_condicion_iva] ?? c.receptor_condicion_iva : "—"}</Dato>
        <Dato t="Creado">{fechaHora(c.creado_ts)}{c.autorizado_ts && <div className="text-[#5C6B76]">autorizado {fechaHora(c.autorizado_ts)}</div>}</Dato>
        {asociado && <div className="col-span-2"><Dato t="Anula a"><Rel r={asociado} /></Dato></div>}
        {notas.length > 0 && <div className="col-span-2"><Dato t="Notas de crédito">
          {notas.map((n) => <div key={n.id}><Rel r={n} /> <Estado texto={ESTADOS_CBTE[n.estado]?.texto ?? n.estado} tono={ESTADOS_CBTE[n.estado]?.tono ?? "gris"} /></div>)}
        </Dato></div>}
      </div>

      {c.observaciones && (
        <p className={`text-xs rounded-lg px-3 py-2 mb-4 ${c.estado === "rechazado" ? "bg-[#FDF1EF] text-[#C03420]" : c.estado === "error" ? "bg-[#FFF8E5] text-[#8a6100]" : "bg-[#EEF3F8] text-[#16577F]"}`}>
          <b>ARCA:</b> {c.observaciones}
        </p>
      )}

      <h2 className="text-sm font-bold mb-2">Líneas</h2>
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Descripción</th><th className={THN}>Cantidad</th><th className={THN}>Unitario (con IVA)</th>
              {discrimina && <><th className={THN}>IVA</th><th className={THN}>Neto</th><th className={THN}>IVA $</th></>}
              <th className={THN}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id} className={TR}>
                <td className={TD}>{l.descripcion}</td>
                <td className={TDN}>{l.cantidad.toLocaleString("es-AR")}</td>
                <td className={TDN}>{formatear(l.precio_unit, "ARS")}</td>
                {discrimina && <><td className={TDN}>{pct(l.iva_pct)}</td><td className={TDN}>{formatear(l.neto, "ARS")}</td><td className={TDN}>{formatear(l.iva, "ARS")}</td></>}
                <td className={TDN}>{formatear(l.total, "ARS")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <h2 className="text-sm font-bold mb-2">IVA por alícuota</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Alícuota</th><th className={THN}>Neto gravado</th><th className={THN}>IVA</th></tr></thead>
              <tbody>
                {!discrimina && <tr><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Comprobante C: no discrimina IVA.</td></tr>}
                {c.iva_detalle.map((a, i) => (
                  <tr key={i} className={TR}>
                    <td className={TD}>{pct(a.pct)}</td>
                    <td className={TDN}>{formatear(a.base, "ARS")}</td>
                    <td className={TDN}>{formatear(a.importe, "ARS")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={`${CAJA} text-xs grid grid-cols-[1fr_auto] gap-y-1 self-start`}>
          <span className="text-[#5C6B76]">Neto</span><span className="text-right tabular-nums">{formatear(c.importe_neto, "ARS")}</span>
          <span className="text-[#5C6B76]">IVA</span><span className="text-right tabular-nums">{formatear(c.importe_iva, "ARS")}</span>
          <span className="font-bold">Total</span><span className="text-right tabular-nums font-bold">{formatear(c.importe_total, "ARS")}</span>
        </div>
      </div>

      {(c.pedido_a_arca?.xml || c.respuesta_arca?.xml) && (
        <details className="group">
          <summary className={DESPLEGABLE}>Lo que se mandó y lo que contestó ARCA (XML) <span className={FLECHA}>▾</span></summary>
          <div className="grid gap-3 mt-2">
            {c.pedido_a_arca?.xml && <div><span className={ETIQUETA}>Enviado</span><pre className="text-[10px] bg-[#FAFBFC] border border-[#E3E9F0] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">{sinCredenciales(c.pedido_a_arca.xml)}</pre></div>}
            {c.respuesta_arca?.xml && <div><span className={ETIQUETA}>Recibido</span><pre className="text-[10px] bg-[#FAFBFC] border border-[#E3E9F0] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">{sinCredenciales(c.respuesta_arca.xml)}</pre></div>}
          </div>
        </details>
      )}
    </Pantalla>
  );
}
