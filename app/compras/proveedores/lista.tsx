// Proveedores como lista configurable (lib/listas/tipos.ts): "Descargar
// Excel" con los mismos filtros que la pantalla.

import { parametroBusqueda, sqlBusqueda, type CampoBusqueda } from "@/lib/busqueda";
import { cuitLegible } from "@/lib/cuit";
import { telefonoConAclaracion } from "@/lib/telefono";
import { CONDICIONES_IVA } from "@/app/ventas/formato";
import { campoFecha, traducido, type Lista } from "@/lib/listas/tipos";

export const FACTURAS_PROVEEDOR = "(select count(*) from factura_compra f where f.proveedor_id = pr.id)";

/** Dónde busca el buscador: todos los campos de texto del proveedor. */
const BUSCA_EN: CampoBusqueda[] = [
  "pr.id::text", "pr.nombre", "pr.razon_social", { num: "pr.cuit" }, "pr.pais", "pr.email", { num: "pr.telefono" }, "pr.telefono_aclaracion",
  { num: "pr.telefono_movil" }, "pr.telefono_movil_aclaracion",
  "pr.contacto", "pr.calle", "pr.localidad", "pr.provincia", "pr.codigo_postal", "pr.condiciones_pago", "pr.notas",
];

export const LISTA_PROVEEDORES: Lista = {
  pantalla: "proveedores",
  titulo: "Proveedores",
  ruta: "/compras/proveedores",
  permiso: "proveedores_ver",
  campos: [
    { clave: "id", titulo: "N.º", sql: "pr.id::int", formato: "entero" },
    { clave: "nombre", titulo: "Proveedor", sql: "pr.nombre", ancho: 28 },
    { clave: "razon_social", titulo: "Razón social", sql: "pr.razon_social", ancho: 28 },
    { clave: "cuit", titulo: "CUIT", sql: "pr.cuit", valor: (f) => (f.cuit ? cuitLegible(f.cuit as string) : null) },
    { clave: "iva", titulo: "Condición IVA", sql: "pr.condicion_iva", valor: traducido("iva", CONDICIONES_IVA) },
    { clave: "pais", titulo: "País", sql: "pr.pais" },
    { clave: "contacto", titulo: "Contacto", sql: "pr.contacto" },
    { clave: "email", titulo: "Mail", sql: "pr.email", ancho: 28 },
    { clave: "telefono", titulo: "Teléfono", sql: "pr.telefono", usa: ["telefono_aclaracion"], valor: (f) => telefonoConAclaracion(f.telefono, f.telefono_aclaracion) || null },
    { clave: "telefono_aclaracion", titulo: "Interno / aclaración del teléfono", sql: "pr.telefono_aclaracion" },
    { clave: "telefono_movil", titulo: "Celular", sql: "pr.telefono_movil", usa: ["telefono_movil_aclaracion"], valor: (f) => telefonoConAclaracion(f.telefono_movil, f.telefono_movil_aclaracion) || null },
    { clave: "telefono_movil_aclaracion", titulo: "Interno / aclaración del celular", sql: "pr.telefono_movil_aclaracion" },
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
      donde: `pr.organizacion_id = $1 and ($3 = 0 or pr.id = $3)
         and ${sqlBusqueda("$2", BUSCA_EN)}`,
      valores: [ctx.org, parametroBusqueda(q, comienza), Number(sp.id) || 0],
      orden: "pr.estado, pr.nombre, pr.id",
    };
  },
};
