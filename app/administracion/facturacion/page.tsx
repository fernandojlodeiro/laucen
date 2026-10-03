// Facturación: los comprobantes emitidos (facturas y notas de crédito) con su
// estado en ARCA, filtros y reintento de los rechazados o con error.

import Link from "next/link";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { formatear } from "@/lib/moneda";
import { emisorDe, TIPOS_CBTE, DOC_TIPOS } from "@/lib/arca/facturar";
import { SUAVE, PRIMARIO } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import {
  entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import { ESTADOS_CBTE, numeroCbte, nombreTipo, type EstadoCbte } from "./comun";
import { accionReintentar } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { estado?: string; tipo?: string; desde?: string; hasta?: string; q?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

type Fila = {
  id: number; fecha: Date; tipo_cbte: number; punto_venta: number; numero: string | null; receptor_nombre: string | null;
  doc_tipo: number; doc_nro: string; importe_total: number; estado: EstadoCbte; cae: string | null; observaciones: string | null;
  pedido_id: number | null; pedido_externo: string | null; ambiente: string; cliente_id: number | null;
};

const esFecha = (x?: string) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);

export default async function Facturacion({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("facturacion_ver");
  const sp = await searchParams;
  const emisor = await emisorDe(s.org.id);

  const cond = ["c.organizacion_id = $1"];
  const vals: unknown[] = [s.org.id];
  const sumar = (sql: string, v: unknown) => { vals.push(v); cond.push(sql.replace("?", `$${vals.length}`)); };
  if (sp.estado && Object.hasOwn(ESTADOS_CBTE, sp.estado)) sumar("c.estado = ?", sp.estado);
  if (sp.tipo && TIPOS_CBTE[Number(sp.tipo)]) sumar("c.tipo_cbte = ?", Number(sp.tipo));
  if (esFecha(sp.desde)) sumar("c.fecha >= ?::date", sp.desde);
  if (esFecha(sp.hasta)) sumar("c.fecha <= ?::date", sp.hasta);
  const q = sp.q?.trim();
  if (q) {
    vals.push(`%${q}%`);
    const n = `$${vals.length}`;
    cond.push(`(lpad(c.punto_venta::text, 5, '0') || '-' || lpad(c.numero::text, 8, '0') ilike ${n} or c.numero::text = regexp_replace(${n}, '[^0-9]', '', 'g')
                or c.receptor_nombre ilike ${n} or c.doc_nro ilike ${n} or c.cae ilike ${n} or cl.nombre ilike ${n})`);
  }
  const { filas, total } = await consultaPaginada<Fila>({
    campos: `c.id::int, c.fecha, c.tipo_cbte, c.punto_venta, c.numero::text, coalesce(c.receptor_nombre, cl.nombre) receptor_nombre,
           c.doc_tipo, c.doc_nro, c.importe_total::float importe_total, c.estado, c.cae, c.observaciones,
           c.pedido_id::int, p.id_externo pedido_externo, c.ambiente, c.cliente_id::int`,
    desde: "comprobante c left join pedido p on p.id = c.pedido_id left join cliente cl on cl.id = c.cliente_id",
    donde: cond.join(" and "),
    orden: leerOrden(sp, {
      fecha: "c.fecha", tipo: "c.tipo_cbte", numero: "c.numero", receptor: "coalesce(c.receptor_nombre, cl.nombre)", documento: "c.doc_nro",
      total: "c.importe_total", estado: "c.estado", cae: "c.cae", pedido: "c.pedido_id",
    }, "c.fecha desc, c.id desc"),
  }, vals, sp);
  const volver = url("/administracion/facturacion", { estado: sp.estado, tipo: sp.tipo, desde: sp.desde, hasta: sp.hasta, q: sp.q });
  const hayFiltro = !!(sp.estado || sp.tipo || sp.desde || sp.hasta || q);

  return (
    <Pantalla titulo="Facturación" subtitulo="Facturas y notas de crédito electrónicas de ARCA"
      acciones={<Link href="/config/arca" className={SUAVE}>Configuración</Link>}>
      <Avisos sp={sp} />
      {!emisor && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">
          Todavía no están cargados los datos para facturar. <Link href="/config/arca" className="font-bold underline">Ir a Configuración</Link>
        </p>
      )}
      {emisor?.ambiente === "homologacion" && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#EEF3F8] text-[#16577F]">Modo prueba contra ARCA: los comprobantes salen pero no tienen validez fiscal.</p>
      )}

      <form className="flex flex-wrap items-end gap-2 mb-3">
        <label><span className={ETIQUETA}>Estado</span>
          <select name="estado" defaultValue={sp.estado ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_CBTE).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Tipo</span>
          <select name="tipo" defaultValue={sp.tipo ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            {Object.entries(TIPOS_CBTE).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select></label>
        <label><span className={ETIQUETA}>Desde</span><input type="date" name="desde" defaultValue={sp.desde ?? ""} className={CAMPO} /></label>
        <label><span className={ETIQUETA}>Hasta</span><input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className={CAMPO} /></label>
        <label className="flex-1 min-w-48"><span className={ETIQUETA}>Buscar</span>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Número, receptor, documento o CAE" className={`${CAMPO} w-full`} /></label>
        <button className={PRIMARIO}>Filtrar</button>
        {hayFiltro && <Link href="/administracion/facturacion" className={SUAVE}>Limpiar</Link>}
      </form>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="fecha" n porDefecto>Fecha</ThOrden><ThOrden col="tipo">Tipo</ThOrden><ThOrden col="numero" n>Número</ThOrden><ThOrden col="receptor">Receptor</ThOrden>
              <ThOrden col="documento">Documento</ThOrden><ThOrden col="total" n>Total</ThOrden><ThOrden col="estado">Estado</ThOrden><ThOrden col="cae">CAE</ThOrden>
              <ThOrden col="pedido" n>Pedido</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>{hayFiltro ? "Nada con esos filtros." : "Todavía no hay comprobantes."}</td></tr>}
            {filas.map((c) => {
              const est = ESTADOS_CBTE[c.estado] ?? ESTADOS_CBTE.pendiente;
              return (
                <tr key={c.id} className={TR}>
                  <td className={TDN}><Link href={`/administracion/facturacion/${c.id}`} className="hover:underline">{fecha(c.fecha)}</Link></td>
                  <td className={`${TD} whitespace-nowrap`}>{nombreTipo(c.tipo_cbte)}{c.ambiente === "homologacion" && <span className="text-[10px] text-[#5C6B76]"> (prueba)</span>}</td>
                  <td className={`${TDN} font-mono`}><Link href={`/administracion/facturacion/${c.id}`} className="font-semibold text-[#16577F] hover:underline">{numeroCbte(c.punto_venta, c.numero)}</Link></td>
                  <td className={TD}>{c.cliente_id ? <Link href={`/ventas/clientes/${c.cliente_id}`} className="text-[#16577F] hover:underline">{c.receptor_nombre ?? "—"}</Link> : c.receptor_nombre ?? "—"}</td>
                  <td className={`${TD} whitespace-nowrap`}>{c.doc_tipo === 99 ? "Consumidor final" : `${DOC_TIPOS[c.doc_tipo] ?? ""} ${c.doc_nro}`}</td>
                  <td className={TDN}>{formatear(c.importe_total, "ARS")}</td>
                  <td className={TD}>
                    <Estado texto={est.texto} tono={est.tono} />
                    {(c.estado === "rechazado" || c.estado === "error") && c.observaciones &&
                      <span className={`block text-[11px] mt-0.5 max-w-xs ${c.estado === "rechazado" ? "text-[#C03420]" : "text-[#8a6100]"}`}>{c.observaciones}</span>}
                  </td>
                  <td className={`${TD} font-mono`}>{c.cae ?? "—"}</td>
                  <td className={TDN}>{c.pedido_id ? <Link href={`/ventas/pedidos/${c.pedido_id}`} className="text-[#16577F] hover:underline">{c.pedido_id}</Link> : "—"}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {c.estado === "autorizado" && <a href={`/administracion/facturacion/${c.id}/pdf`} target="_blank" rel="noopener" className={SUAVE}>PDF</a>}
                    {(c.estado === "rechazado" || c.estado === "error") && (
                      <form action={accionReintentar}>
                        <input type="hidden" name="id" value={c.id} /><input type="hidden" name="volver" value={volver} />
                        <BotonEnviar clase={SUAVE} corriendo="Mandando…">Reintentar</BotonEnviar>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </Pantalla>
  );
}
