// Los contadores de la barra de estado (pedidos nuevos, preguntas sin
// responder…). Cada sesión que tenga algo para contar agrega acá su entrada:
// un texto, un número y adónde lleva. Uno sin `contar` se muestra apagado
// ("próximamente").

import { una } from "@/lib/erp/base";
import { sqlPedidoPendiente } from "@/lib/pedidos";

export type Contador = { texto: string; n: number | null; href?: string };

export async function contadoresEstado(org: string): Promise<Contador[]> {
  const pedidos = await una<{ n: number }>(
    `select count(*)::int n from pedido p where p.organizacion_id = $1 and ${sqlPedidoPendiente("p")}`, [org],
  ).catch(() => null);
  const preguntas = await una<{ n: number }>(
    "select count(*)::int n from meli_pregunta where organizacion_id = $1 and estado = 'UNANSWERED'", [org],
  ).catch(() => null);
  const mensajes = await una<{ n: number }>(
    "select coalesce(sum(sin_leer), 0)::int n from meli_conversacion where organizacion_id = $1", [org],
  ).catch(() => null);
  return [
    { texto: "Pedidos sin preparar", n: pedidos?.n ?? 0, href: "/ventas/pedidos?estado=pendientes" },
    { texto: "Preguntas sin responder", n: preguntas?.n ?? 0, href: "/ventas/preguntas" },
    { texto: "Mensajes sin leer", n: mensajes?.n ?? 0, href: "/ventas/preguntas?ver=mensajes" },
  ];
}
