// Facturas de compra como lista configurable (lib/listas/tipos.ts): catálogo
// de campos y la consulta con los filtros de la pantalla (la comparten la
// pantalla y su Excel).

import Link from "next/link";
import { Estado, url } from "@/app/componentes/erp";
import { formatear } from "@/lib/moneda";
import { campoFecha, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import { ESTADO_FACTURA } from "../comun";

export function filtrosFacturasCompra(sp: SP) {
  return {
    proveedor: Number(sp.proveedor) || 0,
    estado: sp.estado && Object.hasOwn(ESTADO_FACTURA, sp.estado) ? sp.estado : "",
  };
}

const LINEAS = "(select count(*) from factura_compra_linea l where l.factura_id = f.id)";
/** Con signo: una nota de crédito resta. */
const firmado = (col: string) => `(case when f.es_nota_credito then -f.${col} else f.${col} end)::float`;
const COMPROBANTE = `(case when f.es_nota_credito then 'NC ' when f.es_nota_debito then 'ND ' else '' end) || f.letra || ' '
  || coalesce(lpad(f.punto_venta::text, 5, '0') || '-', '') || coalesce(lpad(f.numero::text, 8, '0'), 's/n')`;

const CAMPOS: Campo[] = [
  { ...campoFecha("fecha", "Fecha", "f.fecha", { dia: true }), celda: (f) => <Link href={`/compras/facturas/${f.id}`} className="hover:underline">{f.fecha?.split("-").reverse().join("/")}</Link> },
  { clave: "proveedor", titulo: "Proveedor", sql: "p.nombre", ancho: 28, celda: (f) => <Link href={url("/compras/proveedores", { id: f.proveedor_id })} className="text-[#16577F] hover:underline">{f.proveedor}</Link> },
  { clave: "proveedor_cuit", titulo: "CUIT del proveedor", sql: "p.cuit" },
  {
    clave: "comprobante", titulo: "Comprobante", sql: COMPROBANTE, orden: "f.numero", ancho: 20,
    celda: (f) => <Link href={`/compras/facturas/${f.id}`} className="font-mono whitespace-nowrap font-semibold text-[#16577F] hover:underline">{f.comprobante}</Link>,
  },
  { clave: "letra", titulo: "Letra", sql: "f.letra" },
  { clave: "nota_credito", titulo: "Nota de crédito", sql: "f.es_nota_credito", formato: "sino" },
  { clave: "nota_debito", titulo: "Nota de débito", sql: "f.es_nota_debito", formato: "sino" },
  { clave: "origen", titulo: "Origen", sql: "f.origen", valor: (f) => (f.origen === "arca_mc" ? "ARCA (Mis Comprobantes)" : "A mano") },
  { clave: "cae", titulo: "CAE", sql: "f.cae" },
  { clave: "punto_venta", titulo: "Punto de venta", sql: "f.punto_venta", formato: "entero" },
  { clave: "numero", titulo: "Número", sql: "f.numero::text", orden: "f.numero" },
  campoFecha("vencimiento", "Vencimiento", "f.vencimiento", { dia: true }),
  { clave: "lineas", titulo: "Líneas", sql: `${LINEAS}::int`, orden: LINEAS, formato: "entero", celda: (f) => <Link href={`/compras/facturas/${f.id}`} className="hover:underline">{f.lineas}</Link> },
  { clave: "moneda", titulo: "Moneda", sql: "f.moneda" },
  { clave: "cotizacion", titulo: "Cotización", sql: "f.cotizacion::float", formato: "decimal" },
  { clave: "neto", titulo: "Neto", sql: firmado("neto"), orden: "f.neto", formato: "decimal" },
  { clave: "iva", titulo: "IVA", sql: firmado("iva"), orden: "f.iva", formato: "decimal" },
  { clave: "percepcion_iva", titulo: "Percepción IVA", sql: firmado("percepcion_iva"), orden: "f.percepcion_iva", formato: "decimal" },
  { clave: "percepcion_iibb", titulo: "Percepción IIBB", sql: firmado("percepcion_iibb"), orden: "f.percepcion_iibb", formato: "decimal" },
  { clave: "otros_impuestos", titulo: "Otros impuestos", sql: firmado("otros_impuestos"), orden: "f.otros_impuestos", formato: "decimal" },
  { clave: "no_gravado", titulo: "No gravado", sql: firmado("no_gravado"), orden: "f.no_gravado", formato: "decimal" },
  {
    clave: "total", titulo: "Total", sql: firmado("total"), orden: "f.total", formato: "decimal", usa: ["moneda"],
    celda: (f) => formatear(f.total, f.moneda),
  },
  { clave: "total_ars", titulo: "Total $", sql: firmado("total_ars"), sqlUsd: firmado("total_usd"), orden: "f.total_ars", formato: "pesos" },
  { clave: "total_usd", titulo: "Total US$", sql: firmado("total_usd"), orden: "f.total_usd", formato: "usd" },
  { clave: "deposito", titulo: "Depósito", sql: "(select d.nombre from deposito d where d.id = f.deposito_id)" },
  {
    clave: "estado", titulo: "Estado", sql: "f.estado", valor: (f) => ESTADO_FACTURA[f.estado]?.texto ?? f.estado,
    celda: (f) => { const e = ESTADO_FACTURA[f.estado] ?? ESTADO_FACTURA.borrador; return <Estado texto={e.texto} tono={e.tono} />; },
  },
  { clave: "emisor", titulo: "Razón social", sql: "(select coalesce(e.nombre, e.razon_social) from emisor e where e.id = f.emisor_id)", ancho: 24 },
  { clave: "notas", titulo: "Notas", sql: "f.notas", orden: false, ancho: 40 },
];

export const LISTA_FACTURAS_COMPRA: Lista = {
  pantalla: "facturas_compra",
  titulo: "Facturas de compra",
  ruta: "/compras/facturas",
  permiso: "compras_ver",
  vistas: true,
  porDefecto: "fecha",
  campos: CAMPOS,
  enPantalla: ["fecha", "proveedor", "comprobante", "lineas", "total", "estado"],
  siempre: "f.id::int id, f.proveedor_id::int proveedor_id",
  consulta: async (ctx, sp) => {
    const { proveedor, estado } = filtrosFacturasCompra(sp);
    return {
      desde: "factura_compra f join proveedor p on p.id = f.proveedor_id",
      donde: "f.organizacion_id = $1 and ($2 = 0 or f.proveedor_id = $2) and ($3 = '' or f.estado = $3) and ($4::bigint is null or f.emisor_id = $4)",
      valores: [ctx.org, proveedor, estado, Number(sp.rs) || null],
      orden: "f.fecha desc, f.id desc",
    };
  },
};
