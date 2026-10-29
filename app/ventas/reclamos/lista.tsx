// Reclamos y devoluciones como lista configurable (lib/listas/tipos.ts): la
// misma consulta para la pantalla y su "Descargar Excel" (pestaña, filtros,
// búsqueda y orden).

import Link from "next/link";
import { Estado } from "@/app/componentes/erp";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import { parametroBusqueda, sqlBusqueda, type CampoBusqueda } from "@/lib/busqueda";
import { campoFecha, traducido, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import {
  CONDICION_RECLAMOS, SQL_QUE_FALTA_DEVOLUCION, ORDEN_ABIERTOS, ESTADOS_RECLAMO, TIPOS_RECLAMO, ORIGENES_RECLAMO, esPestanaReclamos, type PestanaReclamos, type EstadoReclamo,
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
  { clave: "venta_ml", titulo: "Venta de ML (id interno)", orden: false,
    sql: "(select mv.id::int from ml_venta mv where mv.canal_id = r.canal_id and (mv.order_id::text = r.orden_externa or mv.pack_id::text = r.orden_externa) order by mv.id limit 1)" },
  { clave: "origen", titulo: "Origen", sql: "r.origen", valor: traducido("origen", ORIGENES_RECLAMO) },
  { clave: "canal", titulo: "Canal / cuenta", sql: "coalesce(ca.nombre, '—')" },
  {
    clave: "pedido", titulo: "Pedido", sql: "r.pedido_id::int", orden: "r.pedido_id", formato: "entero",
    celda: (f) => f.pedido ? <Link href={`/ventas/pedidos/${f.pedido}`} className="font-semibold text-[#16577F] hover:underline">{f.pedido}</Link>
      : f.venta_ml ? <Link href={`/ventas/historial/${f.venta_ml}`} className="font-mono text-[10px] text-[#16577F] hover:underline" title="Venta de ML sin pedido en Laucen: ver la venta">{f.orden}</Link>
      : f.orden ? <span className="font-mono text-[10px] text-[#5C6B76]" title="Orden de ML sin pedido en Laucen">{f.orden}</span> : "—",
    usa: ["orden", "venta_ml"],
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
  {
    // El producto reclamado (Fer, 29/10: para gestionar sin abrir cada uno): la primera línea del pedido o, en una venta
    // anterior a Laucen, el primer producto de la orden de ML; la foto, la del producto de Laucen.
    clave: "producto", titulo: "Producto", orden: false, ancho: 50,
    sql: `(select jsonb_build_object('id', v.producto_id, 'sku', coalesce(v.sku, x.sku), 't', x.t, 'c', x.c, 'mas', x.mas,
             'f', (select array_agg(y.url) from (select pf.url from producto_foto pf where pf.producto_id = v.producto_id order by pf.orden, pf.id limit 6) y))
            from (select l.variacion_id, null::text sku, l.titulo t, l.cantidad::int c, (select count(*) from pedido_linea l2 where l2.pedido_id = r.pedido_id)::int - 1 mas
                    from pedido_linea l where l.pedido_id = r.pedido_id
                  union all
                  select null, i ->> 'sku', i ->> 'titulo', (i ->> 'cantidad')::int, jsonb_array_length(r.datos_externos -> 'orden_ml' -> 'items') - 1
                    from jsonb_array_elements(case when r.pedido_id is null and jsonb_typeof(r.datos_externos -> 'orden_ml' -> 'items') = 'array'
                                                   then r.datos_externos -> 'orden_ml' -> 'items' else '[]'::jsonb end) i
                  limit 1) x
            left join variacion v on v.organizacion_id = r.organizacion_id
                  and (v.id = x.variacion_id or (x.variacion_id is null and regexp_replace(v.sku, '^DE-', '', 'i') = regexp_replace(x.sku, '^DE-', '', 'i'))))`,
    valor: (f) => { const p = f.producto as { sku?: string; t?: string; c?: number } | null; return p ? `${p.c ?? ""} × ${p.sku ?? ""} ${p.t ?? ""}`.trim() : ""; },
    celda: (f) => {
      const p = f.producto as { id?: number; sku?: string; t?: string; c?: number; mas?: number; f?: string[] | null } | null;
      if (!p) return "—";
      return (
        <div className="flex items-start gap-1.5 max-w-80">
          {p.f?.length ? <FotosProducto fotos={p.f} titulo={p.t ?? ""} /> : <span className="w-7 shrink-0" />}
          <div className="min-w-0">
            <span className="whitespace-nowrap">{p.c != null && <span className="tabular-nums">{p.c} × </span>}
              {p.id ? <Link href={`/catalogo/productos/${p.id}`} className="font-mono text-[#16577F] hover:underline">{p.sku}</Link> : <span className="font-mono">{p.sku ?? "—"}</span>}
              {p.mas ? <span className="text-[10px] text-[#5C6B76]"> y {p.mas} más</span> : null}</span>
            <TituloCorto titulo={p.t} />
          </div>
        </div>
      );
    },
  },
  {
    // Por qué está en «Devoluciones pendientes» (Fer, 29/10: varios figuran cerrados y no se entendía).
    clave: "falta", titulo: "Qué falta", sql: SQL_QUE_FALTA_DEVOLUCION, orden: false, ancho: 30,
    celda: (f) => f.falta ? <Estado texto={String(f.falta)} tono={String(f.falta).startsWith("ML espera") ? "rojo" : String(f.falta).startsWith("Llegó") ? "amarillo" : "azul"} /> : <span className="text-[#5C6B76]">—</span>,
  },
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
  enPantalla: ["id", "producto", "falta", "vence", "fecha", "canal", "pedido", "comprador", "tipo", "motivo", "etapa", "estado", "devolucion", "monto"],
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
