// Proveedores como lista configurable (lib/listas/tipos.ts): "Descargar
// Excel" con los mismos filtros que la pantalla.

import { patronesBusqueda, digitosBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { CONDICIONES_IVA } from "@/app/ventas/formato";
import { campoFecha, traducido, type Lista } from "@/lib/listas/tipos";

export const FACTURAS_PROVEEDOR = "(select count(*) from factura_compra f where f.proveedor_id = pr.id)";

export const LISTA_PROVEEDORES: Lista = {
  pantalla: "proveedores",
  titulo: "Proveedores",
  ruta: "/compras/proveedores",
  permiso: "proveedores_ver",
  campos: [
    { clave: "id", titulo: "N.º", sql: "pr.id::int", formato: "entero" },
    { clave: "nombre", titulo: "Proveedor", sql: "pr.nombre", ancho: 28 },
    { clave: "razon_social", titulo: "Razón social", sql: "pr.razon_social", ancho: 28 },
    { clave: "cuit", titulo: "CUIT", sql: "pr.cuit" },
    { clave: "iva", titulo: "Condición IVA", sql: "pr.condicion_iva", valor: traducido("iva", CONDICIONES_IVA) },
    { clave: "pais", titulo: "País", sql: "pr.pais" },
    { clave: "contacto", titulo: "Contacto", sql: "pr.contacto" },
    { clave: "email", titulo: "Mail", sql: "pr.email", ancho: 28 },
    { clave: "telefono", titulo: "Teléfono", sql: "pr.telefono" },
    { clave: "calle", titulo: "Dirección", sql: "pr.calle", ancho: 28 },
    { clave: "localidad", titulo: "Localidad", sql: "pr.localidad" },
    { clave: "provincia", titulo: "Provincia", sql: "pr.provincia" },
    { clave: "moneda", titulo: "Moneda", sql: "pr.moneda", valor: (f) => (f.moneda === "USD" ? "Dólares" : "Pesos") },
    { clave: "condiciones_pago", titulo: "Condiciones de pago", sql: "pr.condiciones_pago", ancho: 30 },
    { clave: "facturas", titulo: "Facturas", sql: `${FACTURAS_PROVEEDOR}::int`, orden: FACTURAS_PROVEEDOR, formato: "entero" },
    {
      clave: "comprado", titulo: "Total facturado $", formato: "pesos",
      sql: "(select coalesce(sum(case when f.es_nota_credito then -f.total_ars else f.total_ars end), 0)::float from factura_compra f where f.proveedor_id = pr.id and f.estado = 'registrada')",
      sqlUsd: "(select coalesce(sum(case when f.es_nota_credito then -f.total_usd else f.total_usd end), 0)::float from factura_compra f where f.proveedor_id = pr.id and f.estado = 'registrada')",
    },
    campoFecha("ultima", "Última factura", "(select max(f.fecha) from factura_compra f where f.proveedor_id = pr.id)", { dia: true }),
    { clave: "estado", titulo: "Estado", sql: "pr.estado", valor: (f) => (f.estado === "activo" ? "Activo" : "Archivado") },
    { clave: "notas", titulo: "Notas", sql: "pr.notas", orden: false, ancho: 40 },
  ],
  enPantalla: ["id", "nombre", "cuit", "iva", "contacto", "telefono", "email", "moneda", "facturas", "estado"],
  consulta: async (ctx, sp) => {
    const q = sp.q?.trim() ?? "";
    const comienza = sp.contiene !== "1";
    return {
      desde: "proveedor pr",
      donde: `pr.organizacion_id = $1 and ($4 = 0 or pr.id = $4)
         and ${sqlBusqueda("$2", ["pr.nombre", "pr.razon_social", "pr.email", "pr.cuit"], { param: "$3", campos: ["pr.cuit"] })}`,
      valores: [ctx.org, patronesBusqueda(q, comienza), digitosBusqueda(q), Number(sp.id) || 0],
      orden: "pr.estado, pr.nombre, pr.id",
    };
  },
};
