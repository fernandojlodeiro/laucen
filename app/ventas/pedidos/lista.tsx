// Pedidos como lista configurable (lib/listas/tipos.ts): catálogo de campos y
// la consulta con los filtros de la pantalla (la comparten la pantalla y su Excel).

import Link from "next/link";
import { Estado, url } from "@/app/componentes/erp";
import { enVista } from "@/lib/moneda";
import { ESTADOS_PEDIDO, ESTADOS_PAGO, esEstadoPedido, esEstadoPago } from "@/lib/pedidos";
import { campoFecha, traducido, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import { TONO_ESTADO, TONO_PAGO, etiqueta } from "@/app/ventas/formato";
import type { EstadoPedido, EstadoPago } from "@/lib/pedidos";
import { MarcaCarritoEspera } from "@/app/componentes/CarritoEspera";

const esFecha = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");

/** Los filtros de la pantalla, leídos de la dirección. */
export function filtrosPedidos(sp: SP) {
  return {
    estado: sp.estado === "pendientes" || esEstadoPedido(sp.estado) ? sp.estado! : "",
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
  return { ...f, canal: f.canal || null, cliente: f.cliente || null };
}

const UNIDADES = "coalesce((select sum(l.cantidad) from pedido_linea l where l.pedido_id = p.id), 0)";
const AL_PEDIDO = "hover:underline";

const CAMPOS: Campo[] = [
  { clave: "id", titulo: "Nº", sql: "p.id::int", formato: "entero", celda: (f) => <Link href={`/ventas/pedidos/${f.id}`} className="font-semibold text-[#16577F] hover:underline">{f.id}</Link> },
  { ...campoFecha("fecha", "Fecha", "p.fecha"), celda: (f) => <Link href={`/ventas/pedidos/${f.id}`} className={AL_PEDIDO}>{f.fecha?.split("-").reverse().join("/")}</Link> },
  campoFecha("fecha_hora", "Fecha y hora", "p.fecha", { hora: true }),
  {
    clave: "canal", titulo: "Canal", sql: "ca.nombre",
    celda: (f, c) => <Link href={url("/ventas/pedidos", { ...filtrosEnlace(c.sp), canal: f.canal_id })} className="hover:text-[#16577F] hover:underline">{f.canal}</Link>,
  },
  { clave: "externo", titulo: "Id externo", sql: "p.id_externo", ancho: 18, celda: (f) => f.externo ? <Link href={`/ventas/pedidos/${f.id}`} className={`${AL_PEDIDO} font-mono`}>{f.externo}</Link> : "—" },
  { clave: "cliente", titulo: "Cliente", sql: "cl.nombre", ancho: 28, celda: (f) => f.cliente_id ? <Link href={`/ventas/clientes/${f.cliente_id}`} className="text-[#16577F] hover:underline">{f.cliente}</Link> : "—" },
  { clave: "cliente_doc", titulo: "Documento del cliente", sql: "nullif(concat_ws(' ', cl.documento_tipo, cl.documento_numero), '')", orden: "cl.documento_numero" },
  { clave: "cliente_email", titulo: "Mail del cliente", sql: "cl.email" },
  { clave: "cliente_tel", titulo: "Teléfono del cliente", sql: "cl.telefono" },
  {
    clave: "estado", titulo: "Estado", sql: "p.estado", valor: traducido("estado", ESTADOS_PEDIDO),
    // Un carrito de ML en espera (10 min desde su último evento) lo dice al lado.
    celda: (f) => <span className="inline-flex flex-wrap gap-1"><Estado texto={etiqueta(ESTADOS_PEDIDO, f.estado)} tono={TONO_ESTADO[f.estado as EstadoPedido] ?? "gris"} /><MarcaCarritoEspera ts={f.espera_ts} /></span>,
  },
  {
    clave: "pago", titulo: "Pago", sql: "p.estado_pago", valor: traducido("pago", ESTADOS_PAGO),
    celda: (f) => <Estado texto={etiqueta(ESTADOS_PAGO, f.pago)} tono={TONO_PAGO[f.pago as EstadoPago] ?? "gris"} />,
  },
  { clave: "medio_pago", titulo: "Medio de pago", sql: "p.medio_pago" },
  {
    clave: "total", titulo: "Total", sql: "p.total_ars::float", orden: "p.total_ars", formato: "pesos", usa: ["total_usd"],
    celda: (f, c) => enVista({ ars: f.total, usd: f.total_usd }, c.moneda),
  },
  { clave: "total_usd", titulo: "Total US$", sql: "p.total_usd::float", orden: "p.total_usd", formato: "usd" },
  { clave: "envio_ars", titulo: "Costo de envío", sql: "p.costo_envio_ars::float", orden: "p.costo_envio_ars", formato: "pesos" },
  { clave: "comision", titulo: "Comisión del canal", sql: "p.comision_ars::float", orden: "p.comision_ars", formato: "pesos" },
  {
    clave: "unidades", titulo: "Unidades", sql: `${UNIDADES}::int`, orden: UNIDADES, formato: "entero",
    celda: (f) => <Link href={`/ventas/pedidos/${f.id}`} className={AL_PEDIDO}>{f.unidades}</Link>,
  },
  { clave: "lineas", titulo: "Líneas", sql: "(select count(*) from pedido_linea l where l.pedido_id = p.id)::int", formato: "entero" },
  { clave: "seguimiento", titulo: "Código de seguimiento", sql: "p.codigo_seguimiento" },
  { clave: "notas", titulo: "Notas", sql: "p.notas", orden: false, ancho: 40 },
];

export const LISTA_PEDIDOS: Lista = {
  pantalla: "pedidos",
  titulo: "Pedidos",
  ruta: "/ventas/pedidos",
  permiso: "pedidos_ver",
  vistas: true,
  porDefecto: "fecha",
  campos: CAMPOS,
  enPantalla: ["id", "fecha", "canal", "externo", "cliente", "estado", "pago", "total", "unidades"],
  siempre: "p.id::int id, p.canal_id::int canal_id, p.cliente_id::int cliente_id, p.carrito_ultimo_evento_ts espera_ts",
  consulta: async (ctx, sp) => {
    const f = filtrosPedidos(sp);
    const valores: unknown[] = [ctx.org];
    const donde = ["p.organizacion_id = $1"];
    const agregar = (cond: (p: string) => string, v: unknown) => { valores.push(v); donde.push(cond(`$${valores.length}`)); };
    if (f.estado === "pendientes") donde.push("p.estado in ('nuevo', 'pagado')");
    else if (f.estado) agregar((p) => `p.estado = ${p}`, f.estado);
    if (f.pago) agregar((p) => `p.estado_pago = ${p}`, f.pago);
    if (f.canal) agregar((p) => `p.canal_id = ${p}`, f.canal);
    if (f.cliente) agregar((p) => `p.cliente_id = ${p}`, f.cliente);
    // Las fechas se cortan en el día argentino.
    if (f.desde) agregar((p) => `p.fecha >= (${p}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'`, f.desde);
    if (f.hasta) agregar((p) => `p.fecha < (${p}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`, f.hasta);
    if (f.q) {
      valores.push(`%${f.q}%`);
      const p = `$${valores.length}`;
      const n = /^\d+$/.test(f.q) && f.q.length <= 15 ? Number(f.q) : null;
      let porId = "";
      if (n) { valores.push(n); porId = ` or p.id = $${valores.length}`; }
      donde.push(`(p.id_externo ilike ${p} or cl.nombre ilike ${p} or cl.email ilike ${p} or cl.documento_numero ilike ${p}${porId})`);
    }
    return {
      desde: "pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id",
      donde: donde.join(" and "),
      valores,
      orden: "p.fecha desc, p.id desc",
    };
  },
};
