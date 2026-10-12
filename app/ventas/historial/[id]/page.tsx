// Una venta de Mercado Libre (de ml_venta), con o sin pedido en Laucen: lo guardado (artículos, precios, comisión) y,
// leído en el momento de Mercado Libre, el estado de la orden, el envío, los mensajes con el comprador y los reclamos o
// devoluciones. Sólo para consultar: no cambia nada ni marca mensajes como leídos.

import Link from "next/link";
import { notFound } from "next/navigation";
import FotosProducto from "@/app/componentes/FotosProducto";
import { entrarErp, Pantalla, Dato, Estado, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, TituloSeccion } from "@/app/componentes/erp";
import { ventaMl, enVivo } from "@/lib/mercadolibre/venta-detalle";
import { formatearNumero } from "@/lib/numeros";
import { fechaHora } from "@/app/ventas/formato";
import { ESTADOS_VENTA } from "../lista";

export const dynamic = "force-dynamic";

const pesos = (n: number | null | undefined) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const TIPOS: Record<string, string> = { gold_special: "Clásica", gold_pro: "Premium", gold_premium: "Premium", free: "Gratuita" };
const ENVIO: Record<string, string> = { delivered: "Entregado", shipped: "En camino", ready_to_ship: "Listo para despachar", handling: "Preparando", cancelled: "Cancelado", not_delivered: "No entregado", pending: "Pendiente" };
const RECLAMO: Record<string, string> = { opened: "Abierto", closed: "Cerrado" };

export default async function VentaMl({ params }: { params: Promise<{ id: string }> }) {
  const s = await entrarErp("pedidos_ver");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const d = await ventaMl(s.org.id, id);
  if (!d) notFound();
  const { venta: v, renglones } = d;
  const vivo = await enVivo(s.org.id, v).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }) as const);
  const total = renglones.reduce((a, r) => a + r.precio_unit * r.cantidad, 0);
  const comision = renglones.reduce((a, r) => a + (r.comision ?? 0), 0);
  const enlaceMl = `https://www.mercadolibre.com.ar/ventas/${v.pack_id ?? v.order_id}/detalle`;
  return (
    <Pantalla titulo={`Venta de Mercado Libre ${v.pack_id ?? v.order_id}`} camino={[{ texto: String(v.pack_id ?? v.order_id) }]}
      subtitulo={`${v.canal} · ${fechaHora(v.fecha)}${v.pedido_id ? "" : " · Sin pedido en Laucen (venta anterior: sólo para consultar)"}`}
      acciones={<a href={enlaceMl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]">Ver en Mercado Libre ↗</a>}>
      <div className={`${CAJA} mb-4 grid grid-cols-2 sm:grid-cols-6 gap-3`}>
        <Dato etiqueta="Estado">{ESTADOS_VENTA[v.estado] ?? v.estado}</Dato>
        <Dato etiqueta="Comprador">{v.cliente_id ? <Link href={`/ventas/clientes/${v.cliente_id}`} className="text-[#16577F] hover:underline">{v.comprador ?? v.comprador_id}</Link> : v.comprador ?? v.comprador_id ?? "—"}</Dato>
        <Dato etiqueta="Pedido en Laucen">{v.pedido_id ? <Link href={`/ventas/pedidos/${v.pedido_id}`} className="text-[#16577F] hover:underline">{v.pedido_id}</Link> : "Sin pedido"}</Dato>
        <Dato etiqueta="Total" numero>{pesos(total)}</Dato>
        <Dato etiqueta="Comisión de ML" numero>{pesos(comision)}</Dato>
        <Dato etiqueta="Venta / carrito de ML">{v.pack_id ? `${v.pack_id} (carrito)` : v.order_id}</Dato>
      </div>

      <TituloSeccion titulo={`Artículos (${renglones.length})`} />
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Producto</th><th className={TH}>Publicación</th><th className={TH}>Tipo</th><th className={THN}>Cantidad</th><th className={THN}>Precio</th><th className={THN}>Total</th><th className={THN}>Comisión</th></tr></thead>
          <tbody>
            {renglones.map((r) => (
              <tr key={r.id} className={TR}>
                <td className={TD}>
                  <span className="inline-flex items-center gap-2 align-middle">
                    <FotosProducto fotos={r.fotos} titulo={r.titulo ?? ""} />
                    {r.producto_id ? <Link href={`/catalogo/productos/${r.producto_id}`} className="font-mono text-[#16577F] hover:underline">{r.sku}</Link> : <span className="font-mono">{r.sku ?? "—"}</span>}
                  </span>{" "}<span className="text-[#5C6B76]">{r.titulo}</span>
                </td>
                <td className={TD}><Link href={`/informes/cambios-publicaciones/${encodeURIComponent(r.item_id)}`} className="font-mono text-[#16577F] hover:underline">{r.item_id}</Link>{" "}
                  <a href={`https://articulo.mercadolibre.com.ar/${r.item_id.replace(/^MLA/, "MLA-")}`} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a></td>
                <td className={TD}>{TIPOS[r.tipo_publicacion ?? ""] ?? r.tipo_publicacion ?? "—"}</td>
                <td className={TDN}>{formatearNumero(r.cantidad, "entero")}</td>
                <td className={TDN}>{pesos(r.precio_unit)}</td>
                <td className={TDN}>{pesos(r.precio_unit * r.cantidad)}</td>
                <td className={TDN}>{pesos(r.comision)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {"error" in vivo ? (
        <p className="text-xs text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2">No se pudo leer de Mercado Libre: {vivo.error}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className={CAJA}>
            <TituloSeccion titulo="Envío" />
            {vivo.envio ? (
              <div className="grid grid-cols-2 gap-3">
                <Dato etiqueta="Estado">{ENVIO[vivo.envio.status ?? ""] ?? vivo.envio.status ?? "—"}</Dato>
                <Dato etiqueta="Seguimiento">{vivo.envio.tracking_number ?? "—"}</Dato>
                <Dato etiqueta="Despachado">{vivo.envio.status_history?.date_shipped ? fechaHora(vivo.envio.status_history.date_shipped) : "—"}</Dato>
                <Dato etiqueta="Entregado">{vivo.envio.status_history?.date_delivered ? fechaHora(vivo.envio.status_history.date_delivered) : "—"}</Dato>
              </div>
            ) : <p className="text-xs text-[#5C6B76]">{v.envio_id ? `Mercado Libre no devolvió el envío${vivo.envioError ? ` (${vivo.envioError})` : ""}.` : "Sin envío de Mercado Libre."}</p>}
          </section>
          <section className={CAJA}>
            <TituloSeccion titulo={`Reclamos y devoluciones (${vivo.reclamos.length})`} />
            {vivo.reclamosError && <p className="text-xs text-[#C03420]">No se pudieron leer: {vivo.reclamosError}</p>}
            {!vivo.reclamosError && vivo.reclamos.length === 0 && <p className="text-xs text-[#5C6B76]">Sin reclamos.</p>}
            {vivo.reclamos.map((c) => (
              <div key={c.id} className="text-xs border-t border-[#E3E9F0] py-1.5 first:border-t-0">
                <Link href={`/ventas/reclamos/ml/${c.id}`} className="font-mono text-[#16577F] hover:underline">{c.id}</Link>{" "}
                <Estado texto={RECLAMO[c.estado ?? ""] ?? c.estado ?? "—"} tono={c.estado === "opened" ? "rojo" : "gris"} />{c.devolucion && <> <Estado texto="Con devolución" tono="ambar" /></>}
                <span className="text-[#5C6B76]"> · {c.fecha ? fechaHora(c.fecha) : ""} · {c.tipo ?? ""} {c.motivo ?? ""}</span>
              </div>
            ))}
          </section>
          <section className={`${CAJA} lg:col-span-2`}>
            <TituloSeccion titulo={`Mensajes con el comprador (${vivo.mensajes.length})`} />
            {vivo.mensajesError && <p className="text-xs text-[#C03420]">No se pudieron leer: {vivo.mensajesError}</p>}
            {!vivo.mensajesError && vivo.mensajes.length === 0 && <p className="text-xs text-[#5C6B76]">Sin mensajes.</p>}
            <div className="flex flex-col gap-2 max-h-[32rem] overflow-auto">
              {vivo.mensajes.map((m, i) => (
                <div key={i} className={`max-w-[80%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${m.de === "vendedor" ? "self-end bg-[#DCF3E6]" : "self-start bg-[#F1F4F7]"}`}>
                  <span className="block text-[10px] text-[#5C6B76] mb-0.5">{m.de === "vendedor" ? "Nosotros" : "Comprador"} · {m.fecha ? fechaHora(m.fecha) : ""}</span>
                  {m.texto}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Pantalla>
  );
}
