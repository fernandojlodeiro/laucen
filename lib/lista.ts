// Listas de los ABM (pedido de Fer, 3/10): de a una página (?p=), ordenables
// tocando el título de la columna (?orden=<col>&dir=asc|desc). Lo de la
// pantalla (encabezado ordenable y paginador) está en app/componentes/Lista.tsx.
//
// El orden sale SIEMPRE de una lista blanca columna → expresión SQL: lo que
// llega por la dirección sólo elige una clave, nunca se pega en el SQL.

import { consulta } from "@/lib/erp/base";
import { POR_PAGINA } from "@/lib/por-pagina";

export { POR_PAGINA };

type SP = { p?: string; orden?: string; dir?: string };

/** La página pedida (1 en adelante) y su desplazamiento. */
export function leerPagina(sp: SP) {
  const p = Math.max(1, Math.floor(Number(sp.p)) || 1);
  return { p, desde: (p - 1) * POR_PAGINA };
}

/** El ORDER BY: la columna elegida (si está en la lista blanca) y después el
 *  orden de siempre, que desempata. Sin elegir, el de siempre. */
export function leerOrden(sp: SP, columnas: Record<string, string>, defecto: string): string {
  const col = sp.orden && Object.hasOwn(columnas, sp.orden) ? columnas[sp.orden] : null;
  if (!col) return defecto;
  return `${col} ${sp.dir === "desc" ? "desc" : "asc"} nulls last, ${defecto}`;
}

/** Una página de una consulta y el total de filas. Dos consultas (la página y
 *  el conteo) para que lo caro de cada fila (subconsultas en `campos`) se
 *  calcule sólo para las filas que se muestran. */
export async function consultaPaginada<T extends Record<string, unknown>>(
  partes: { campos: string; desde: string; donde: string; orden: string },
  valores: unknown[], sp: SP,
): Promise<{ filas: T[]; total: number }> {
  const { desde } = leerPagina(sp);
  const [filas, [n]] = await Promise.all([
    consulta<T>(`select ${partes.campos} from ${partes.desde} where ${partes.donde} order by ${partes.orden} limit ${POR_PAGINA} offset ${desde}`, valores),
    consulta<{ n: number }>(`select count(*)::int n from ${partes.desde} where ${partes.donde}`, valores),
  ]);
  return { filas, total: n?.n ?? 0 };
}

/** Lo mismo para listas que ya se traen enteras (un árbol, una lista corta). */
export function paginarEnMemoria<T>(filas: T[], sp: SP): T[] {
  const { desde } = leerPagina(sp);
  return filas.slice(desde, desde + POR_PAGINA);
}

/** Orden en memoria: la columna elegida (de la lista blanca) o como vino. */
export function ordenarEnMemoria<T>(filas: T[], sp: SP, columnas: Record<string, (f: T) => string | number | null | undefined>): T[] {
  const valor = sp.orden && Object.hasOwn(columnas, sp.orden) ? columnas[sp.orden] : null;
  if (!valor) return filas;
  const signo = sp.dir === "desc" ? -1 : 1;
  return [...filas].sort((a, b) => {
    const x = valor(a), y = valor(b);
    if (x == null || x === "") return y == null || y === "" ? 0 : 1;
    if (y == null || y === "") return -1;
    return signo * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true }));
  });
}
