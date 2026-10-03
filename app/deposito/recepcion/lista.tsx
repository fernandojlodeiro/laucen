// Recepciones como lista configurable (lib/listas/tipos.ts): "Descargar
// Excel" con todas (la pantalla muestra las abiertas y las últimas cerradas).

import { campoFecha, traducido, type Lista } from "@/lib/listas/tipos";
import { TIPO_RECEPCION } from "../formato";

export const LISTA_RECEPCIONES: Lista = {
  pantalla: "recepciones",
  titulo: "Recepciones",
  ruta: "/deposito/recepcion",
  permiso: "recepcion_ver",
  campos: [
    { clave: "id", titulo: "Recepción N.º", sql: "r.id::int", formato: "entero" },
    { clave: "tipo", titulo: "Qué entró", sql: "r.tipo", valor: traducido("tipo", TIPO_RECEPCION) },
    { clave: "estado", titulo: "Estado", sql: "r.estado", valor: (f) => (f.estado === "abierta" ? "Abierta" : "Cerrada") },
    { clave: "deposito", titulo: "Depósito", sql: "d.nombre" },
    { clave: "proveedor", titulo: "Proveedor", sql: "pr.nombre", ancho: 28 },
    { clave: "pedido", titulo: "Pedido", sql: "r.pedido_id::int", formato: "entero" },
    { clave: "documento", titulo: "Remito o factura", sql: "r.documento" },
    { clave: "lineas", titulo: "Líneas", sql: "(select count(*) from recepcion_linea where recepcion_id = r.id)::int", formato: "entero" },
    { clave: "unidades", titulo: "Unidades", sql: "coalesce((select sum(cantidad) from recepcion_linea where recepcion_id = r.id), 0)::int", formato: "entero" },
    campoFecha("creada", "Abierta el", "r.creado_ts", { hora: true }),
    campoFecha("cerrada", "Cerrada el", "r.cerrada_ts", { hora: true }),
    { clave: "nota", titulo: "Nota", sql: "r.nota", orden: false, ancho: 40 },
  ],
  enPantalla: ["id", "tipo", "estado", "deposito", "proveedor", "pedido", "documento", "unidades", "lineas", "creada", "cerrada"],
  consulta: async (ctx) => ({
    desde: "recepcion r join deposito d on d.id = r.deposito_id left join proveedor pr on pr.id = r.proveedor_id",
    donde: "r.organizacion_id = $1",
    valores: [ctx.org],
    orden: "r.estado = 'abierta' desc, coalesce(r.cerrada_ts, r.creado_ts) desc",
  }),
};
