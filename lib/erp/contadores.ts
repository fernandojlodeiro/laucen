// Los contadores de la barra de estado (pedidos nuevos, preguntas sin
// responder…). Cada sesión que tenga algo para contar agrega acá su entrada:
// un texto, un número y adónde lleva. Uno sin `contar` se muestra apagado
// ("próximamente").

import { una } from "@/lib/erp/base";

export type Contador = { texto: string; n: number | null; href?: string };

export async function contadoresEstado(org: string): Promise<Contador[]> {
  const pedidos = await una<{ n: number }>(
    "select count(*)::int n from pedido where organizacion_id = $1 and estado in ('nuevo', 'pagado')", [org],
  ).catch(() => null);
  return [
    { texto: "Pedidos sin preparar", n: pedidos?.n ?? 0, href: "/ventas/pedidos?estado=pendientes" },
    { texto: "Preguntas sin responder", n: null },
  ];
}
