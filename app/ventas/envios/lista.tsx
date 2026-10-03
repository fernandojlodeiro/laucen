// Envíos como lista configurable (lib/listas/tipos.ts): "Descargar Excel" con
// la misma pestaña, filtros y orden que la pantalla.

import { campoFecha, traducido, type Lista, type SP } from "@/lib/listas/tipos";
import { LOGISTICA, ESTADO_ENVIO, SUBESTADO_ENVIO, esPestana, type Pestana } from "./formato";

/** La condición de cada pestaña (sobre la tabla envio, alias e). */
export const CONDICION_ENVIOS: Record<Pestana, string> = {
  despachar: "e.estado in ('ready_to_ship', 'handling') and coalesce(e.logistica, '') <> 'fulfillment'",
  camino: "e.estado = 'shipped'",
  entregados: "e.estado = 'delivered'",
  todos: "true",
};

export function filtrosEnvios(sp: SP) {
  return { ver: (esPestana(sp.ver) ? sp.ver : "despachar") as Pestana, canal: Number(sp.canal) || 0, q: sp.q?.trim() ?? "" };
}

export const LISTA_ENVIOS: Lista = {
  pantalla: "envios",
  titulo: "Envíos",
  ruta: "/ventas/envios",
  permiso: "envios_ver",
  campos: [
    { clave: "pedido", titulo: "Pedido", sql: "e.pedido_id::int", orden: "e.pedido_id", formato: "entero" },
    { clave: "pedido_externo", titulo: "Pedido (id externo)", sql: "p.id_externo", ancho: 18 },
    campoFecha("fecha", "Fecha", "coalesce(p.fecha, e.creado_ts)"),
    { clave: "cliente", titulo: "Cliente", sql: "coalesce(cl.nombre, e.receptor)", ancho: 28 },
    { clave: "receptor", titulo: "Recibe", sql: "e.receptor", ancho: 28 },
    { clave: "canal", titulo: "Canal", sql: "ca.nombre" },
    { clave: "logistica", titulo: "Logística", sql: "e.logistica", valor: traducido("logistica", LOGISTICA) },
    { clave: "metodo", titulo: "Método", sql: "e.metodo" },
    { clave: "estado", titulo: "Estado", sql: "e.estado", valor: traducido("estado", ESTADO_ENVIO) },
    { clave: "subestado", titulo: "Subestado", sql: "e.subestado", valor: traducido("subestado", SUBESTADO_ENVIO) },
    campoFecha("despachar", "Despachar antes de", "e.despachar_antes", { hora: true }),
    campoFecha("entrega", "Entrega estimada", "e.entrega_estimada", { hora: true }),
    { clave: "tracking", titulo: "Tracking", sql: "e.tracking", ancho: 18 },
    { clave: "transportista", titulo: "Transportista", sql: "e.transportista" },
    { clave: "costo", titulo: "Costo $", sql: "e.costo_ars::float", orden: "e.costo_ars", formato: "pesos" },
    {
      clave: "direccion", titulo: "Dirección", orden: false, ancho: 40,
      sql: `nullif(concat_ws(', ', coalesce(e.direccion->>'linea', nullif(concat_ws(' ', e.direccion->>'calle', e.direccion->>'numero'), '')),
             e.direccion->>'localidad', e.direccion->>'provincia', e.direccion->>'codigo_postal'), '')`,
    },
    campoFecha("impresa", "Etiqueta impresa", "e.etiqueta_impresa_ts", { hora: true }),
    { clave: "id_envio", titulo: "Id del envío (ML)", sql: "e.id_externo" },
  ],
  enPantalla: ["pedido", "fecha", "cliente", "canal", "logistica", "metodo", "estado", "despachar", "tracking", "impresa"],
  consulta: async (ctx, sp) => {
    const { ver, canal, q } = filtrosEnvios(sp);
    const valores: unknown[] = [ctx.org];
    const donde = ["e.organizacion_id = $1", CONDICION_ENVIOS[ver]];
    if (canal) { valores.push(canal); donde.push(`e.canal_id = $${valores.length}`); }
    if (q) {
      valores.push(`%${q}%`);
      const p = `$${valores.length}`;
      let porId = "";
      if (/^\d{1,15}$/.test(q)) { valores.push(Number(q)); porId = ` or p.id = $${valores.length}`; }
      donde.push(`(e.tracking ilike ${p} or e.id_externo ilike ${p} or p.id_externo ilike ${p} or cl.nombre ilike ${p} or e.receptor ilike ${p}${porId})`);
    }
    return {
      desde: `envio e
        left join pedido p on p.id = e.pedido_id
        left join cliente cl on cl.id = p.cliente_id
        left join canal ca on ca.id = e.canal_id`,
      donde: donde.join(" and "),
      valores,
      // Para despachar: lo más urgente primero. El resto: lo más nuevo primero.
      orden: ver === "despachar" ? "e.despachar_antes asc nulls last, e.id" : "coalesce(p.fecha, e.creado_ts) desc, e.id desc",
    };
  },
};
