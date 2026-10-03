// Métodos de envío como lista configurable (lib/listas/tipos.ts): "Descargar
// Excel" con la misma búsqueda que la pantalla.

import { patronBusqueda } from "@/app/componentes/erp";
import type { Lista } from "@/lib/listas/tipos";
import { TIPOS_ENVIO } from "./comun";

export const LISTA_METODOS_ENVIO: Lista = {
  pantalla: "metodos_envio",
  titulo: "Métodos de envío",
  ruta: "/config/envios",
  permiso: "tienda_config",
  campos: [
    { clave: "nombre", titulo: "Nombre", sql: "nombre", ancho: 28 },
    { clave: "tipo", titulo: "Tipo", sql: "tipo", valor: (f) => TIPOS_ENVIO[f.tipo as keyof typeof TIPOS_ENVIO]?.texto ?? f.tipo },
    { clave: "activo", titulo: "Activo", sql: "activo", formato: "sino" },
    { clave: "costo", titulo: "Costo $", sql: "costo_ars::float", orden: "costo_ars", formato: "pesos" },
    { clave: "gratis", titulo: "Gratis desde $", sql: "gratis_desde_ars::float", orden: "gratis_desde_ars", formato: "pesos" },
    {
      clave: "tarifas", titulo: "Tarifas por provincia", orden: false, ancho: 50,
      sql: "(select string_agg(case when t.key = '*' then 'Resto' else t.key end || ': ' || t.value, ' · ' order by t.key = '*', t.key) from jsonb_each_text(tarifas) t)",
    },
    { clave: "plazo", titulo: "Plazo", sql: "plazo" },
    { clave: "instrucciones", titulo: "Instrucciones", sql: "instrucciones", ancho: 40 },
    { clave: "orden", titulo: "Orden", sql: "orden", formato: "entero" },
  ],
  enPantalla: ["nombre", "tipo", "activo", "costo", "gratis", "plazo", "instrucciones", "orden"],
  consulta: async (ctx, sp) => ({
    desde: "metodo_envio",
    donde: "organizacion_id = $1 and canal_id is null and ($2::text is null or nombre ilike $2)",
    valores: [ctx.org, patronBusqueda(sp.q?.trim() ?? "", sp.contiene !== "1")],
    orden: "orden, id",
  }),
};
