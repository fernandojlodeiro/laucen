// Razones sociales como lista configurable (lib/listas/tipos.ts): "Descargar
// Excel" con la misma búsqueda que la pantalla.

import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { cuitLegible } from "@/lib/cuit";
import { traducido, type Lista } from "@/lib/listas/tipos";

export const CONDICIONES_RS: Record<string, string> = { responsable_inscripto: "Responsable inscripto", monotributo: "Monotributo", exento: "Exento" };
const AMBIENTES: Record<string, string> = { produccion: "Facturación real", homologacion: "Prueba contra ARCA" };

export const LISTA_RAZONES_SOCIALES: Lista = {
  pantalla: "razones-sociales",
  titulo: "Razones sociales",
  ruta: "/config/razones-sociales",
  permiso: "empresa_config",
  campos: [
    { clave: "id", titulo: "N.º", sql: "e.id", formato: "entero" },
    { clave: "nombre", titulo: "Nombre", sql: "coalesce(e.nombre, e.razon_social)", ancho: 24 },
    { clave: "razon_social", titulo: "Razón social", sql: "e.razon_social", ancho: 30 },
    { clave: "cuit", titulo: "CUIT", sql: "e.cuit", valor: (f) => cuitLegible(f.cuit) },
    { clave: "condicion_iva", titulo: "Condición IVA", sql: "e.condicion_iva", valor: traducido("condicion_iva", CONDICIONES_RS) },
    { clave: "punto_venta", titulo: "Punto de venta", sql: "e.punto_venta", formato: "entero" },
    { clave: "ambiente", titulo: "Modo ARCA", sql: "e.ambiente", valor: traducido("ambiente", AMBIENTES) },
    { clave: "principal", titulo: "Principal", sql: "e.es_principal", formato: "sino" },
    { clave: "conectada", titulo: "Conectada con ARCA", sql: "exists (select 1 from arca_credencial a where a.emisor_id = e.id and a.certificado is not null)", formato: "sino" },
    { clave: "canales", titulo: "Cuentas de ML y canales", sql: "(select string_agg(ca.nombre, ', ' order by ca.nombre) from canal ca where ca.emisor_id = e.id)", ancho: 30 },
  ],
  enPantalla: ["id", "nombre", "razon_social", "cuit", "condicion_iva", "punto_venta", "principal", "conectada", "canales"],
  consulta: async (ctx, sp) => ({
    desde: "emisor e",
    donde: `e.organizacion_id = $1 and ${sqlBusqueda("$2", [
      "e.id::text", "e.nombre", "e.razon_social", { num: "e.cuit" }, "e.condicion_iva", "e.domicilio", "e.iibb", "e.ambiente", "e.facturar_al",
    ])}`,
    valores: [ctx.org, parametroBusqueda(sp.q, sp.contiene !== "1")],
    orden: "e.es_principal desc, e.id",
  }),
};
