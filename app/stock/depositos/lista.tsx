// Depósitos y ubicaciones como listas configurables (lib/listas/tipos.ts):
// "Descargar Excel" de cada una con la misma búsqueda que la pantalla (la de
// depósitos va en ?qd=, la de ubicaciones en ?q= con el depósito en ?d=).

import { patronBusqueda } from "@/app/componentes/erp";
import { traducido, type Lista } from "@/lib/listas/tipos";

export const TIPOS_DEPOSITO: Record<string, string> = { propio: "Propio", full_ml: "Full de Mercado Libre", tercerizado: "Tercerizado", caja_abierta: "Caja abierta" };
const UBICACIONES = "(select count(*) from ubicacion u where u.deposito_id = d.id)";
const UNIDADES = "(select coalesce(sum(s.cantidad), 0) from stock s join ubicacion u on u.id = s.ubicacion_id where u.deposito_id = d.id)";
export const UNIDADES_UBICACION = "(select coalesce(sum(s.cantidad), 0) from stock s where s.ubicacion_id = u.id)";

export const LISTA_DEPOSITOS: Lista = {
  pantalla: "depositos",
  titulo: "Depósitos",
  ruta: "/stock/depositos",
  permiso: "depositos_ver",
  campos: [
    { clave: "nombre", titulo: "Depósito", sql: "d.nombre", ancho: 24 },
    { clave: "tipo", titulo: "Tipo", sql: "d.tipo", valor: traducido("tipo", TIPOS_DEPOSITO) },
    { clave: "usa", titulo: "Usa ubicaciones", sql: "d.usa_ubicaciones", formato: "sino" },
    { clave: "direccion", titulo: "Dirección", sql: "d.direccion", ancho: 30 },
    { clave: "estado", titulo: "Estado", sql: "d.estado", valor: (f) => (f.estado === "activo" ? "Activo" : "Archivado") },
    { clave: "ubicaciones", titulo: "Ubicaciones", sql: `${UBICACIONES}::int`, orden: UBICACIONES, formato: "entero" },
    { clave: "unidades", titulo: "Unidades", sql: `${UNIDADES}::int`, orden: UNIDADES, formato: "entero" },
    { clave: "canales", titulo: "Canales que venden desde acá", sql: "(select string_agg(c.nombre, ', ' order by c.nombre) from canal_deposito cd join canal c on c.id = cd.canal_id where cd.deposito_id = d.id)", ancho: 30 },
  ],
  enPantalla: ["nombre", "tipo", "usa", "direccion", "estado", "ubicaciones", "unidades"],
  consulta: async (ctx, sp) => ({
    desde: "deposito d",
    donde: "d.organizacion_id = $1 and ($2::text is null or d.nombre ilike $2)",
    valores: [ctx.org, patronBusqueda(sp.qd?.trim() ?? "", sp.qdcontiene !== "1")],
    orden: "d.estado, d.nombre",
  }),
};

export const LISTA_UBICACIONES: Lista = {
  pantalla: "ubicaciones",
  titulo: "Ubicaciones",
  ruta: "/stock/depositos",
  permiso: "depositos_ver",
  campos: [
    { clave: "deposito", titulo: "Depósito", sql: "dp.nombre", orden: false },
    { clave: "u_codigo", titulo: "Código", sql: "u.codigo", ancho: 14 },
    { clave: "u_descripcion", titulo: "Descripción", sql: "u.descripcion", ancho: 30 },
    { clave: "u_orden", titulo: "Orden de recorrido", sql: "u.orden_recorrido", formato: "entero" },
    { clave: "u_estado", titulo: "Estado", sql: "u.estado", valor: (f) => (f.u_estado === "activa" ? "Activa" : f.u_estado === "archivada" ? "Archivada" : f.u_estado) },
    { clave: "u_general", titulo: "Es la general", sql: "u.es_default", formato: "sino" },
    { clave: "u_unidades", titulo: "Unidades", sql: `${UNIDADES_UBICACION}::int`, orden: UNIDADES_UBICACION, formato: "entero" },
    { clave: "u_productos", titulo: "Productos distintos", sql: "(select count(distinct s.variacion_id) from stock s where s.ubicacion_id = u.id and s.cantidad <> 0)::int", formato: "entero" },
  ],
  enPantalla: ["u_codigo", "u_descripcion", "u_orden", "u_estado", "u_unidades"],
  consulta: async (ctx, sp) => ({
    desde: "ubicacion u join deposito dp on dp.id = u.deposito_id",
    donde: `u.organizacion_id = $1 and u.deposito_id = $2
       and (u.es_default or dp.usa_ubicaciones)
       and ($3::text is null or u.codigo ilike $3 or u.descripcion ilike $3)`,
    valores: [ctx.org, Number(sp.d) || 0, patronBusqueda(sp.q?.trim() ?? "", sp.contiene !== "1")],
    orden: "u.es_default desc, u.orden_recorrido, u.codigo",
  }),
};
