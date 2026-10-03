// Detalle de un pedido: cabecera, cliente, líneas, envío, historial de estados
// y los movimientos de stock que generó. Botones de operación: "Facturar" (en
// el bloque de facturación) y, para lo que no es de Mercado Libre, el bloque
// "Operación" (confirmar pago, estado siguiente, avisar por WhatsApp).

import Link from "next/link";
import FotosProducto from "@/app/componentes/FotosProducto";
import { formatear } from "@/lib/moneda";
import { notFound } from "next/navigation";
import { una, consulta } from "@/lib/erp/base";
import { enVista } from "@/lib/moneda";
import { pedidoCompleto, ESTADOS_PEDIDO, ESTADOS_PAGO, type EstadoPedido, type EstadoPago } from "@/lib/pedidos";
import { TIPOS_MOVIMIENTO, type TipoMovimiento } from "@/lib/stock";
import {
  entrarErp, Pantalla, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAJA, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha, fechaHora, TONO_ESTADO, TONO_PAGO, etiqueta } from "@/app/ventas/formato";
import { tienePermiso } from "@/lib/permisos";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { ESTADOS_CBTE, numeroCbte, nombreTipo, type EstadoCbte } from "@/app/administracion/facturacion/comun";
import { accionFacturar } from "./acciones";
import Operacion from "./Operacion";

export const dynamic = "force-dynamic";

type Linea = {
  id: number; variacion_id: number | null; sku: string | null; titulo: string; cantidad: number;
  precio_lista_ars: number | null; precio_lista_usd: number | null; descuento_pct: number; precio_unit_ars: number; precio_unit_usd: number;
  orden_ml: string | null;
};
type Historial = { estado_anterior: string | null; estado_nuevo: string; quien_nombre: string; nota: string | null; fecha: Date };
type Cabecera = {
  id: number; id_externo: string | null; fecha: Date; estado: EstadoPedido; moneda: string; total_ars: number; total_usd: number;
  medio_pago: string | null; estado_pago: EstadoPago; envio: Record<string, unknown> | null; notas: string | null; afecta_stock: boolean;
  canal: string; cliente_id: number | null; cliente: string | null; cliente_email: string | null; documento_tipo: string | null;
  documento_numero: string | null; deposito: string | null;
};

export default async function DetallePedido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; b?: string }> }) {
  const s = await entrarErp("pedidos_ver");
  const { id } = await params;
  const sp = await searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  const p = await pedidoCompleto(s.org.id, pid);
  if (!p) notFound();
  const c = p as unknown as Cabecera;
  const lineas = p.lineas as unknown as Linea[];
  const historial = p.historial as unknown as Historial[];
  // El producto (ficha y fotos) de cada variación del pedido.
  const productos = new Map((await consulta<{ variacion_id: number; producto_id: number; fotos: string[] | null }>(`
    select v.id::int variacion_id, v.producto_id::int,
           (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = v.producto_id) fotos
      from variacion v where v.organizacion_id = $1 and v.id = any($2::bigint[])`,
    [s.org.id, lineas.map((l) => l.variacion_id).filter((x): x is number => x != null)])).map((x) => [x.variacion_id, x]));
  const movimientos = await consulta<{
    id: number; fecha: Date; tipo: TipoMovimiento; cantidad: number; sku: string; producto_id: number; titulo: string; origen: string | null; destino: string | null;
    kit: string | null; nota: string | null;
  }>(`
    select m.id::int, m.fecha, m.tipo, m.cantidad, v.sku, v.producto_id::int, titulo_variacion(v.id) titulo,
           nullif(concat_ws(' · ', d1.nombre, u1.codigo), '') origen, nullif(concat_ws(' · ', d2.nombre, u2.codigo), '') destino,
           k.sku kit, m.nota
      from movimiento_stock m join variacion v on v.id = m.variacion_id
      left join ubicacion u1 on u1.id = m.ubicacion_origen_id left join deposito d1 on d1.id = u1.deposito_id
      left join ubicacion u2 on u2.id = m.ubicacion_destino_id left join deposito d2 on d2.id = u2.deposito_id
      left join variacion k on k.id = m.kit_variacion_id
     where m.organizacion_id = $1 and m.referencia_tipo = 'pedido' and m.referencia_id = $2
     order by m.fecha, m.id`, [s.org.id, String(pid)]);

  // El envío del canal (Mercado Envíos) y lo propio de ML, si lo hay.
  const envioMl = await una<{ id: number; logistica: string | null; metodo: string | null; estado: string | null; subestado: string | null;
    tracking: string | null; receptor: string | null; direccion: Record<string, string | null>; despachar_antes: Date | null; entrega_estimada: Date | null }>(`
    select id::int, logistica, metodo, estado, subestado, tracking, receptor, direccion, despachar_antes, entrega_estimada
      from envio where pedido_id = $1 and organizacion_id = $2 order by id desc limit 1`, [pid, s.org.id]);
  const ml = await una<{ comision: number | null; sin_vincular: boolean; pack: string | null }>(
    "select comision_ars::float comision, sin_vincular, envio ->> 'pack_id' pack from pedido where id = $1 and organizacion_id = $2", [pid, s.org.id]);
  const LOGISTICA: Record<string, string> = { fulfillment: "Full", self_service: "Flex", cross_docking: "Colecta", xd_drop_off: "Colecta", drop_off: "Despacho en correo", custom: "A convenir", not_specified: "A convenir" };
  const ESTADO_ENVIO: Record<string, string> = { ready_to_ship: "Listo para despachar", shipped: "En camino", delivered: "Entregado", not_delivered: "No entregado", cancelled: "Cancelado", pending: "Pendiente", handling: "En preparación" };
  const fechaCorta = (d: Date | null) => d ? d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  // Facturación: los comprobantes del pedido y si se puede facturar.
  const comprobantes = await consulta<{ id: number; tipo_cbte: number; punto_venta: number; numero: string | null; estado: EstadoCbte; observaciones: string | null }>(`
    select id::int, tipo_cbte, punto_venta, numero::text, estado, observaciones from comprobante
     where pedido_id = $1 and organizacion_id = $2 order by id`, [pid, s.org.id]);
  const puedeFacturar = tienePermiso(s.permisos, "facturacion_ver");
  const facturado = comprobantes.some((x) => [1, 6, 11].includes(x.tipo_cbte) && x.estado === "autorizado");
  const ofrecerFacturar = puedeFacturar && !facturado && !["nuevo", "cancelado"].includes(c.estado);

  const v = s.moneda;
  const unidades = lineas.reduce((t, l) => t + l.cantidad, 0);
  // Un carrito de Mercado Libre: cada línea dice de qué orden de ML vino.
  const variasOrdenes = new Set(lineas.map((l) => l.orden_ml).filter(Boolean)).size > 1;
  const envio = c.envio && Object.keys(c.envio).length ? c.envio : null;
  const Dato = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <div><span className={ETIQUETA}>{t}</span><div className="text-xs">{children}</div></div>
  );

  return (
    <Pantalla titulo={<>Pedido {c.id}{c.id_externo && <span className="font-mono font-normal text-sm text-[#5C6B76]"> · {c.id_externo}</span>}</>}
      camino={[{ texto: `Pedido ${c.id}` }]} subtitulo={<>{c.canal} · {fechaHora(c.fecha)}</>}>
      <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4`}>
        <Dato t="Estado"><Estado texto={etiqueta(ESTADOS_PEDIDO, c.estado)} tono={TONO_ESTADO[c.estado] ?? "gris"} /></Dato>
        <Dato t="Pago"><Estado texto={etiqueta(ESTADOS_PAGO, c.estado_pago)} tono={TONO_PAGO[c.estado_pago] ?? "gris"} />{c.medio_pago && <span className="ml-1">{c.medio_pago}</span>}</Dato>
        <Dato t="Total"><span className="font-bold tabular-nums">{enVista({ ars: c.total_ars, usd: c.total_usd }, v)}</span>
          {c.moneda !== v && <span className="text-[#5C6B76]"> (cargado en {c.moneda === "USD" ? "dólares" : "pesos"})</span>}</Dato>
        <Dato t="Depósito">{c.deposito ?? "—"}{!c.afecta_stock && <span className="text-[#5C6B76]"> · no mueve stock</span>}</Dato>
        <Dato t="Cliente">
          {c.cliente_id ? <Link href={`/ventas/clientes/${c.cliente_id}`} className="font-semibold text-[#16577F] hover:underline">{c.cliente}</Link> : "—"}
          {c.documento_numero && <div className="text-[#5C6B76]">{c.documento_tipo} {c.documento_numero}</div>}
          {c.cliente_email && <div className="text-[#5C6B76]">{c.cliente_email}</div>}
        </Dato>
        <Dato t="Canal">{c.canal}</Dato>
        <Dato t="Fecha">{fecha(c.fecha)}</Dato>
        <Dato t="Unidades"><span className="tabular-nums">{unidades}</span></Dato>
        {c.notas && <div className="col-span-2 sm:col-span-4"><Dato t="Notas"><span className="whitespace-pre-wrap">{c.notas}</span></Dato></div>}
      </div>

      <h2 className="text-sm font-bold mb-2">Líneas</h2>
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>SKU</th><th className={TH}>Título</th><th className={THN}>Cantidad</th><th className={THN}>Lista</th>
              <th className={THN}>Descuento</th><th className={THN}>Unitario</th><th className={THN}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id} className={TR}>
                <td className={`${TD} font-mono whitespace-nowrap`}>{l.variacion_id && productos.has(l.variacion_id)
                  ? <><Link href={`/catalogo/productos/${productos.get(l.variacion_id)!.producto_id}`} className="text-[#16577F] hover:underline">{l.sku ?? "—"}</Link>{" "}
                    <FotosProducto fotos={productos.get(l.variacion_id)!.fotos} titulo={l.titulo} /></>
                  : l.sku ?? "—"}</td>
                <td className={TD}>{l.titulo}{variasOrdenes && l.orden_ml && <span className="block text-[10px] text-[#5C6B76] font-mono">Orden ML {l.orden_ml}</span>}</td>
                <td className={TDN}>{l.cantidad}</td>
                <td className={TDN}>{l.precio_lista_ars == null && l.precio_lista_usd == null ? "—" : enVista({ ars: l.precio_lista_ars, usd: l.precio_lista_usd }, v)}</td>
                <td className={TDN}>{l.descuento_pct ? `${l.descuento_pct.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %` : "—"}</td>
                <td className={TDN}>{enVista({ ars: l.precio_unit_ars, usd: l.precio_unit_usd }, v)}</td>
                <td className={TDN}>{enVista({ ars: l.precio_unit_ars * l.cantidad, usd: l.precio_unit_usd * l.cantidad }, v)}</td>
              </tr>
            ))}
            <tr className={`${TR} font-bold`}>
              <td colSpan={6} className={`${TD} text-right`}>Total</td>
              <td className={TDN}>{enVista({ ars: c.total_ars, usd: c.total_usd }, v)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div>
          <h2 className="text-sm font-bold mb-2">Envío</h2>
          <div className={CAJA}>
            {envioMl ? (
              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                <Dato t="Logística">{LOGISTICA[envioMl.logistica ?? ""] ?? envioMl.logistica ?? "—"}{envioMl.metodo ? ` · ${envioMl.metodo}` : ""}</Dato>
                <Dato t="Estado">{ESTADO_ENVIO[envioMl.estado ?? ""] ?? envioMl.estado ?? "—"}{envioMl.subestado ? ` (${envioMl.subestado})` : ""}</Dato>
                <Dato t="Despachar antes de">{fechaCorta(envioMl.despachar_antes)}</Dato>
                <Dato t="Entrega estimada">{fechaCorta(envioMl.entrega_estimada)}</Dato>
                <Dato t="Recibe">{envioMl.receptor ?? "—"}</Dato>
                <Dato t="Seguimiento">{envioMl.tracking ?? "—"}</Dato>
                <div className="col-span-2"><Dato t="Dirección">{[envioMl.direccion?.linea ?? [envioMl.direccion?.calle, envioMl.direccion?.numero].filter(Boolean).join(" "), envioMl.direccion?.localidad, envioMl.direccion?.provincia, envioMl.direccion?.codigo_postal && `CP ${envioMl.direccion.codigo_postal}`].filter(Boolean).join(", ") || "—"}{envioMl.direccion?.referencia && <span className="block text-[11px] text-[#5C6B76]">{envioMl.direccion.referencia}</span>}</Dato></div>
              </div>
            ) : envio ? <DatosEnvio datos={envio} /> : <p className="text-xs text-[#5C6B76]">Sin datos de envío.</p>}
            {ml?.comision != null && <p className="text-[11px] text-[#5C6B76] mt-1">Comisión de Mercado Libre: {formatear(ml.comision, "ARS")}{ml.pack ? ` · carrito ${ml.pack}` : ""}</p>}
            {ml?.sin_vincular && <p className="text-[11px] text-[#C03420] mt-1">Tiene artículos que no están vinculados a un producto de Laucen: esas líneas no descuentan stock. Vinculalos en Catálogo → Vincular con Mercado Libre.</p>}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-bold mb-2">Historial de estados</h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={THN}>Fecha</th><th className={TH}>Cambio</th><th className={TH}>Quién</th><th className={TH}>Nota</th></tr></thead>
              <tbody>
                {historial.map((h, i) => (
                  <tr key={i} className={TR}>
                    <td className={TDN}>{fechaHora(h.fecha)}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {h.estado_anterior ? `${etiqueta(ESTADOS_PEDIDO, h.estado_anterior)} → ` : ""}<b>{etiqueta(ESTADOS_PEDIDO, h.estado_nuevo)}</b>
                    </td>
                    <td className={TD}>{h.quien_nombre === "sistema" ? "Sistema" : h.quien_nombre}</td>
                    <td className={`${TD} text-[#5C6B76]`}>{h.nota ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Operacion org={s.org.id} pid={pid} sp={sp} />

      <h2 className="text-sm font-bold mb-2">Facturación</h2>
      {sp.b !== "op" && (sp.ok || sp.error) && (
        <p role={sp.error ? "alert" : undefined} className={`text-xs rounded-lg px-3 py-2 mb-2 ${sp.error ? "bg-[#FDF1EF] text-[#C03420]" : "bg-[#EEF7F1] text-[#1F6E4A]"}`}>
          {sp.error ?? sp.ok}
          {sp.error && c.cliente_id && <> <Link href={`/ventas/clientes/${c.cliente_id}`} className="font-bold underline">Corregir en la ficha del cliente</Link></>}
        </p>
      )}
      <div className={`${CAJA} mb-4 flex flex-wrap items-start justify-between gap-3`}>
        <div className="text-xs grid gap-1">
          {comprobantes.length === 0 && <span className="text-[#5C6B76]">Sin comprobantes.</span>}
          {comprobantes.map((x) => {
            const est = ESTADOS_CBTE[x.estado] ?? ESTADOS_CBTE.pendiente;
            return (
              <div key={x.id} className="flex flex-wrap items-center gap-2">
                {puedeFacturar
                  ? <Link href={`/administracion/facturacion/${x.id}`} className="text-[#16577F] hover:underline">{nombreTipo(x.tipo_cbte)} <span className="font-mono">{numeroCbte(x.punto_venta, x.numero)}</span></Link>
                  : <span>{nombreTipo(x.tipo_cbte)} <span className="font-mono">{numeroCbte(x.punto_venta, x.numero)}</span></span>}
                <Estado texto={est.texto} tono={est.tono} />
                {x.estado === "autorizado" && puedeFacturar && <a href={`/administracion/facturacion/${x.id}/pdf`} target="_blank" rel="noopener" className={SUAVE}>PDF</a>}
                {x.observaciones && x.estado !== "autorizado" && <span className="text-[11px] text-[#5C6B76]">{x.observaciones}</span>}
              </div>
            );
          })}
        </div>
        {ofrecerFacturar && (
          <form action={accionFacturar}>
            <input type="hidden" name="pedido_id" value={pid} />
            <BotonEnviar clase={PRIMARIO} corriendo="Facturando…">Facturar</BotonEnviar>
          </form>
        )}
      </div>

      <h2 className="text-sm font-bold mb-2">Movimientos de stock</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={THN}>Fecha</th><th className={TH}>Tipo</th><th className={TH}>SKU</th><th className={TH}>Producto</th><th className={THN}>Cantidad</th><th className={TH}>Desde</th><th className={TH}>Hacia</th><th className={TH}>Nota</th></tr>
          </thead>
          <tbody>
            {movimientos.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>{c.afecta_stock ? "Todavía no movió stock (se reserva al pasar a pagado)." : "Este pedido no mueve stock."}</td></tr>}
            {movimientos.map((m) => (
              <tr key={m.id} className={TR}>
                <td className={TDN}>{fechaHora(m.fecha)}</td>
                <td className={TD}>{TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}</td>
                <td className={`${TD} font-mono whitespace-nowrap`}><Link href={`/catalogo/productos/${m.producto_id}`} className="text-[#16577F] hover:underline">{m.sku}</Link></td>
                <td className={TD}>{m.titulo}{m.kit && <span className="text-[#5C6B76]"> (del kit {m.kit})</span>}</td>
                <td className={TDN}>{m.cantidad}</td>
                <td className={TD}>{m.origen ?? "—"}</td>
                <td className={TD}>{m.destino ?? "—"}</td>
                <td className={`${TD} text-[#5C6B76]`}>{m.nota ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}

/** El JSON del envío, prolijo: clave → valor, y lo anidado con sangría. */
function DatosEnvio({ datos }: { datos: Record<string, unknown> }) {
  const nombre = (k: string) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, " ");
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {Object.entries(datos).map(([k, val]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-[#5C6B76]">{nombre(k)}</dt>
          <dd className="min-w-0 break-words">
            {val && typeof val === "object" && !Array.isArray(val)
              ? <DatosEnvio datos={val as Record<string, unknown>} />
              : Array.isArray(val) ? val.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")
              : val == null || val === "" ? "—" : String(val)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
