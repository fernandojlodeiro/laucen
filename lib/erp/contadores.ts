// Los contadores de la barra de estado (pedidos nuevos, preguntas sin
// responder…). Cada sesión que tenga algo para contar agrega acá su entrada:
// una clave, un texto, un número, adónde lleva y su «marca» (un número que
// crece cuando entra algo nuevo: con eso se sabe si el usuario ya lo vio).
// Cada uno sale sólo si el usuario puede abrir su pantalla.

import { una } from "@/lib/erp/base";
import { sqlPedidoPendiente } from "@/lib/pedidos";
import type { ClaveContador, Contador } from "@/lib/avisos-tipos";
import type { PermisoKey } from "@/lib/permisos";

export type { Contador };

type Cuenta = { n: number; marca: number | null };

const CONTADORES: { clave: ClaveContador; texto: string; href: string; permiso: PermisoKey; sql: string }[] = [
  {
    clave: "pedidos", texto: "Pedidos a preparar", href: "/ventas/pedidos?estado=pendientes", permiso: "pedidos_ver",
    sql: `select count(*)::int n, max(p.id)::float8 marca from pedido p where p.organizacion_id = $1 and ${sqlPedidoPendiente("p")}`,
  },
  {
    clave: "preguntas", texto: "Preguntas", href: "/ventas/preguntas", permiso: "preguntas_ver",
    // El número de pregunta de Mercado Libre crece con cada pregunta nueva.
    sql: "select count(*)::int n, max(id)::float8 marca from meli_pregunta where organizacion_id = $1 and estado = 'UNANSWERED'",
  },
  {
    clave: "mensajes", texto: "Mensajes", href: "/ventas/preguntas?ver=mensajes", permiso: "preguntas_ver",
    sql: `select coalesce(sum(sin_leer), 0)::int n, (extract(epoch from max(ultimo_ts)) * 1000)::float8 marca
            from meli_conversacion where organizacion_id = $1 and sin_leer > 0`,
  },
  {
    clave: "whatsapp", texto: "WhatsApp en espera", href: "/ventas/mensajes?filtro=en_espera", permiso: "mensajes_ver",
    sql: "select count(*)::int n, max(id)::float8 marca from chat_caso where organizacion_id = $1 and resuelto_ts is null",
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
    return { clave: c.clave, texto: c.texto, href: c.href, n, marca, nuevo: n > 0 && marca > Number(visto[c.clave] ?? 0) };
  });
}

/** La marca actual de un contador (para guardar «hasta acá lo vio»). */
export async function marcaDe(org: string, clave: ClaveContador): Promise<number> {
  const c = CONTADORES.find((x) => x.clave === clave);
  if (!c) return 0;
  const r = await una<Cuenta>(c.sql, [org]);
  return Number(r?.marca ?? 0);
}
