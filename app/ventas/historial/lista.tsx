// Ventas › Historial de ventas: todas las ventas de todos los canales (vista venta_estadistica: Mercado Libre desde
// ml_venta, con o sin pedido; el resto desde los pedidos; lo anterior, del historial importado de Virtual Seller).
// "Descargar Excel" con los mismos filtros.

import { parametroBusqueda, sqlBusqueda, type CampoBusqueda } from "@/lib/busqueda";
import { campoFecha, traducido, type Lista, type SP } from "@/lib/listas/tipos";

export const BASE_HISTORIAL = "/ventas/historial";

export const ESTADOS_VENTA: Record<string, string> = {
  paid: "Pagada", cancelled: "Cancelada", confirmed: "Confirmada", payment_required: "Falta el pago", payment_in_process: "Pago en proceso",
  partially_paid: "Pago parcial", partially_refunded: "Devolución parcial", invalid: "Inválida",
  nuevo: "Nuevo", pagado: "Pagado", en_preparacion: "En preparación", preparado: "Preparado", despachado: "Despachado", entregado: "Entregado", devuelto: "Devuelto",
};

export function filtrosHistorial(sp: SP) {
  return { q: sp.q?.trim() ?? "", canal: Number(sp.canal) || 0, origen: sp.origen === "ml" || sp.origen === "otros" || sp.origen === "vs" ? sp.origen : "",
    pedido: sp.pedido === "con" || sp.pedido === "sin" ? sp.pedido : "", desde: sp.desde ?? "", hasta: sp.hasta ?? "",
    producto: Number(sp.producto) || 0, cliente: Number(sp.cliente) || 0, comprador: /^\d+$/.test(sp.comprador ?? "") ? sp.comprador! : "" };
}

const BUSCA_EN: CampoBusqueda[] = ["e.sku", "e.titulo", "e.order_id::text", "e.pedido_id::text", "e.pedido_vs", "mv.comprador", "cl.nombre", "vh.cliente_nombre", "va.sku"];

export const LISTA_HISTORIAL: Lista = {
  pantalla: "historial-ventas",
  titulo: "Historial de ventas",
  ruta: BASE_HISTORIAL,
  permiso: "pedidos_ver",
  campos: [
    campoFecha("fecha", "Fecha", "e.fecha", { hora: true }),
    { clave: "canal", titulo: "Canal", sql: "coalesce(ca.nombre, e.canal_nombre)" },
    { clave: "sku", titulo: "SKU", sql: "coalesce(va.sku, e.sku)" },
    { clave: "titulo", titulo: "Producto", sql: "e.titulo", ancho: 50 },
    { clave: "cantidad", titulo: "Cantidad", sql: "e.cantidad", formato: "entero" },
    { clave: "precio", titulo: "Precio $", sql: "e.precio_unit::float8", orden: "e.precio_unit", formato: "pesos" },
    { clave: "total", titulo: "Total $", sql: "e.total::float8", orden: "e.total", formato: "pesos" },
    { clave: "comision", titulo: "Comisión ML $", sql: "e.comision::float8", orden: "e.comision", formato: "pesos" },
    { clave: "estado", titulo: "Estado", sql: "e.estado", valor: traducido("estado", ESTADOS_VENTA) },
    { clave: "pedido", titulo: "Pedido", sql: "e.pedido_id::int", orden: "e.pedido_id", formato: "entero" },
    { clave: "pedido_vs", titulo: "Pedido de Virtual Seller", sql: "e.pedido_vs" },
    { clave: "venta_ml", titulo: "Venta de ML", sql: "e.order_id::text", orden: "e.order_id" },
    { clave: "comprador", titulo: "Comprador", sql: "coalesce(cl.nombre, mv.comprador, vh.cliente_nombre)", ancho: 26 },
    { clave: "reclamo", titulo: "Reclamo", sql: "coalesce(mv.reclamo, false)", formato: "sino" },
  ],
  enPantalla: ["fecha", "canal", "sku", "titulo", "cantidad", "precio", "total", "comision", "estado", "pedido", "comprador"],
  siempre: "e.ml_venta_id::int as ml_venta_id, e.canal_id::int as canal_id, e.origen, va.producto_id::int as producto_id, cl.id::int as cliente_id, (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = va.producto_id) as fotos",
  consulta: async (ctx, sp) => {
    const f = filtrosHistorial(sp);
    const valores: unknown[] = [ctx.org];
    const donde = ["e.organizacion_id = $1"];
    const p = (v: unknown) => { valores.push(v); return `$${valores.length}`; };
    if (f.canal) donde.push(`e.canal_id = ${p(f.canal)}`);
    if (f.origen === "ml") donde.push("e.origen = 'ml'");
    if (f.origen === "otros") donde.push("e.origen not in ('ml', 'vs')");
    if (f.origen === "vs") donde.push("e.origen = 'vs'");
    if (f.pedido === "con") donde.push("e.pedido_id is not null");
    if (f.pedido === "sin") donde.push("e.pedido_id is null");
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.desde)) donde.push(`e.fecha >= (${p(f.desde)}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.hasta)) donde.push(`e.fecha < (${p(f.hasta)}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`);
    if (f.producto) donde.push(`va.producto_id = ${p(f.producto)}`);
    if (f.cliente) donde.push(`cl.id = ${p(f.cliente)}`);
    if (f.comprador) donde.push(`e.ml_comprador_id = ${p(f.comprador)}::bigint`);
    if (f.q) donde.push(sqlBusqueda(p(parametroBusqueda(f.q)), BUSCA_EN));
    return {
      desde: `venta_estadistica e
        left join canal ca on ca.id = e.canal_id
        left join variacion va on va.id = e.variacion_id
        left join ml_venta mv on mv.id = e.ml_venta_id
        left join venta_historica vh on vh.id = e.venta_historica_id
        left join cliente cl on cl.id = coalesce(e.cliente_id,
          (select ci.cliente_id from cliente_identidad ci where ci.canal_id = e.canal_id and ci.id_externo = e.ml_comprador_id::text limit 1))`,
      donde: donde.join(" and "),
      valores,
      orden: "e.fecha desc",
    };
  },
};
