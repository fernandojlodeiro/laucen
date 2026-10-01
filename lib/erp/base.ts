// Piezas comunes del cimiento del ERP: consultar con las tablas aseguradas,
// correr algo en una transacción y traducir los errores de la base a criollo
// (AGENTS.md: "nada de la cocina en las pantallas").

import type { PoolClient, QueryResultRow } from "pg";
import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";

/** Algo que sabe hacer consultas: el pool o un cliente en transacción. */
export type Consultor = Pick<PoolClient, "query">;

export async function consulta<T extends QueryResultRow = QueryResultRow>(sql: string, valores: unknown[] = []): Promise<T[]> {
  await asegurarEsquemaErp();
  return (await pool.query<T>(sql, valores)).rows;
}

export async function una<T extends QueryResultRow = QueryResultRow>(sql: string, valores: unknown[] = []): Promise<T | null> {
  return (await consulta<T>(sql, valores))[0] ?? null;
}

/** Corre `fn` en una transacción: todo o nada. */
export async function enTransaccion<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await asegurarEsquemaErp();
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Un error de negocio, ya en criollo, que se puede mostrar tal cual. */
export class ErrorErp extends Error {
  constructor(mensaje: string, public codigo?: string) {
    super(mensaje);
  }
}

/** Traduce cualquier error a una frase para la pantalla. Los que levantan las
 *  funciones de la base con `raise exception ... using errcode = 'P0001'` ya
 *  vienen escritos en criollo; los demás se traducen o se esconden. */
export function motivoErp(e: unknown): string {
  if (e instanceof ErrorErp) return e.message;
  const err = e as { code?: string; message?: string; constraint?: string; detail?: string };
  if (err?.code === "P0001" && err.message) return err.message.charAt(0).toUpperCase() + err.message.slice(1) + ".";
  if (err?.code === "23505") return "Ya hay otro con ese mismo dato (nombre, SKU o código repetido).";
  if (err?.code === "23503") return "Está en uso en otro lado (pedidos, stock o precios): no se puede borrar. Archivalo.";
  if (err?.code === "23514") return "Algún dato está fuera de rango (por ejemplo un número negativo o un porcentaje mayor a 100).";
  if (err?.code === "22P02" || err?.code === "22003") return "Algún número no se pudo leer.";
  console.error("[erp] error sin traducir:", err?.code, err?.message);
  return "No se pudo completar. Probá de nuevo en un momento.";
}
