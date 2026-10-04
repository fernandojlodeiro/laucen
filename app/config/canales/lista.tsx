// Canales como lista configurable (lib/listas/tipos.ts): "Descargar Excel"
// con la misma búsqueda que la pantalla. La llave API nunca sale: sólo si hay.

import { patronBusqueda } from "@/app/componentes/erp";
import { traducido, type Lista } from "@/lib/listas/tipos";

export const TIPOS_CANAL: Record<string, string> = {
  mercadolibre: "Mercado Libre", web_minorista: "Web minorista", web_mayorista: "Web mayorista",
  local: "Local", historico: "Histórico", otro: "Otro",
};
const ESTADOS: Record<string, string> = { activo: "Activo", pausado: "Pausado", archivado: "Archivado" };
const DEPOSITOS = `(select string_agg(d.nombre, ', ' order by cd.prioridad, d.nombre) from canal_deposito cd join deposito d on d.id = cd.deposito_id
                     where cd.canal_id = c.id)`;

export const LISTA_CANALES: Lista = {
  pantalla: "canales",
  titulo: "Canales",
  ruta: "/config/canales",
  permiso: "canales_ver",
  campos: [
    { clave: "nombre", titulo: "Canal", sql: "c.nombre", ancho: 24 },
    { clave: "tipo", titulo: "Tipo", sql: "c.tipo", valor: traducido("tipo", TIPOS_CANAL) },
    { clave: "lista", titulo: "Lista de precios", sql: "l.nombre" },
    { clave: "depositos", titulo: "Vende desde", sql: DEPOSITOS, ancho: 30 },
    { clave: "estado", titulo: "Estado", sql: "c.estado", valor: traducido("estado", ESTADOS) },
    { clave: "apodo", titulo: "Apodo de la cuenta de ML", sql: "(select mc.nickname from meli_cuenta mc where mc.canal_id = c.id)" },
    { clave: "ml", titulo: "Mercado Libre", sql: "(select mc.estado from meli_cuenta mc where mc.canal_id = c.id)" },
    { clave: "emisor", titulo: "Factura con", sql: "(select coalesce(e.nombre, e.razon_social) from emisor e where e.id = c.emisor_id)" },
    { clave: "umbral", titulo: "Umbral de pausa", sql: "c.umbral_pausa_default", formato: "entero" },
    { clave: "llave", titulo: "Llave API", sql: "c.config ? 'token'", formato: "sino" },
    { clave: "publicaciones", titulo: "Publicaciones", sql: "(select count(*) from publicacion pu where pu.canal_id = c.id)::int", formato: "entero" },
    { clave: "pedidos", titulo: "Pedidos", sql: "(select count(*) from pedido p where p.canal_id = c.id)::int", formato: "entero" },
  ],
  enPantalla: ["nombre", "tipo", "lista", "depositos", "estado", "ml", "umbral", "llave"],
  consulta: async (ctx, sp) => ({
    desde: "canal c left join lista_precios l on l.id = c.lista_precios_id",
    donde: "c.organizacion_id = $1 and ($2::text is null or c.nombre ilike $2)",
    valores: [ctx.org, patronBusqueda(sp.q?.trim() ?? "", sp.contiene !== "1")],
    orden: "c.estado, c.nombre",
  }),
};
