// Pedidos como lista configurable (lib/listas/tipos.ts): catálogo de campos y
// la consulta con los filtros de la pantalla (la comparten la pantalla y su Excel).

import Link from "next/link";
import { Estado, url } from "@/app/componentes/erp";
import { enMoneda, enVista, formatear } from "@/lib/moneda";
import { ESTADOS_PEDIDO, ESTADOS_PAGO, esEstadoPedido, esEstadoPago, sqlPedidoPendiente, sqlEstadoPago } from "@/lib/pedidos";
import { parametroBusqueda, sqlBusqueda, type CampoBusqueda } from "@/lib/busqueda";
import { camposCliente } from "@/app/ventas/clientes/lista";
import { telefonoConAclaracion } from "@/lib/telefono";
import { campoFecha, traducido, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import { TONO_ESTADO, TONO_PAGO, etiqueta } from "@/app/ventas/formato";
import type { EstadoPedido, EstadoPago } from "@/lib/pedidos";
import { MarcaCarritoEspera } from "@/app/componentes/CarritoEspera";
import { sqlFacturaMlDelPedido, ESTADO_FACTURA_ML } from "@/lib/mercadolibre/facturas";
import { sqlCargosMl, sqlCargosMlUsd } from "@/lib/mercadolibre/facturacion";

/** ✓ subida · ⏳ pendiente o preparada · ⚠ con error · ○ falta subirla. */
const ICONO_FACTURA_ML: Record<string, string> = { subida: "✓", ok: "✓", pendiente: "⏳", enviando: "⏳", preparado: "⏳", error: "⚠", descartado: "○", falta: "○" };

const esFecha = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");

/** Los filtros de la pantalla, leídos de la dirección. */
export function filtrosPedidos(sp: SP) {
  return {
    // Sin elegir, los pendientes (Fer, 3/10); "todos" = sin filtro de estado.
    estado: sp.estado === undefined ? "pendientes" : sp.estado === "pendientes" || esEstadoPedido(sp.estado) ? sp.estado : "",
    pago: esEstadoPago(sp.pago) ? sp.pago! : "",
    canal: Number(sp.canal) || 0,
    desde: esFecha(sp.desde),
    hasta: esFecha(sp.hasta),
    q: sp.q?.trim() ?? "",
    cliente: Number(sp.cliente) || 0,
  };
}

/** Los filtros para armar un enlace (los vacíos no van). */
export function filtrosEnlace(sp: SP) {
  const f = filtrosPedidos(sp);
  return { ...f, estado: f.estado || "todos", canal: f.canal || null, cliente: f.cliente || null };
}

const CARGOS_ML = sqlCargosMl("p");
const CARGOS_ML_USD = sqlCargosMlUsd("p");
const UNIDADES = "coalesce((select sum(l.cantidad) from pedido_linea l where l.pedido_id = p.id), 0)";
const AL_PEDIDO = "hover:underline";

const CAMPOS: Campo[] = [
  { clave: "id", titulo: "Nº", sql: "p.id::int", formato: "entero", celda: (f) => <Link href={`/ventas/pedidos/${f.id}`} className="font-semibold text-[#16577F] hover:underline">{f.id}</Link> },
  // Fecha y hora en que entró (Fer, 3/10).
  { ...campoFecha("fecha", "Fecha", "p.fecha", { hora: true }), celda: (f) => {
    const [d, h] = String(f.fecha ?? "").split(" ");
    return <Link href={`/ventas/pedidos/${f.id}`} className={`${AL_PEDIDO} whitespace-nowrap`}>{d?.split("-").reverse().join("/")} {h}</Link>;
  } },
  campoFecha("fecha_hora", "Fecha y hora", "p.fecha", { hora: true }),
  {
    clave: "canal", titulo: "Canal", sql: "ca.nombre",
    celda: (f, c) => <Link href={url("/ventas/pedidos", { ...filtrosEnlace(c.sp), canal: f.canal_id })} className="hover:text-[#16577F] hover:underline">{f.canal}</Link>,
  },
  { clave: "externo", titulo: "Id externo", sql: "p.id_externo", ancho: 18, celda: (f) => f.externo ? <Link href={`/ventas/pedidos/${f.id}`} className={`${AL_PEDIDO} font-mono`}>{f.externo}</Link> : "—" },
  { clave: "cliente", titulo: "Cliente", sql: "cl.nombre", ancho: 28, celda: (f) => f.cliente_id ? <Link href={`/ventas/clientes/${f.cliente_id}`} className="text-[#16577F] hover:underline">{f.cliente}</Link> : "—" },
  { clave: "cliente_doc", titulo: "Documento del cliente", sql: "nullif(concat_ws(' ', cl.documento_tipo, cl.documento_numero), '')", orden: "cl.documento_numero" },
  { clave: "cliente_email", titulo: "Mail del cliente", sql: "cl.email" },
  { clave: "cliente_tel", titulo: "Teléfono del cliente", sql: "cl.telefono", usa: ["cliente_tel_aclaracion"], valor: (f) => telefonoConAclaracion(f.cliente_tel, f.cliente_tel_aclaracion) || null },
  { clave: "cliente_tel_aclaracion", titulo: "Interno / aclaración del teléfono del cliente", sql: "cl.telefono_aclaracion" },
  {
    clave: "estado", titulo: "Estado", sql: "p.estado", valor: traducido("estado", ESTADOS_PEDIDO),
    // Un carrito de ML en espera (10 min desde su último evento) lo dice al lado.
    celda: (f) => <span className="inline-flex flex-wrap gap-1"><Estado texto={etiqueta(ESTADOS_PEDIDO, f.estado)} tono={TONO_ESTADO[f.estado as EstadoPedido] ?? "gris"} /><MarcaCarritoEspera ts={f.espera_ts} /></span>,
  },
  {
    // «A cobrar» (efectivo al retirar): los viejos con pago pendiente en efectivo también.
    clave: "pago", titulo: "Pago", sql: sqlEstadoPago("p"), valor: traducido("pago", ESTADOS_PAGO),
    celda: (f) => <Estado texto={etiqueta(ESTADOS_PAGO, f.pago)} tono={TONO_PAGO[f.pago as EstadoPago] ?? "gris"} />,
  },
  { clave: "medio_pago", titulo: "Medio de pago", sql: "p.medio_pago" },
  {
    clave: "total", titulo: "Total", sql: "p.total_ars::float", orden: "p.total_ars", formato: "pesos", usa: ["total_usd"],
    celda: (f, c) => enVista({ ars: f.total, usd: f.total_usd }, c.moneda),
  },
  { clave: "total_usd", titulo: "Total US$", sql: "p.total_usd::float", orden: "p.total_usd", formato: "usd" },
  { clave: "envio_ars", titulo: "Costo de envío", sql: "p.costo_envio_ars::float", sqlUsd: "(p.costo_envio_ars / nullif(p.tc_dia, 0))::float", orden: "p.costo_envio_ars", formato: "pesos" },
  { clave: "comision", titulo: "Comisión del canal", sql: "p.comision_ars::float", sqlUsd: "(p.comision_ars / nullif(p.tc_dia, 0))::float", orden: "p.comision_ars", formato: "pesos" },
  // De la facturación de ML (lib/mercadolibre/facturacion.ts): comisión, envío, cargo fijo… sin los impuestos.
  { clave: "cargos_ml", titulo: "Cargos ML", sql: `${CARGOS_ML}::float`, sqlUsd: `${CARGOS_ML_USD}::float`, orden: CARGOS_ML, formato: "pesos" },
  {
    clave: "neto_ml", titulo: "Neto ML", sql: `(p.total_ars - ${CARGOS_ML})::float`, sqlUsd: `(p.total_usd - ${CARGOS_ML_USD})::float`, orden: `(p.total_ars - ${CARGOS_ML})`, formato: "pesos",
    celda: (f, c) => f.neto_ml == null ? <span className="text-[#5C6B76]" title="Todavía no hay cargos de la facturación de ML para esta venta">—</span>
      : <Link href={`/ventas/pedidos/${f.id}`} className={AL_PEDIDO}>{c.moneda === "USD" && f.neto_ml__usd != null ? formatear(Number(f.neto_ml__usd), "USD") : enMoneda(Number(f.neto_ml), c.moneda, c.tc ?? null)}</Link>,
  },
  {
    clave: "unidades", titulo: "Unidades", sql: `${UNIDADES}::int`, orden: UNIDADES, formato: "entero",
    celda: (f) => <Link href={`/ventas/pedidos/${f.id}`} className={AL_PEDIDO}>{f.unidades}</Link>,
  },
  { clave: "lineas", titulo: "Líneas", sql: "(select count(*) from pedido_linea l where l.pedido_id = p.id)::int", formato: "entero" },
  { clave: "seguimiento", titulo: "Código de seguimiento", sql: "p.codigo_seguimiento" },
  { clave: "notas", titulo: "Notas", sql: "p.notas", orden: false, ancho: 40 },
  {
    clave: "factura_ml", titulo: "Factura en ML", sql: sqlFacturaMlDelPedido("p"), ancho: 18,
    valor: (f) => f.factura_ml ? ESTADO_FACTURA_ML[f.factura_ml]?.texto ?? f.factura_ml : null,
    celda: (f) => {
      if (!f.factura_ml) return <span className="text-[#5C6B76]">—</span>;
      const e = ESTADO_FACTURA_ML[f.factura_ml] ?? ESTADO_FACTURA_ML.falta;
      return <Link href={`/ventas/pedidos/${f.id}`} title={e.texto} aria-label={e.texto}><Estado texto={`${ICONO_FACTURA_ML[f.factura_ml] ?? "○"} ${f.factura_ml === "subida" || f.factura_ml === "ok" ? "Subida" : f.factura_ml === "error" ? "Error" : f.factura_ml === "falta" || f.factura_ml === "descartado" ? "Falta" : "Pendiente"}`} tono={e.tono} /></Link>;
    },
  },
];

/** Dónde busca el buscador: los campos de texto del pedido y los de su cliente. */
const BUSCA_EN: CampoBusqueda[] = [
  "p.id::text", "p.id_externo", "p.medio_pago", "p.codigo_seguimiento", "p.notas", ...camposCliente("cl"),
];

export const LISTA_PEDIDOS: Lista = {
  pantalla: "pedidos",
  titulo: "Pedidos",
  ruta: "/ventas/pedidos",
  permiso: "pedidos_ver",
  vistas: true,
  porDefecto: "fecha",
  campos: CAMPOS,
  enPantalla: ["id", "fecha", "canal", "externo", "cliente", "estado", "pago", "total", "unidades", "factura_ml"],
  siempre: "p.id::int id, p.canal_id::int canal_id, p.cliente_id::int cliente_id, p.carrito_ultimo_evento_ts espera_ts",
  consulta: async (ctx, sp) => {
    const f = filtrosPedidos(sp);
    const valores: unknown[] = [ctx.org];
    const donde = ["p.organizacion_id = $1"];
    const agregar = (cond: (p: string) => string, v: unknown) => { valores.push(v); donde.push(cond(`$${valores.length}`)); };
    // Pendientes: nuevos y pagados, y los «A cobrar» que todavía no se entregaron.
    if (f.estado === "pendientes") donde.push(sqlPedidoPendiente("p"));
    else if (f.estado) agregar((p) => `p.estado = ${p}`, f.estado);
    if (f.pago) agregar((p) => `${sqlEstadoPago("p")} = ${p}`, f.pago);
    if (f.canal) agregar((p) => `p.canal_id = ${p}`, f.canal);
    if (f.cliente) agregar((p) => `p.cliente_id = ${p}`, f.cliente);
    // Las fechas se cortan en el día argentino.
    if (f.desde) agregar((p) => `p.fecha >= (${p}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'`, f.desde);
    if (f.hasta) agregar((p) => `p.fecha < (${p}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`, f.hasta);
    if (f.q) agregar((p) => sqlBusqueda(p, BUSCA_EN), parametroBusqueda(f.q));
    return {
      desde: "pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id",
      donde: donde.join(" and "),
      valores,
      // Los pendientes, del más viejo al más nuevo (se preparan en orden de llegada).
      orden: f.estado === "pendientes" ? "p.fecha, p.id" : "p.fecha desc, p.id desc",
    };
  },
};
