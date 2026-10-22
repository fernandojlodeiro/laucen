// Envíos a Full como lista configurable (lib/listas/tipos.ts): "Descargar Excel" con los mismos
// filtros que la pantalla (lib/full/envios.ts).

import { campoFecha, traducido, type Lista } from "@/lib/listas/tipos";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { ESTADOS_ENVIO } from "@/lib/full/envios";

const ESTADOS = Object.fromEntries(Object.entries(ESTADOS_ENVIO).map(([k, v]) => [k, v.texto]));
export const UNIDADES_ENVIO = "(select coalesce(sum(l.cantidad), 0) from full_envio_linea l where l.envio_id = e.id)";
export const RECIBIDAS_ENVIO = "(select coalesce(sum(l.recibido), 0) from full_envio_linea l where l.envio_id = e.id)";
export const PRODUCTOS_ENVIO = "(select count(*) from full_envio_linea l where l.envio_id = e.id)";

export const LISTA_FULL_ENVIOS: Lista = {
  pantalla: "full-envios",
  titulo: "Envíos a Full",
  ruta: "/stock/full",
  permiso: "full_ver",
  campos: [
    { clave: "id", titulo: "Envío", sql: "e.id::int", formato: "entero" },
    campoFecha("creado", "Creado", "e.creado_ts"),
    { clave: "cuenta", titulo: "Cuenta", sql: "c.nombre", ancho: 20 },
    { clave: "origen", titulo: "Sale de", sql: "o.nombre", ancho: 20 },
    { clave: "numero_ml", titulo: "Nº en Mercado Libre", sql: "e.numero_ml", ancho: 18 },
    campoFecha("entrega", "Entrega en Full", "e.fecha_entrega", { dia: true }),
    { clave: "productos", titulo: "Productos", sql: `${PRODUCTOS_ENVIO}::int`, orden: PRODUCTOS_ENVIO, formato: "entero" },
    { clave: "unidades", titulo: "Unidades", sql: `${UNIDADES_ENVIO}::int`, orden: UNIDADES_ENVIO, formato: "entero" },
    { clave: "recibidas", titulo: "Recibidas", sql: `${RECIBIDAS_ENVIO}::int`, orden: RECIBIDAS_ENVIO, formato: "entero" },
    { clave: "flete", titulo: "Flete $", sql: "e.flete_ars::float", orden: "e.flete_ars", formato: "pesos" },
    { clave: "estado", titulo: "Estado", sql: "e.estado", valor: traducido("estado", ESTADOS) },
    campoFecha("despachado", "Despachado", "e.despachado_ts", { hora: true }),
    campoFecha("recibido", "Recibido", "e.recibido_ts", { hora: true }),
    { clave: "notas", titulo: "Notas", sql: "e.notas", orden: false, ancho: 40 },
  ],
  enPantalla: ["id", "creado", "cuenta", "origen", "numero_ml", "entrega", "productos", "unidades", "recibidas", "flete", "estado"],
  porDefecto: "id",
  consulta: async (ctx, sp) => {
    return {
      desde: "full_envio e join canal c on c.id = e.canal_id join deposito o on o.id = e.deposito_origen_id",
      donde: `e.organizacion_id = $1 and ($2 = '' or e.estado = $2) and ${sqlBusqueda("$3", [
        { num: "e.id::text" }, "e.numero_ml", "c.nombre", "e.notas",
        { de: "select 1 from full_envio_linea l join variacion v on v.id = l.variacion_id where l.envio_id = e.id", campos: ["v.sku", "titulo_variacion(v.id)"] },
      ])}`,
      valores: [ctx.org, sp.estado && Object.hasOwn(ESTADOS_ENVIO, sp.estado) ? sp.estado : "", parametroBusqueda(sp.q, sp.contiene !== "1")],
      orden: "e.id desc",
    };
  },
};
