// "Descargar Excel" de cualquier lista configurable (lib/listas/tipos.ts): la
// misma consulta y los mismos filtros, búsqueda y orden que la pantalla, pero
// todas las filas (hasta TOPE_EXCEL), con las columnas elegidas.

import { consulta } from "@/lib/erp/base";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";
import {
  camposDe, elegir, ordenDe, ordenarFilas, seleccion, valorDe, type Campo, type Ctx, type Fila, type Lista, type SP,
} from "./tipos";

export const TOPE_EXCEL = 50_000;

const ZONA = "America/Argentina/Buenos_Aires";

/** Fecha (y hora) argentina como Date en UTC: Excel la muestra tal cual. */
function aFechaExcel(v: unknown, conHora: boolean): Date | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], conHora ? +(m[4] ?? 0) : 0, conHora ? +(m[5] ?? 0) : 0));
  }
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, conHora ? +p.hour : 0, conHora ? +p.minute : 0));
}

/** El valor de la celda del Excel según el formato del campo. */
export function valorExcel(c: Campo, f: Fila): string | number | Date | null {
  const v = valorDe(c, f);
  if (v == null || v === "") return null;
  switch (c.formato) {
    case "entero": case "pesos": case "usd": case "decimal": case "pct": {
      const n = Number(v);
      return Number.isFinite(n) ? n : String(v);
    }
    case "fecha": return aFechaExcel(v, false);
    case "fechahora": return aFechaExcel(v, true);
    case "sino": return v === true || v === 1 || v === "1" || v === "t" ? "Sí" : "No";
    default:
      if (Array.isArray(v)) return v.join(", ");
      if (typeof v === "object") return JSON.stringify(v);
      return typeof v === "number" ? v : String(v);
  }
}

const FORMATO_EXCEL: Record<string, ColumnaExcel<Fila>["formato"]> = {
  entero: "entero", pesos: "importe", usd: "importe", decimal: "decimal", pct: "pct", fecha: "fecha", fechahora: "fechahora",
};

/** Las filas de la lista con los filtros de `sp` y los campos elegidos (hasta `tope`). */
export async function filasDeLista(lista: Lista, ctx: Ctx, sp: SP, campos: Campo[], todos: Campo[], tope: number): Promise<Fila[]> {
  if (lista.consulta) {
    const c = await lista.consulta(ctx, sp);
    return consulta<Fila>(
      `select ${seleccion(campos, todos)} from ${c.desde} where ${c.donde} order by ${ordenDe(todos, sp, c.orden)} limit ${Math.trunc(tope)}`,
      c.valores);
  }
  if (lista.filas) return ordenarFilas(todos, await lista.filas(ctx, sp), sp).slice(0, tope);
  return [];
}

/** La respuesta con el .xlsx: columnas de `claves` (vacío = las de pantalla). */
export async function excelDeLista(lista: Lista, ctx: Ctx, sp: SP, claves: string[] | null, nombreConfig?: string): Promise<Response> {
  const todos = await camposDe(lista, ctx);
  const campos = elegir(lista, todos, claves);
  const filas = await filasDeLista(lista, ctx, sp, campos, todos, TOPE_EXCEL + 1);
  const pasado = filas.length > TOPE_EXCEL;
  const columnas: ColumnaExcel<Fila>[] = campos.flatMap((c) => {
    const col: ColumnaExcel<Fila> = {
      titulo: c.titulo, valor: (f) => valorExcel(c, f), ancho: c.ancho ?? Math.min(40, Math.max(10, c.titulo.length + 2)),
      formato: c.formato ? FORMATO_EXCEL[c.formato] : undefined,
    };
    // Los importes en pesos que la base guarda también en dólares (al dólar de su día) bajan con su columna en dólares al lado.
    if (c.formato === "pesos" && c.sqlUsd) {
      const titulo = `${c.titulo.replace(/\s*\$$/, "")} (US$ al dólar del día)`;
      return [col, { titulo, ancho: Math.min(40, Math.max(14, titulo.length + 2)), formato: "importe" as const,
        valor: (f: Fila) => (f[`${c.clave}__usd`] == null ? null : Number(f[`${c.clave}__usd`])) }];
    }
    return [col];
  });
  const pie = pasado ? [[`Sólo las primeras ${TOPE_EXCEL.toLocaleString("es-AR")} filas: filtrá para bajar el resto.`]] : [];
  return respuestaExcel(nombreConfig ? `${lista.titulo} - ${nombreConfig}` : lista.titulo, lista.titulo, columnas, pasado ? filas.slice(0, TOPE_EXCEL) : filas, pie);
}
