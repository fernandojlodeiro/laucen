// Los contadores de la barra de estado (reclamos para atender, preguntas sin
// responder, pedidos a preparar…). Cada sesión que tenga algo para contar agrega acá su entrada:
// una clave, un texto, un número, adónde lleva y su «marca» (un número que
// crece cuando entra algo nuevo: con eso se sabe si el usuario ya lo vio).
// Cada uno sale sólo si el usuario puede abrir su pantalla.

import { una } from "@/lib/erp/base";
import { sqlPedidoPendiente } from "@/lib/pedidos";
import { SQL_DERIVADA_ESPERA, SQL_SIN_RESPONDER } from "@/lib/mercadolibre/sql-mensajes";
import type { ClaveContador, Contador } from "@/lib/avisos-tipos";
import type { PermisoKey } from "@/lib/permisos";

export type { Contador };

type Cuenta = { n: number; marca: number | null; persona?: number | null };

// Para atender: lo que Mercado Libre espera que respondas, y los de la web o el local sin tocar (como el resumen de lib/reclamos).
export const SQL_RECLAMO_A_ATENDER = "r.estado <> 'resuelto' and (r.espera_respuesta or (r.origen <> 'mercadolibre' and r.estado = 'abierto'))";

// En el orden de la barra (Fer, 11/10): reclamos, mensajes, preguntas, WhatsApp y pedidos.
const CONTADORES: { clave: ClaveContador; texto: string; href: string; permiso: PermisoKey; sql: string }[] = [
  {
    clave: "reclamos", texto: "Reclamos", href: "/ventas/reclamos", permiso: "reclamos_ver",
    // La marca crece con un reclamo nuevo y con cada mensaje nuevo del comprador o de Mercado Libre.
    sql: `select count(*)::int n, floor(extract(epoch from max(greatest(r.creado_ts,
            coalesce((select max(m.fecha) from reclamo_mensaje m where m.reclamo_id = r.id and m.de in ('comprador', 'ml')), r.creado_ts)))) * 1000)::float8 marca
            from reclamo r where r.organizacion_id = $1 and ${SQL_RECLAMO_A_ATENDER}`,
  },
  {
    clave: "mensajes", texto: "Mensajes", href: "/ventas/preguntas?ver=mensajes", permiso: "preguntas_ver",
    // Las conversaciones sin responder, no las sin leer (Fer, 22/10): abrirla no la descuenta, contestarla sí.
    // `persona`: las que la IA derivó a una persona y esperan que alguien del equipo conteste (en amarillo: Fer, 25/10).
    sql: `select count(*)::int n, floor(extract(epoch from max(c.ultimo_ts)) * 1000)::float8 marca,
                 count(*) filter (where ${SQL_DERIVADA_ESPERA("c")})::int persona
            from meli_conversacion c where c.organizacion_id = $1 and ${SQL_SIN_RESPONDER("c")}`,
  },
  {
    clave: "preguntas", texto: "Preguntas", href: "/ventas/preguntas", permiso: "preguntas_ver",
    // El número de pregunta de Mercado Libre crece con cada pregunta nueva.
    sql: "select count(*)::int n, max(id)::float8 marca from meli_pregunta where organizacion_id = $1 and estado = 'UNANSWERED'",
  },
  {
    clave: "whatsapp", texto: "WhatsApp", href: "/ventas/mensajes?filtro=en_espera", permiso: "mensajes_ver",
    sql: "select count(*)::int n, max(id)::float8 marca from chat_caso where organizacion_id = $1 and resuelto_ts is null",
  },
  {
    clave: "pedidos", texto: "Pedidos", href: "/ventas/pedidos?estado=pendientes", permiso: "pedidos_ver",
    sql: `select count(*)::int n, max(p.id)::float8 marca from pedido p where p.organizacion_id = $1 and ${sqlPedidoPendiente("p")}`,
  },
  {
    // Facturas que no salieron solas (o que el comprador pide cambiar): lib/facturacion/revision.ts.
    clave: "facturas", texto: "Facturas", href: "/ventas/pedidos?estado=retenidas&ver=facturas", permiso: "facturacion_ver",
    sql: `select count(*)::int n, floor(extract(epoch from max(factura_retenida_ts)) * 1000)::float8 marca
            from pedido where organizacion_id = $1 and factura_retenida is not null`,
  },
];

/** Los contadores, con `nuevo` según hasta dónde vio cada uno el usuario (`visto`: {clave: marca}). */
export async function contadoresEstado(org: string, puede: (p: PermisoKey) => boolean, visto: Record<string, number> = {}): Promise<Contador[]> {
  const mios = CONTADORES.filter((c) => puede(c.permiso));
  const cuentas = await Promise.all(mios.map((c) => una<Cuenta>(c.sql, [org]).catch(() => null)));
  return mios.map((c, i) => {
    const r = cuentas[i];
    const marca = Number(r?.marca ?? 0);
    const n = r?.n ?? 0;
    return { clave: c.clave, texto: c.texto, href: c.href, n, marca, nuevo: n > 0 && marca > Number(visto[c.clave] ?? 0), ...(r?.persona ? { persona: r.persona } : {}) };
  });
}

/** La marca actual de un contador (para guardar «hasta acá lo vio»). */
export async function marcaDe(org: string, clave: ClaveContador): Promise<number> {
  const c = CONTADORES.find((x) => x.clave === clave);
  if (!c) return 0;
  const r = await una<Cuenta>(c.sql, [org]);
  return Number(r?.marca ?? 0);
}
