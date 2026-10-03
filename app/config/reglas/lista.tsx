// Reglas comerciales como lista configurable (lib/listas/tipos.ts): "Descargar
// Excel" con la misma búsqueda que la pantalla.

import { patronBusqueda } from "@/app/componentes/erp";
import { campoFecha, type Lista } from "@/lib/listas/tipos";
import { enCriollo } from "./comun";

export const LISTA_REGLAS: Lista = {
  pantalla: "reglas",
  titulo: "Reglas comerciales",
  ruta: "/config/reglas",
  permiso: "reglas_ver",
  campos: [
    { clave: "nombre", titulo: "Nombre", sql: "r.nombre", ancho: 30 },
    {
      clave: "regla", titulo: "Qué hace", sql: "r.condicion", orden: false, ancho: 60, usa: ["accion", "producto", "familia", "medio"],
      valor: (f) => enCriollo(f.regla, f.accion, { producto: f.producto, familia: f.familia, medio: f.medio }),
    },
    { clave: "accion", titulo: "Acción (datos)", sql: "r.accion", orden: false, valor: (f) => JSON.stringify(f.accion) },
    { clave: "producto", titulo: "Producto", sql: "case when p.id is null then null else p.sku_base || ' (' || p.titulo || ')' end" },
    { clave: "familia", titulo: "Familia", sql: "f.nombre" },
    { clave: "medio", titulo: "Medio de pago", sql: "m.nombre" },
    { clave: "activa", titulo: "Activa", sql: "r.activa", formato: "sino" },
    campoFecha("desde", "Desde", "r.desde", { dia: true }),
    campoFecha("hasta", "Hasta", "r.hasta", { dia: true }),
    { clave: "acumulable", titulo: "Acumulable", sql: "r.acumulable", formato: "sino" },
    { clave: "prioridad", titulo: "Prioridad", sql: "r.prioridad", formato: "entero" },
  ],
  enPantalla: ["nombre", "regla", "activa", "desde", "hasta", "acumulable", "prioridad"],
  consulta: async (ctx, sp) => ({
    desde: `regla_comercial r
      left join producto p on p.id = (r.condicion ->> 'producto_id')::bigint and p.organizacion_id = r.organizacion_id
      left join familia f on f.id = (r.condicion ->> 'familia_id')::bigint and f.organizacion_id = r.organizacion_id
      left join lateral (select nombre from medio_pago where organizacion_id = r.organizacion_id and canal_id is null and tipo = r.condicion ->> 'medio' limit 1) m on true`,
    donde: "r.organizacion_id = $1 and r.canal_id is null and ($2::text is null or r.nombre ilike $2)",
    valores: [ctx.org, patronBusqueda(sp.q?.trim() ?? "", sp.contiene !== "1")],
    orden: "r.prioridad desc, r.id",
  }),
};
