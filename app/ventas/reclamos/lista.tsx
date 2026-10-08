// Reclamos y devoluciones como lista configurable (lib/listas/tipos.ts): la
// misma consulta para la pantalla y su "Descargar Excel" (pestaña, filtros,
// búsqueda y orden).

import Link from "next/link";
import { Estado } from "@/app/componentes/erp";
import { parametroBusqueda, sqlBusqueda, type CampoBusqueda } from "@/lib/busqueda";
import { campoFecha, traducido, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import {
  CONDICION_RECLAMOS, ORDEN_ABIERTOS, ESTADOS_RECLAMO, TIPOS_RECLAMO, ORIGENES_RECLAMO, esPestanaReclamos, type PestanaReclamos, type EstadoReclamo,
} from "@/lib/reclamos";
import { ETAPAS_ML, ESTADOS_DEVOLUCION } from "@/lib/mercadolibre/reclamos";
import { enMoneda, formatear } from "@/lib/moneda";
import { tiempoParaResponder, TONO_RECLAMO } from "./formato";

const esFecha = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");

/** Los filtros de la pantalla, leídos de la dirección. */
export function filtrosReclamos(sp: SP) {
  return {
    ver: (esPestanaReclamos(sp.ver) ? sp.ver : "abiertos") as PestanaReclamos,
    canal: Number(sp.canal) || 0,
    motivo: sp.motivo?.trim() ?? "",
    desde: esFecha(sp.desde),
    hasta: esFecha(sp.hasta),
    q: sp.q?.trim() ?? "",
  };
}

const AL_RECLAMO = "hover:underline";

const CAMPOS: Campo[] = [
  { clave: "id", titulo: "Nº", sql: "r.id::int", formato: "entero", celda: (f) => <Link href={`/ventas/reclamos/${f.id}`} className="font-semibold text-[#16577F] hover:underline">{f.id}</Link> },
  {
    clave: "vence", titulo: "Para responder", sql: "to_char(r.vence_ts at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI')", orden: "r.vence_ts",
    formato: "fechahora", desc: false, usa: ["vence_ts", "espera", "estado"],
    celda: (f) => {
      if (f.estado === "resuelto") return <span className="text-[#5C6B76]">—</span>;
      const t = tiempoParaResponder(f.vence_ts);
      if (!t) return f.espera ? <Estado texto="Espera tu respuesta" tono="amarillo" /> : <span className="text-[#5C6B76]">—</span>;
      return <span title={String(f.vence ?? "")}><Estado texto={t.texto} tono={f.espera ? t.tono : "gris"} /></span>;
    },
  },
  { clave: "vence_ts", titulo: "Vence (crudo)", sql: "r.vence_ts", orden: false },
  { clave: "espera", titulo: "Espera tu respuesta", sql: "r.espera_respuesta", formato: "sino" },
  { ...campoFecha("fecha", "Fecha", "r.fecha", { hora: true }), celda: (f) => {
    const [d, h] = String(f.fecha ?? "").split(" ");
    return <Link href={`/ventas/reclamos/${f.id}`} className={`${AL_RECLAMO} whitespace-nowrap`}>{d?.split("-").reverse().join("/")} {h}</Link>;
  } },
  { clave: "origen", titulo: "Origen", sql: "r.origen", valor: traducido("origen", ORIGENES_RECLAMO) },
  { clave: "canal", titulo: "Canal / cuenta", sql: "coalesce(ca.nombre, '—')" },
  {
    clave: "pedido", titulo: "Pedido", sql: "r.pedido_id::int", orden: "r.pedido_id", formato: "entero",
    celda: (f) => f.pedido ? <Link href={`/ventas/pedidos/${f.pedido}`} className="font-semibold text-[#16577F] hover:underline">{f.pedido}</Link>
      : f.orden ? <span className="font-mono text-[10px] text-[#5C6B76]" title="Orden de ML sin pedido en Laucen">{f.orden}</span> : "—",
    usa: ["orden"],
  },
  { clave: "orden", titulo: "Orden de ML", sql: "r.orden_externa", ancho: 18 },
  {
    clave: "comprador", titulo: "Comprador", sql: "coalesce(cl.nombre, case when r.comprador_externo is not null then 'Usuario ML ' || r.comprador_externo end)", ancho: 28,
    usa: ["cliente_id"],
    celda: (f) => f.cliente_id ? <Link href={`/ventas/clientes/${f.cliente_id}`} className="text-[#16577F] hover:underline">{f.comprador}</Link> : (f.comprador ?? "—"),
  },
  { clave: "cliente_id", titulo: "Nº de cliente", sql: "r.cliente_id::int", formato: "entero" },
  { clave: "tipo", titulo: "Tipo", sql: "r.tipo", valor: traducido("tipo", TIPOS_RECLAMO) },
  { clave: "motivo", titulo: "Motivo", sql: "r.motivo", ancho: 36 },
  { clave: "etapa", titulo: "Etapa", sql: "r.etapa", valor: traducido("etapa", ETAPAS_ML) },
  {
    clave: "estado", titulo: "Estado", sql: "r.estado", valor: traducido("estado", ESTADOS_RECLAMO),
    celda: (f) => <Estado texto={ESTADOS_RECLAMO[f.estado as EstadoReclamo] ?? f.estado} tono={TONO_RECLAMO[f.estado as EstadoReclamo] ?? "gris"} />,
  },
  { clave: "devolucion", titulo: "Devolución", sql: "coalesce(r.devolucion_envio_estado, r.devolucion_estado)", valor: traducido("devolucion", ESTADOS_DEVOLUCION) },
  { clave: "monto", titulo: "Monto", sql: "r.monto::float", sqlUsd: "(r.monto / nullif(r.tc_dia, 0))::float", orden: "r.monto", formato: "pesos", celda: (f, c) => f.monto == null ? "—" : c.moneda === "USD" && f.monto__usd != null ? formatear(Number(f.monto__usd), "USD") : enMoneda(f.monto, c.moneda, c.tc ?? null) },
  { clave: "reembolso", titulo: "Devuelto $", sql: "r.reembolso_ars::float", sqlUsd: "(r.reembolso_ars / nullif(r.tc_dia, 0))::float", orden: "r.reembolso_ars", formato: "pesos" },
  { clave: "resolucion", titulo: "Resolución", sql: "r.resolucion", ancho: 36 },
  { clave: "id_externo", titulo: "Id del reclamo (ML)", sql: "r.id_externo", ancho: 16 },
];

/** Dónde busca el buscador: los campos de texto del reclamo y, como antes, el N.º y el id externo
 *  del pedido y el nombre del cliente. */
const BUSCA_EN: CampoBusqueda[] = [
  "r.id::text", "r.id_externo", "r.orden_externa", "r.comprador_externo", "r.motivo", "r.resolucion", "r.devolucion_id",
  "r.devolucion_tracking", "r.notas", "r.pedido_id::text", "pe.id_externo", "cl.nombre",
];

export const LISTA_RECLAMOS: Lista = {
  pantalla: "reclamos",
  titulo: "Reclamos y devoluciones",
  ruta: "/ventas/reclamos",
  permiso: "reclamos_ver",
  campos: CAMPOS,
  enPantalla: ["id", "vence", "fecha", "canal", "pedido", "comprador", "tipo", "motivo", "etapa", "estado", "devolucion", "monto"],
  siempre: "r.id::int id, r.canal_id::int canal_id",
  porDefecto: "vence",
  consulta: async (ctx, sp) => {
    const f = filtrosReclamos(sp);
    const valores: unknown[] = [ctx.org];
    const donde = ["r.organizacion_id = $1", CONDICION_RECLAMOS[f.ver]];
    const agregar = (cond: (p: string) => string, v: unknown) => { valores.push(v); donde.push(cond(`$${valores.length}`)); };
    if (f.canal) agregar((p) => `r.canal_id = ${p}`, f.canal);
    if (f.motivo) agregar((p) => `r.motivo = ${p}`, f.motivo);
    if (f.desde) agregar((p) => `r.fecha >= (${p}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'`, f.desde);
    if (f.hasta) agregar((p) => `r.fecha < (${p}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`, f.hasta);
    if (f.q) agregar((p) => sqlBusqueda(p, BUSCA_EN), parametroBusqueda(f.q));
    return {
      desde: `reclamo r
        left join canal ca on ca.id = r.canal_id
        left join pedido pe on pe.id = r.pedido_id
        left join cliente cl on cl.id = r.cliente_id`,
      donde: donde.join(" and "),
      valores,
      // Abiertos: los que esperan tu respuesta primero, por vencimiento. Cerrados: lo último primero.
      orden: f.ver === "cerrados" ? "r.actualizado_ts desc, r.id desc" : ORDEN_ABIERTOS,
    };
  },
};
