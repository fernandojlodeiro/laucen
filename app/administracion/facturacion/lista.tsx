// Facturación (comprobantes emitidos) como lista configurable
// (lib/listas/tipos.ts): catálogo de campos y la consulta con los filtros de
// la pantalla (la comparten la pantalla y su Excel).

import Link from "next/link";
import { Estado } from "@/app/componentes/erp";
import { formatear } from "@/lib/moneda";
import { TIPOS_CBTE, DOC_TIPOS, CONDICION_RECEPTOR_TEXTO } from "@/lib/arca/facturar";
import { campoFecha, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import { ESTADOS_CBTE, numeroCbte, nombreTipo, type EstadoCbte } from "./comun";

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
    valor: (f) => (f.doc_tipo === 99 ? "Consumidor final" : `${DOC_TIPOS[f.doc_tipo] ?? ""} ${f.documento}`.trim()),
    celda: (f) => <span className="whitespace-nowrap">{f.doc_tipo === 99 ? "Consumidor final" : `${DOC_TIPOS[f.doc_tipo] ?? ""} ${f.documento}`}</span>,
  },
  { clave: "doc_tipo", titulo: "Tipo de documento", sql: "c.doc_tipo", valor: (f) => DOC_TIPOS[f.doc_tipo] ?? String(f.doc_tipo) },
  { clave: "condicion_iva", titulo: "Condición IVA del receptor", sql: "c.receptor_condicion_iva", valor: (f) => f.condicion_iva == null ? null : CONDICION_RECEPTOR_TEXTO[f.condicion_iva] ?? String(f.condicion_iva) },
  { clave: "domicilio", titulo: "Domicilio del receptor", sql: "c.receptor_domicilio", orden: false, ancho: 30 },
  { clave: "neto", titulo: "Neto", sql: firmado("importe_neto"), orden: "c.importe_neto", formato: "pesos" },
  { clave: "iva", titulo: "IVA", sql: firmado("importe_iva"), orden: "c.importe_iva", formato: "pesos" },
  { clave: "total", titulo: "Total", sql: "c.importe_total::float", orden: "c.importe_total", formato: "pesos", celda: (f) => formatear(f.total, "ARS") },
  { clave: "total_firmado", titulo: "Total (NC en negativo)", sql: firmado("importe_total"), orden: false, formato: "pesos" },
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
  enPantalla: ["fecha", "tipo", "numero", "receptor", "documento", "total", "estado", "cae", "pedido"],
  siempre: "c.id::int id, c.cliente_id::int cliente_id, c.estado _estado",
  consulta: async (ctx, sp) => {
    const f = filtrosFacturacion(sp);
    const cond = ["c.organizacion_id = $1"];
    const vals: unknown[] = [ctx.org];
    const sumar = (sql: string, v: unknown) => { vals.push(v); cond.push(sql.replace("?", `$${vals.length}`)); };
    if (f.estado) sumar("c.estado = ?", f.estado);
    if (f.tipo) sumar("c.tipo_cbte = ?", Number(f.tipo));
    if (f.desde) sumar("c.fecha >= ?::date", f.desde);
    if (f.hasta) sumar("c.fecha <= ?::date", f.hasta);
    if (f.q) {
      vals.push(`%${f.q}%`);
      const n = `$${vals.length}`;
      cond.push(`(lpad(c.punto_venta::text, 5, '0') || '-' || lpad(c.numero::text, 8, '0') ilike ${n} or c.numero::text = regexp_replace(${n}, '[^0-9]', '', 'g')
                  or c.receptor_nombre ilike ${n} or c.doc_nro ilike ${n} or c.cae ilike ${n} or cl.nombre ilike ${n})`);
    }
    return {
      desde: "comprobante c left join pedido p on p.id = c.pedido_id left join cliente cl on cl.id = c.cliente_id",
      donde: cond.join(" and "),
      valores: vals,
      orden: "c.fecha desc, c.id desc",
    };
  },
};
