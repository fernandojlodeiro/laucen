// Facturación (comprobantes emitidos) como lista configurable
// (lib/listas/tipos.ts): catálogo de campos y la consulta con los filtros de
// la pantalla (la comparten la pantalla y su Excel).

import Link from "next/link";
import { Estado } from "@/app/componentes/erp";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { formatear } from "@/lib/moneda";
import { cuitLegible } from "@/lib/cuit";
import { TIPOS_CBTE, DOC_TIPOS, CONDICION_RECEPTOR_TEXTO } from "@/lib/arca/facturar";
import { campoFecha, type Campo, type Fila, type Lista, type SP } from "@/lib/listas/tipos";
import { ESTADOS_CBTE, numeroCbte, nombreTipo, type EstadoCbte } from "./comun";
import { sqlEstadoFacturaMl, ESTADO_FACTURA_ML } from "@/lib/mercadolibre/facturas";

/** El documento: un CUIT/CUIL (tipo 80/86) con sus guiones. */
const docLegible = (f: Fila) => (f.doc_tipo === 80 || f.doc_tipo === 86 ? cuitLegible(f.documento) : f.documento);

const esFecha = (x?: string) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);

export function filtrosFacturacion(sp: SP) {
  return {
    estado: sp.estado && Object.hasOwn(ESTADOS_CBTE, sp.estado) ? sp.estado : "",
    tipo: sp.tipo && TIPOS_CBTE[Number(sp.tipo)] ? sp.tipo : "",
    desde: esFecha(sp.desde) ? sp.desde! : "",
    hasta: esFecha(sp.hasta) ? sp.hasta! : "",
    q: sp.q?.trim() ?? "",
  };
}

const RECEPTOR = "coalesce(c.receptor_nombre, cl.nombre)";
/** Con signo: una nota de crédito resta. */
const firmadoUsd = (col: string) => `(case when c.tipo_cbte in (3, 8, 13) then -c.${col} else c.${col} end / nullif(c.tc_dia, 0))::float`;
const firmado = (col: string) => `(case when c.tipo_cbte in (3, 8, 13) then -c.${col} else c.${col} end)::float`;

const CAMPOS: Campo[] = [
  { ...campoFecha("fecha", "Fecha", "c.fecha", { dia: true }), celda: (f) => <Link href={`/administracion/facturacion/${f.id}`} className="hover:underline">{f.fecha?.split("-").reverse().join("/")}</Link> },
  {
    clave: "tipo", titulo: "Tipo", sql: "c.tipo_cbte", valor: (f) => nombreTipo(f.tipo), usa: ["ambiente"],
    celda: (f) => <span className="whitespace-nowrap">{nombreTipo(f.tipo)}{f.ambiente === "homologacion" && <span className="text-[10px] text-[#5C6B76]"> (prueba)</span>}</span>,
  },
  {
    clave: "numero", titulo: "Número", sql: "c.numero::text", orden: "c.numero", usa: ["punto_venta"], valor: (f) => numeroCbte(f.punto_venta, f.numero), desc: true,
    celda: (f) => <Link href={`/administracion/facturacion/${f.id}`} className="font-mono font-semibold text-[#16577F] hover:underline">{numeroCbte(f.punto_venta, f.numero)}</Link>,
  },
  { clave: "punto_venta", titulo: "Punto de venta", sql: "c.punto_venta", formato: "entero" },
  {
    clave: "receptor", titulo: "Receptor", sql: RECEPTOR, ancho: 30,
    celda: (f) => f.cliente_id ? <Link href={`/ventas/clientes/${f.cliente_id}`} className="text-[#16577F] hover:underline">{f.receptor ?? "—"}</Link> : f.receptor ?? "—",
  },
  {
    clave: "documento", titulo: "Documento", sql: "c.doc_nro", usa: ["doc_tipo"],
    valor: (f) => (f.doc_tipo === 99 ? "Consumidor final" : `${DOC_TIPOS[f.doc_tipo] ?? ""} ${docLegible(f)}`.trim()),
    celda: (f) => <span className="whitespace-nowrap">{f.doc_tipo === 99 ? "Consumidor final" : `${DOC_TIPOS[f.doc_tipo] ?? ""} ${docLegible(f)}`}</span>,
  },
  { clave: "doc_tipo", titulo: "Tipo de documento", sql: "c.doc_tipo", valor: (f) => DOC_TIPOS[f.doc_tipo] ?? String(f.doc_tipo) },
  { clave: "condicion_iva", titulo: "Condición IVA del receptor", sql: "c.receptor_condicion_iva", valor: (f) => f.condicion_iva == null ? null : CONDICION_RECEPTOR_TEXTO[f.condicion_iva] ?? String(f.condicion_iva) },
  { clave: "domicilio", titulo: "Domicilio del receptor", sql: "c.receptor_domicilio", orden: false, ancho: 30 },
  { clave: "neto", titulo: "Neto", sql: firmado("importe_neto"), sqlUsd: firmadoUsd("importe_neto"), orden: "c.importe_neto", formato: "pesos" },
  { clave: "iva", titulo: "IVA", sql: firmado("importe_iva"), sqlUsd: firmadoUsd("importe_iva"), orden: "c.importe_iva", formato: "pesos" },
  { clave: "total", titulo: "Total", sql: "c.importe_total::float", sqlUsd: "(c.importe_total / nullif(c.tc_dia, 0))::float", orden: "c.importe_total", formato: "pesos", celda: (f, c) => (c.moneda === "USD" && f.total__usd != null ? formatear(Number(f.total__usd), "USD") : formatear(f.total, "ARS")) },
  { clave: "total_firmado", titulo: "Total (NC en negativo)", sql: firmado("importe_total"), sqlUsd: firmadoUsd("importe_total"), orden: false, formato: "pesos" },
  {
    clave: "estado", titulo: "Estado", sql: "c.estado", valor: (f) => ESTADOS_CBTE[f.estado as EstadoCbte]?.texto ?? f.estado, usa: ["observaciones"],
    celda: (f) => {
      const est = ESTADOS_CBTE[f.estado as EstadoCbte] ?? ESTADOS_CBTE.pendiente;
      return (
        <>
          <Estado texto={est.texto} tono={est.tono} />
          {(f.estado === "rechazado" || f.estado === "error") && f.observaciones &&
            <span className={`block text-[11px] mt-0.5 max-w-xs ${f.estado === "rechazado" ? "text-[#C03420]" : "text-[#8a6100]"}`}>{f.observaciones}</span>}
        </>
      );
    },
  },
  { clave: "observaciones", titulo: "Observaciones de ARCA", sql: "c.observaciones", orden: false, ancho: 40 },
  { clave: "cae", titulo: "CAE", sql: "c.cae", ancho: 16, celda: (f) => <span className="font-mono">{f.cae ?? "—"}</span> },
  campoFecha("cae_vto", "Vencimiento del CAE", "c.cae_vto", { dia: true }),
  {
    clave: "pedido", titulo: "Pedido", sql: "c.pedido_id::int", formato: "entero",
    celda: (f) => f.pedido ? <Link href={`/ventas/pedidos/${f.pedido}`} className="text-[#16577F] hover:underline">{f.pedido}</Link> : "—",
  },
  { clave: "pedido_externo", titulo: "Pedido (id externo)", sql: "p.id_externo" },
  {
    clave: "ml", titulo: "Factura en ML", ancho: 22,
    sql: `(case when ca.tipo = 'mercadolibre' and p.id_externo is not null and c.estado = 'autorizado' then coalesce(${sqlEstadoFacturaMl("c")}, 'falta') end)`,
    valor: (f) => f.ml ? ESTADO_FACTURA_ML[f.ml]?.texto ?? f.ml : null,
    celda: (f) => f.ml ? <Estado texto={ESTADO_FACTURA_ML[f.ml]?.texto ?? f.ml} tono={ESTADO_FACTURA_ML[f.ml]?.tono ?? "gris"} /> : <span className="text-[#5C6B76]">—</span>,
  },
  { clave: "emisor", titulo: "Razón social", sql: "(select coalesce(e.nombre, e.razon_social) from emisor e where e.id = c.emisor_id)", ancho: 24 },
  { clave: "ambiente", titulo: "Ambiente", sql: "c.ambiente", valor: (f) => (f.ambiente === "homologacion" ? "Prueba" : "Producción") },
  campoFecha("autorizado", "Autorizado el", "c.autorizado_ts", { hora: true }),
];

export const LISTA_FACTURACION: Lista = {
  pantalla: "facturacion",
  titulo: "Facturación",
  ruta: "/administracion/facturacion",
  permiso: "facturacion_ver",
  vistas: true,
  porDefecto: "fecha",
  campos: CAMPOS,
  enPantalla: ["fecha", "tipo", "numero", "receptor", "documento", "total", "estado", "cae", "pedido", "ml"],
  siempre: "c.id::int id, c.cliente_id::int cliente_id, c.estado _estado",
  consulta: async (ctx, sp) => {
    const f = filtrosFacturacion(sp);
    const cond = ["c.organizacion_id = $1"];
    const vals: unknown[] = [ctx.org];
    const sumar = (sql: string, v: unknown) => { vals.push(v); cond.push(sql.replace("?", `$${vals.length}`)); };
    if (Number(sp.rs)) sumar("c.emisor_id = ?", Number(sp.rs));
    if (f.estado) sumar("c.estado = ?", f.estado);
    if (f.tipo) sumar("c.tipo_cbte = ?", Number(f.tipo));
    if (f.desde) sumar("c.fecha >= ?::date", f.desde);
    if (f.hasta) sumar("c.fecha <= ?::date", f.hasta);
    if (f.q) {
      // Regla común de búsqueda (lib/busqueda.ts): todos los campos de texto del comprobante
      // (el documento, campo numérico) más el cliente y el pedido que ya se unen.
      vals.push(parametroBusqueda(f.q));
      cond.push(sqlBusqueda(`$${vals.length}`, [
        "c.id::text", "lpad(c.punto_venta::text, 5, '0') || '-' || lpad(c.numero::text, 8, '0')", "c.numero::text",
        "c.receptor_nombre", { num: "c.doc_nro" }, "c.receptor_domicilio", "c.cae", "c.observaciones", "c.estado",
        "c.moneda", "c.ambiente", "c.ml_documento_id", "cl.nombre", "p.id_externo",
      ]));
    }
    return {
      desde: "comprobante c left join pedido p on p.id = c.pedido_id left join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = c.cliente_id",
      donde: cond.join(" and "),
      valores: vals,
      orden: "c.fecha desc, c.id desc",
    };
  },
};
