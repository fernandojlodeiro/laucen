// Listas configurables de los ABM (pedido de Fer, 3/10): cada pantalla con
// lista declara UNA vez su catálogo de campos (clave, título, expresión SQL,
// formato y, si se puede ver en pantalla, cómo se dibuja la celda) y la
// consulta base con sus filtros. Con eso salen solos:
//   · "Descargar Excel" con los filtros, la búsqueda y el orden de la
//     pantalla, con las columnas de una configuración guardada o "Como en
//     pantalla" (lib/listas/excel.ts, app/listas/[pantalla]/excel);
//   · las vistas configurables (qué columnas se ven y en qué orden), en las
//     pantallas que las tienen (app/listas/piezas.tsx).
// Las configuraciones se guardan por organización en lista_config
// (db/listas.sql). El orden por columna sale de la misma lista blanca: lo que
// llega por la dirección sólo elige una clave del catálogo.

import type { ReactNode } from "react";
import type { PermisoKey } from "@/lib/permisos";
import type { Moneda } from "@/lib/moneda";
import { leerOrden, ordenarEnMemoria } from "@/lib/lista";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Fila = Record<string, any>;
export type SP = Record<string, string | undefined>;
/** Lo que una consulta necesita saber de quién la pide. */
export type Ctx = { org: string; moneda: Moneda };

export type Formato = "texto" | "entero" | "pesos" | "usd" | "decimal" | "pct" | "fecha" | "fechahora" | "sino";

export type Campo = {
  clave: string;
  titulo: string;
  /** La expresión SQL (modo consulta). Las fechas conviene darlas como texto
   *  'YYYY-MM-DD' (o 'YYYY-MM-DD HH24:MI' en hora argentina) y ordenar por la
   *  columna cruda con `orden`. */
  sql?: string;
  /** El valor para el Excel (y para la celda por defecto) si no es el de la
   *  columna tal cual: ej. un código traducido a su nombre. */
  valor?: (f: Fila) => unknown;
  formato?: Formato;
  /** Ancho de la columna en el Excel (en caracteres). */
  ancho?: number;
  /** Por qué expresión SQL se ordena (por defecto, `sql`); false = no se ordena. */
  orden?: string | false;
  /** Otras claves del catálogo que necesitan `valor` o `celda`. */
  usa?: string[];
  /** Cómo se dibuja en la pantalla (vistas). Sin esto, según el formato. */
  celda?: (f: Fila, ctx: CtxCelda) => ReactNode;
  /** Primer toque del título: de mayor a menor (por defecto, en números y fechas). */
  desc?: boolean;
};

/** Lo que una celda puede necesitar además de su fila. */
export type CtxCelda = { moneda: Moneda; sp: SP };

/** La consulta base de una lista: de dónde, con qué filtros y su orden de siempre. */
export type Consulta = { desde: string; donde: string; valores: unknown[]; orden: string };

export type Lista = {
  /** La clave de la pantalla (va en la dirección y en lista_config). */
  pantalla: string;
  titulo: string;
  /** La dirección de la pantalla. */
  ruta: string;
  permiso: PermisoKey;
  /** El catálogo de campos (puede depender de la organización: ej. un precio por lista). */
  campos: Campo[] | ((ctx: Ctx) => Promise<Campo[]>);
  /** Las columnas "Como en pantalla" (Excel) o la vista "Estándar". */
  enPantalla: string[];
  /** Modo consulta: la base con los filtros de la pantalla. */
  consulta?: (ctx: Ctx, sp: SP) => Promise<Consulta>;
  /** Modo memoria (árboles, listas cortas con datos calculados): las filas ya filtradas. */
  filas?: (ctx: Ctx, sp: SP) => Promise<Fila[]>;
  /** Columnas SQL que la vista en pantalla trae siempre (los ids de los enlaces). */
  siempre?: string;
  /** Tiene vistas configurables en pantalla. */
  vistas?: boolean;
  /** La clave por la que viene ordenada sin elegir (el ▲ del título). */
  porDefecto?: string;
};

export const ETIQUETA_DEFECTO = { excel: "Como en pantalla", vista: "Estándar" } as const;

export async function camposDe(lista: Lista, ctx: Ctx): Promise<Campo[]> {
  return typeof lista.campos === "function" ? lista.campos(ctx) : lista.campos;
}

/** Los campos de estas claves, en ese orden (las que no existen se ignoran;
 *  si no queda ninguna, las de pantalla). */
export function elegir(lista: Lista, campos: Campo[], claves: string[] | null | undefined): Campo[] {
  const porClave = new Map(campos.map((c) => [c.clave, c]));
  const vistas = new Set<string>();
  const salida: Campo[] = [];
  for (const k of claves ?? []) {
    const c = porClave.get(k);
    if (c && !vistas.has(k)) { vistas.add(k); salida.push(c); }
  }
  if (salida.length) return salida;
  return lista.enPantalla.map((k) => porClave.get(k)).filter((c): c is Campo => !!c);
}

/** El SELECT de los campos elegidos (más los que ellos usan y los de `siempre`). */
export function seleccion(campos: Campo[], todos: Campo[], siempre?: string): string {
  const porClave = new Map(todos.map((c) => [c.clave, c]));
  const claves = new Set<string>();
  for (const c of campos) { claves.add(c.clave); for (const u of c.usa ?? []) claves.add(u); }
  const partes = [...claves].map((k) => porClave.get(k)).filter((c): c is Campo => !!c?.sql).map((c) => `${c.sql} as "${c.clave}"`);
  if (siempre) partes.unshift(siempre);
  return partes.join(", ") || "1 as _";
}

/** La lista blanca de orden: clave → expresión, de todo el catálogo. */
export function ordenables(campos: Campo[]): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const c of campos) {
    const expr = c.orden === false ? null : c.orden ?? c.sql;
    if (expr) salida[c.clave] = expr;
  }
  return salida;
}

/** El ORDER BY de la lista: la columna elegida (si está en el catálogo) y el de siempre. */
export function ordenDe(campos: Campo[], sp: SP, defecto: string): string {
  return leerOrden(sp, ordenables(campos), defecto);
}

/** El valor de un campo en una fila (el de su columna o el que calcula `valor`). */
export function valorDe(c: Campo, f: Fila): unknown {
  return c.valor ? c.valor(f) : f[c.clave];
}

/** Modo memoria: ordenar por la columna elegida, con los valores del catálogo. */
export function ordenarFilas(campos: Campo[], filas: Fila[], sp: SP): Fila[] {
  const columnas: Record<string, (f: Fila) => string | number | null | undefined> = {};
  for (const c of campos) {
    if (c.orden === false) continue;
    columnas[c.clave] = (f) => {
      const v = valorDe(c, f);
      if (v == null) return null;
      if (typeof v === "boolean") return v ? 1 : 0;
      if (v instanceof Date) return v.getTime();
      return typeof v === "number" ? v : String(v);
    };
  }
  return ordenarEnMemoria(filas, sp, columnas);
}

export const esNumerico = (f?: Formato) => f === "entero" || f === "pesos" || f === "usd" || f === "decimal" || f === "pct";
/** Los títulos de números y fechas van a la derecha (AGENTS.md). */
export const alaDerecha = (c: Campo) => esNumerico(c.formato) || c.formato === "fecha" || c.formato === "fechahora";

// ── Ayudas para declarar catálogos ──────────────────────────
const ZONA_SQL = "'America/Argentina/Buenos_Aires'";
/** Un campo de fecha: se muestra/baja como fecha y se ordena por la columna cruda.
 *  `hora`: con hora (timestamptz, en hora argentina). `dia`: la columna ya es date. */
export function campoFecha(clave: string, titulo: string, expr: string, { hora = false, dia = false } = {}): Campo {
  const sql = dia ? `to_char(${expr}, 'YYYY-MM-DD')`
    : `to_char((${expr}) at time zone ${ZONA_SQL}, '${hora ? "YYYY-MM-DD HH24:MI" : "YYYY-MM-DD"}')`;
  return { clave, titulo, sql, orden: expr, formato: hora ? "fechahora" : "fecha", ancho: hora ? 16 : 11 };
}
/** El valor traducido con un diccionario (ej. el código del estado → "Activo"). */
export const traducido = (clave: string, mapa: Record<string, string>) => (f: Fila) => {
  const k = f[clave];
  return k == null ? null : Object.hasOwn(mapa, k) ? mapa[k] : String(k);
};
