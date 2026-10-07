// Detalle de un pedido: cabecera, cliente, líneas, envío, historial de estados
// y los movimientos de stock que generó. Botones de operación: "Facturar" (en
// el bloque de facturación) y, para lo que no es de Mercado Libre, el bloque
// "Operación" (confirmar pago, estado siguiente, avisar por WhatsApp).

import Link from "next/link";
import FotosProducto from "@/app/componentes/FotosProducto";
import { formatear, enMoneda, tcDelDia } from "@/lib/moneda";
import { notFound } from "next/navigation";
import { una, consulta } from "@/lib/erp/base";
import { enVista, type Moneda } from "@/lib/moneda";
import { pedidoCompleto, ESTADOS_PEDIDO, ESTADOS_PAGO, type EstadoPedido, type EstadoPago } from "@/lib/pedidos";
import { TIPOS_MOVIMIENTO, type TipoMovimiento } from "@/lib/stock";
import {
  entrarErp, Pantalla, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAJA, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha, fechaHora, TONO_ESTADO, TONO_PAGO, etiqueta } from "@/app/ventas/formato";
import { tienePermiso } from "@/lib/permisos";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { ESTADOS_CBTE, numeroCbte, nombreTipo, type EstadoCbte } from "@/app/administracion/facturacion/comun";
import { accionFacturar, accionSubirFacturaMlPedido } from "./acciones";
import { sqlEstadoFacturaMl } from "@/lib/mercadolibre/facturas";
import { TextoFacturaMl, BotonFacturaMl, puedeSubir } from "@/app/administracion/facturacion/FacturaMl";
import Operacion from "./Operacion";
import AccionesPedido from "./AccionesPedido";
import NuevoPedido, { type EdicionPedido } from "../NuevoPedido";
import { motivoNoEditable } from "@/lib/pedidos/editar";
import EnvioOca from "./EnvioOca";
import { envioOcaDe } from "@/lib/oca/envios";
import { cargosDelPedido, TIPOS_CARGO, TIPOS_COSTO, IMPUESTOS } from "@/lib/mercadolibre/facturacion";
import { MarcaCarritoEspera, textoEsperaCarrito } from "@/app/componentes/CarritoEspera";
import { carritoEnEspera, mensajeEsperaCarrito, MENSAJE_A_COBRAR_FACTURA } from "@/lib/pedidos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

export default async function DetallePedido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; b?: string; editar?: string }> }) {
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
    tracking: string | null; receptor: string | null; direccion: Record<string, string | null>; despachar_antes: Date | null; entrega_estimada: Date | null;
    impresa: Date | null; lista: Date | null; en_camino: Date | null; entregado: Date | null; no_entregado: Date | null; devuelto: Date | null; cancelado: Date | null }>(`
    select id::int, logistica, metodo, estado, subestado, tracking, receptor, direccion, despachar_antes, entrega_estimada,
           -- Los hitos del envío, como los cuenta Mercado Libre (status_history) u OCA (datos_externos.oca).
           coalesce((datos_externos #>> '{ml,date_first_printed}')::timestamptz, etiqueta_impresa_ts) impresa,
           coalesce((datos_externos #>> '{ml,status_history,date_ready_to_ship}')::timestamptz, (datos_externos #>> '{oca,alta}')::timestamptz) lista,
           coalesce((datos_externos #>> '{ml,status_history,date_shipped}')::timestamptz, (datos_externos #>> '{oca,en_camino}')::timestamptz) en_camino,
           coalesce((datos_externos #>> '{ml,status_history,date_delivered}')::timestamptz, (datos_externos #>> '{oca,entregado}')::timestamptz) entregado,
           (datos_externos #>> '{ml,status_history,date_not_delivered}')::timestamptz no_entregado,
           coalesce((datos_externos #>> '{ml,status_history,date_returned}')::timestamptz, (datos_externos #>> '{oca,devuelto}')::timestamptz) devuelto,
           coalesce((datos_externos #>> '{ml,status_history,date_cancelled}')::timestamptz, (datos_externos #>> '{oca,anulado}')::timestamptz) cancelado
      from envio where pedido_id = $1 and organizacion_id = $2 order by id desc limit 1`, [pid, s.org.id]);
  const ml = await una<{ comision: number | null; sin_vincular: boolean; pack: string | null; espera_ts: Date | null }>(
    "select comision_ars::float comision, sin_vincular, envio ->> 'pack_id' pack, carrito_ultimo_evento_ts espera_ts from pedido where id = $1 and organizacion_id = $2", [pid, s.org.id]);
  const cargos = await cargosDelPedido(s.org.id, pid);
  const listaPedido = (await una<{ nombre: string }>("select l.nombre from pedido p join lista_precios l on l.id = p.lista_precios_id where p.id = $1 and p.organizacion_id = $2", [pid, s.org.id]))?.nombre ?? null;
  // OCA: los pedidos que no son de ML, con dirección, se pueden despachar por OCA desde acá.
  const oca = await (async () => {
    const envioOca = await envioOcaDe(s.org.id, pid);
    const x = await una<{ canal_tipo: string; tiene_dir: boolean; sucursal: string | null }>(`
      select ca.tipo canal_tipo, coalesce(p.envio -> 'direccion' ->> 'codigo_postal', '') <> '' tiene_dir, p.envio #>> '{sucursal_oca,nombre}' sucursal
        from pedido p join canal ca on ca.id = p.canal_id where p.id = $1 and p.organizacion_id = $2`, [pid, s.org.id]);
    const ofrecer = !!envioOca || (!!x && x.canal_tipo !== "mercadolibre" && x.tiene_dir && !["presupuesto", "cancelado", "devuelto", "despachado", "entregado"].includes(c.estado));
    return { ofrecer, envio: envioOca, sucursal: x?.sucursal ?? null };
  })();
  // Carrito de ML en espera (10 min desde su último evento): nada se toca todavía.
  const espera = carritoEnEspera({ carrito_ultimo_evento_ts: ml?.espera_ts ?? null });
  const LOGISTICA: Record<string, string> = { oca: "OCA", fulfillment: "Full", self_service: "Flex", cross_docking: "Colecta", xd_drop_off: "Colecta", drop_off: "Despacho en correo", custom: "A convenir", not_specified: "A convenir" };
  const ESTADO_ENVIO: Record<string, string> = { ready_to_ship: "Etiqueta lista", shipped: "En camino", delivered: "Recibido por el cliente", not_delivered: "No entregado", cancelled: "Cancelado", returned: "Devuelto", pending: "Pendiente", handling: "En preparación" };
  const fechaCorta = (d: Date | null) => d ? d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  // Facturación: los comprobantes del pedido y si se puede facturar.
  const comprobantes = await consulta<{ id: number; tipo_cbte: number; punto_venta: number; numero: string | null; estado: EstadoCbte; observaciones: string | null;
    es_ml: boolean; ml_estado: string | null; ml_subida_ts: Date | null; ml_documento_id: string | null; ml_error: string | null; ml_cola_id: number | null }>(`
    select cb.id::int, cb.tipo_cbte, cb.punto_venta, cb.numero::text, cb.estado, cb.observaciones,
           (ca.tipo = 'mercadolibre' and p.id_externo is not null) es_ml, ${sqlEstadoFacturaMl("cb")} ml_estado, cb.ml_subida_ts, cb.ml_documento_id,
           (select q.ultimo_error from ml_cola q where q.tipo = 'factura' and q.item_id = 'cbte:' || cb.id order by q.id desc limit 1) ml_error,
           (select q.id::int from ml_cola q where q.tipo = 'factura' and q.item_id = 'cbte:' || cb.id order by q.id desc limit 1) ml_cola_id
      from comprobante cb join pedido p on p.id = cb.pedido_id join canal ca on ca.id = p.canal_id
     where cb.pedido_id = $1 and cb.organizacion_id = $2 order by cb.id`, [pid, s.org.id]);
  const enMl = (x: (typeof comprobantes)[number]) => ({ estado: x.ml_estado, subida_ts: x.ml_subida_ts, documento_id: x.ml_documento_id, error: x.ml_error, cola_id: x.ml_cola_id });
  const subibles = comprobantes.filter((x) => x.estado === "autorizado" && x.es_ml && puedeSubir(enMl(x)));
  const puedeFacturar = tienePermiso(s.permisos, "facturacion_ver");
  const facturado = comprobantes.some((x) => [1, 6, 11].includes(x.tipo_cbte) && x.estado === "autorizado");
  const ofrecerFacturar = puedeFacturar && !facturado && !["presupuesto", "nuevo", "cancelado"].includes(c.estado);

  const v = s.moneda;
  // Lo que la base guarda sólo en pesos (comisión y cargos de ML) se ve, en dólares, al tipo de cambio del día del pedido.
  const tcPedido = v === "USD" ? (await tcDelDia(s.org.id, new Date(c.fecha).toISOString().slice(0, 10)))?.venta ?? null : null;
  const unidades = lineas.reduce((t, l) => t + l.cantidad, 0);
  // Un carrito de Mercado Libre: cada línea dice de qué orden de ML vino.
  const variasOrdenes = new Set(lineas.map((l) => l.orden_ml).filter(Boolean)).size > 1;
  const envio = c.envio && Object.keys(c.envio).length ? c.envio : null;
  const Dato = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <div><span className={ETIQUETA}>{t}</span><div className="text-xs">{children}</div></div>
  );

  // El lápiz (Fer, 7/10): un presupuesto siempre; un pedido si todavía no se tocó (lib/pedidos/editar.ts).
  const editable = !(await motivoNoEditable(s.org.id, pid));
  const nombreDoc = c.estado === "presupuesto" ? "Presupuesto" : "Pedido";
  if (editable && sp.editar === "ficha") {
    const canalPedido = (await una<{ c: number }>("select canal_id::int c from pedido where id = $1", [pid]))!.c;
    const [canalesAMano, listas, cli, lineasEd] = await Promise.all([
      consulta<{ id: number; nombre: string; moneda: "ARS" | "USD"; tipo: string }>(`
        select ca.id::int, ca.nombre, coalesce(l.moneda_base, 'ARS') moneda, ca.tipo from canal ca left join lista_precios l on l.id = ca.lista_precios_id
         where ca.organizacion_id = $1 and (ca.id = $2 or (ca.estado = 'activo' and ca.tipo in ('local', 'web_minorista', 'web_mayorista', 'otro')))
         order by (ca.tipo = 'local') desc, ca.nombre`, [s.org.id, canalPedido]),
      consulta<{ id: number; nombre: string; moneda: "ARS" | "USD" }>(
        "select id::int, nombre, moneda_base moneda from lista_precios where organizacion_id = $1 and estado = 'activa' order by orden, nombre", [s.org.id]),
      c.cliente_id ? una<{ id: number; nombre: string; documento: string | null; email: string | null; cuenta_corriente: boolean }>(`
        select id::int, nombre, nullif(concat_ws(' ', documento_tipo, documento_numero), '') documento, email, coalesce(cuenta_corriente, false) cuenta_corriente
          from cliente where id = $1`, [c.cliente_id]) : null,
      consulta<{ variacion: number; sku: string; titulo: string; disponible: number; cantidad: number; lista: number | null; unit: number; descuento: number }>(`
        select l.variacion_id::int variacion, coalesce(v.sku, l.sku, '') sku, coalesce(titulo_variacion(v.id), l.titulo) titulo,
               stock_disponible_canal(l.organizacion_id, v.id, p.canal_id) disponible, l.cantidad::int,
               (case when p.moneda = 'USD' then l.precio_lista_usd else l.precio_lista_ars end)::float lista,
               (case when p.moneda = 'USD' then l.precio_unit_usd else l.precio_unit_ars end)::float unit, coalesce(l.descuento_pct, 0)::float descuento
          from pedido_linea l join pedido p on p.id = l.pedido_id left join variacion v on v.id = l.variacion_id
         where l.pedido_id = $1 and l.variacion_id is not null order by l.orden, l.id`, [pid]),
    ]);
    const pe = await una<{ moneda: "ARS" | "USD"; lista: number | null; envio_ars: number; tc: number | null; vigencia: string | null }>(`
      select moneda, lista_precios_id::int lista, costo_envio_ars::float envio_ars, nullif(total_ars, 0) / nullif(total_usd, 0) tc, to_char(vigencia, 'YYYY-MM-DD') vigencia
        from pedido where id = $1`, [pid]);
    const dirEd = (envio?.direccion ?? null) as Record<string, string | null> | null;
    const edicion: EdicionPedido = {
      pedidoId: pid, tipo: c.estado === "presupuesto" ? "presupuesto" : "pedido", canalId: canalPedido,
      moneda: pe!.moneda, listaId: pe!.lista,
      cliente: cli ? { id: cli.id, nombre: cli.nombre, documento: cli.documento, email: cli.email, cuentaCorriente: cli.cuenta_corriente, direccion: null } : null,
      // Con precio de lista y descuento, se muestran los dos (lista × (1 − descuento) = el precio que tenía); si no, el precio tal cual.
      lineas: lineasEd.map((l) => ({ variacion: l.variacion, sku: l.sku, titulo: l.titulo, sugerido: null, disponible: l.disponible, cantidad: l.cantidad,
        precio: l.lista && l.descuento ? l.lista : l.unit, descuento: l.lista && l.descuento ? l.descuento : null })),
      entrega: dirEd && (dirEd.calle || dirEd.localidad) ? "envio" : "retiro", direccion: dirEd,
      costoEnvio: pe!.envio_ars ? (pe!.moneda === "USD" && pe!.tc ? Math.round((pe!.envio_ars / pe!.tc) * 100) / 100 : pe!.envio_ars) : null,
      notas: c.notas, vigencia: pe!.vigencia,
    };
    return (
      <Pantalla titulo={<>Editar {nombreDoc.toLowerCase()} {c.id}</>} camino={[{ texto: `${nombreDoc} ${c.id}`, href: `/ventas/pedidos/${pid}` }, { texto: "Editar" }]}
        subtitulo="Lo que saques libera su stock reservado y lo que sumes lo reserva (si el pedido reservaba)."
        acciones={<><button type="submit" form="ficha-pedido" className={VERDE}>Grabar</button><Link href={`/ventas/pedidos/${pid}`} className={SUAVE}>Cancelar</Link></>}>
        <div className={CAJA}>
          <NuevoPedido canales={canalesAMano} listas={listas} edicion={edicion} formId="ficha-pedido" />
        </div>
      </Pantalla>
    );
  }

  return (
    <Pantalla acciones={<AccionesPedido org={s.org.id} pid={pid} editable={editable} superadmin={s.superadmin} />} titulo={<>{c.estado === "presupuesto" ? "Presupuesto" : "Pedido"} {c.id}{c.id_externo && <span className="font-mono font-normal text-sm text-[#5C6B76]"> · {c.id_externo}</span>}</>}
      camino={[{ texto: `${c.estado === "presupuesto" ? "Presupuesto" : "Pedido"} ${c.id}` }]} subtitulo={<>{c.canal} · {fechaHora(c.fecha)} · hecho en <b>{c.moneda === "USD" ? "dólares" : "pesos"}</b>{listaPedido ? <> · lista {listaPedido}</> : null}</>}>
      <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4`}>
        <Dato t="Estado"><Estado texto={etiqueta(ESTADOS_PEDIDO, c.estado)} tono={TONO_ESTADO[c.estado] ?? "gris"} />{espera && <> <MarcaCarritoEspera ts={ml?.espera_ts} /></>}</Dato>
        {espera && <p className="col-span-2 sm:col-span-4 text-xs rounded-lg px-3 py-2 bg-[#FFF1D6] text-[#8a5a00] border border-[#F2D08A]">{mensajeEsperaCarrito(espera)}</p>}
        <Dato t="Pago"><Estado texto={etiqueta(ESTADOS_PAGO, c.estado_pago)} tono={TONO_PAGO[c.estado_pago] ?? "gris"} />{c.medio_pago && <span className="ml-1">{c.medio_pago}</span>}</Dato>
        {c.estado_pago === "a_cobrar" && !["cancelado", "devuelto"].includes(c.estado) && (
          <p className="col-span-2 sm:col-span-4 text-sm rounded-lg px-3 py-2 bg-[#FDE7B0] text-[#3D2600] border-2 border-[#C98A00]">
            <b>A COBRAR {formatear(c.total_ars, "ARS")}</b> · el stock ya está reservado y el pedido entra en picking sin esperar el pago; se cobra al entregar y se factura cuando se confirma el cobro.
          </p>
        )}
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
                <Dato t="Despachar antes de">{envioMl.despachar_antes
                  ? <Estado texto={fechaCorta(envioMl.despachar_antes)} tono={envioMl.en_camino || envioMl.entregado ? "gris" : new Date(envioMl.despachar_antes) < new Date() ? "rojo" : "azul"} />
                  : "—"}</Dato>
                <Dato t="Entrega estimada">{fechaCorta(envioMl.entrega_estimada)}</Dato>
                {/* Los hitos del envío: verde con la fecha cuando pasó, "Pendiente" en amarillo mientras no. */}
                {(() => {
                  const cortado = envioMl.cancelado ?? envioMl.devuelto;
                  const hito = (t: string, d: Date | null) => (
                    <Dato t={t}>{d ? <Estado texto={fechaCorta(d)} tono="verde" /> : cortado ? "—" : <Estado texto="Pendiente" tono="amarillo" />}</Dato>
                  );
                  return (
                    <>
                      {hito("Etiqueta impresa", envioMl.impresa)}
                      {hito("Lista para preparar", envioMl.lista)}
                      {hito("En camino", envioMl.en_camino)}
                      {hito("Recibido por el cliente", envioMl.entregado)}
                      {envioMl.no_entregado && <Dato t="No entregado"><Estado texto={fechaCorta(envioMl.no_entregado)} tono="rojo" /></Dato>}
                      {envioMl.devuelto && <Dato t="Devuelto"><Estado texto={fechaCorta(envioMl.devuelto)} tono="rojo" /></Dato>}
                      {envioMl.cancelado && <Dato t="Cancelado"><Estado texto={fechaCorta(envioMl.cancelado)} tono="rojo" /></Dato>}
                    </>
                  );
                })()}
                <Dato t="Recibe">{envioMl.receptor ?? "—"}</Dato>
                <Dato t="Seguimiento">{envioMl.tracking ?? "—"}</Dato>
                <div className="col-span-2"><Dato t="Dirección">{[envioMl.direccion?.linea ?? [envioMl.direccion?.calle, envioMl.direccion?.numero].filter(Boolean).join(" "), envioMl.direccion?.localidad, envioMl.direccion?.provincia, envioMl.direccion?.codigo_postal && `CP ${envioMl.direccion.codigo_postal}`].filter(Boolean).join(", ") || "—"}{envioMl.direccion?.referencia && <span className="block text-[11px] text-[#5C6B76]">{envioMl.direccion.referencia}</span>}</Dato></div>
              </div>
            ) : envio ? <DatosEnvio datos={envio} /> : <p className="text-xs text-[#5C6B76]">Sin datos de envío.</p>}
            {oca.ofrecer && <EnvioOca pid={pid} envio={oca.envio} sucursal={oca.sucursal} />}
            {ml?.comision != null && <p className="text-[11px] text-[#5C6B76] mt-1">Comisión de Mercado Libre: {enMoneda(ml.comision, v, tcPedido)}{ml.pack ? ` · carrito ${ml.pack}` : ""}</p>}
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

      {cargos.length > 0 && <CargosMl cargos={cargos} total={v === "USD" ? c.total_usd : c.total_ars} moneda={v} />}

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
                {x.estado === "autorizado" && x.es_ml && <span className="text-[11px] text-[#5C6B76]">En ML: <TextoFacturaMl x={enMl(x)} /></span>}
              </div>
            );
          })}
        </div>
        {puedeFacturar && subibles.length > 0 && !espera && <BotonFacturaMl accion={accionSubirFacturaMlPedido} campos={{ pedido_id: String(pid) }} />}
        {ofrecerFacturar && espera && (
          <button type="button" disabled className={`${PRIMARIO} opacity-50 cursor-not-allowed`} title={mensajeEsperaCarrito(espera)}>{textoEsperaCarrito(ml?.espera_ts)}</button>
        )}
        {ofrecerFacturar && !espera && c.estado_pago === "a_cobrar" && (
          // «A cobrar»: se factura cuando se confirma el cobro (en «Operación»).
          <span className="inline-flex flex-wrap items-center gap-2">
            <button type="button" disabled className={`${PRIMARIO} opacity-50 cursor-not-allowed`} title={MENSAJE_A_COBRAR_FACTURA}>Facturar</button>
            <span className="text-xs text-[#8a5a00]">{MENSAJE_A_COBRAR_FACTURA}</span>
          </span>
        )}
        {ofrecerFacturar && !espera && c.estado_pago !== "a_cobrar" && (
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

/** Lo que Mercado Libre cobró por esta venta (de su facturación, leída por
 *  API): por tipo, y lo que queda neto. Los impuestos (percepciones y
 *  retenciones) se muestran aparte: no son costo, se toman a cuenta. */
function CargosMl({ cargos, total, moneda }: { cargos: Awaited<ReturnType<typeof cargosDelPedido>>; total: number; moneda: Moneda }) {
  // En dólares, cada cargo al dólar de su día (ml_cargo.tc_dia); `total` ya viene en la moneda que se mira.
  const valor = (x: { monto: number; tc_dia: number | null }) => (moneda === "USD" && x.tc_dia ? x.monto / x.tc_dia : x.monto);
  const porTipo = new Map<string, number>();
  for (const x of cargos) if (TIPOS_COSTO.includes(x.tipo)) porTipo.set(x.tipo, (porTipo.get(x.tipo) ?? 0) + valor(x));
  const costo = [...porTipo.values()].reduce((a, b) => a + b, 0);
  const impuestos = cargos.filter((x) => x.tipo === "impuesto");
  const pesos = (n: number) => formatear(n, moneda);
  return (
    <div className="mb-4">
      <h2 className="text-sm font-bold mb-2">Cargos de Mercado Libre</h2>
      <div className={`${CAJA} text-xs`}>
        <table className="w-full max-w-md">
          <tbody>
            <tr><td className="py-0.5">Venta</td><td className="py-0.5 text-right tabular-nums">{pesos(total)}</td></tr>
            {[...porTipo.entries()].map(([t, m]) => (
              <tr key={t}><td className="py-0.5 text-[#5C6B76]">− {TIPOS_CARGO[t as keyof typeof TIPOS_CARGO]}</td><td className="py-0.5 text-right tabular-nums">{pesos(-m)}</td></tr>
            ))}
            <tr className="border-t border-[#E3E9F0] font-bold"><td className="py-1">Neto de Mercado Libre</td><td className="py-1 text-right tabular-nums">{pesos(total - costo)}</td></tr>
          </tbody>
        </table>
        {impuestos.length > 0 && (
          <p className="mt-2 text-[11px] text-[#5C6B76]">
            Además, retenciones y percepciones (no son costo: se toman a cuenta de impuestos):{" "}
            {impuestos.map((x, i) => <span key={i}>{i ? " · " : ""}{IMPUESTOS[x.impuesto ?? "otro"]} {pesos(valor(x))}</span>)}
          </p>
        )}
        <p className="mt-1 text-[10px] text-[#5C6B76]">Tal como los factura Mercado Libre (con IVA). Salen de su facturación mensual (Administración → Facturación de Mercado Libre).</p>
      </div>
    </div>
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
