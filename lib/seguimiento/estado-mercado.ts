// El estado del precio de mercado de cada producto (Fer, 13/10), según lo que se sigue de la competencia:
//   · confirmado: sigue al menos una publicación que una persona agregó o revisó;
//   · sin_confirmar: sólo sigue publicaciones que agregó sola la búsqueda de precio de mercado, sin revisar;
//   · sin_seguimiento: no sigue ninguna.
// No cuentan las excluidas de la regla. Se muestra con una marca al lado del precio (app/componentes/MarcaMercado.tsx)
// y se filtra con `filtroEstadoMercado` en las listas.

import { consulta } from "@/lib/erp/base";

export const ESTADOS_MERCADO = {
  confirmado: { texto: "Precio de mercado confirmado", ayuda: "Sigue publicaciones de la competencia revisadas por una persona." },
  sin_confirmar: { texto: "Monitoreado sin confirmar", ayuda: "Sólo sigue publicaciones que eligió sola la búsqueda de precio de mercado: falta que una persona las revise." },
  sin_seguimiento: { texto: "Sin seguimiento", ayuda: "No sigue ninguna publicación de la competencia." },
} as const;
export type EstadoMercado = keyof typeof ESTADOS_MERCADO;
export const esEstadoMercado = (x: unknown): x is EstadoMercado => typeof x === "string" && Object.hasOwn(ESTADOS_MERCADO, x);

/** La expresión SQL del estado de un producto (`prod`: la expresión de su id). */
export const sqlEstadoMercado = (prod: string) => `(case
  when exists (select 1 from seguimiento_pub sg where sg.producto_id = ${prod} and sg.confirmada and not sg.excluido) then 'confirmado'
  when exists (select 1 from seguimiento_pub sg where sg.producto_id = ${prod} and not sg.excluido) then 'sin_confirmar'
  else 'sin_seguimiento' end)`;

/** El pedazo de WHERE para filtrar por estado (lo que llega por la dirección sólo elige de la lista; vacío = todos). */
export function filtroEstadoMercado(valor: string | undefined, prod: string): string {
  return esEstadoMercado(valor) ? ` and ${sqlEstadoMercado(prod)} = '${valor}'` : "";
}

/** El estado de muchos productos de una vez. */
export async function estadosMercado(org: string, productos: number[]): Promise<Map<number, EstadoMercado>> {
  if (!productos.length) return new Map();
  const r = await consulta<{ id: number; estado: EstadoMercado }>(`
    select p.id::int, ${sqlEstadoMercado("p.id")} estado from producto p where p.organizacion_id = $1 and p.id = any($2::bigint[])`, [org, productos]);
  return new Map(r.map((x) => [x.id, x.estado]));
}
