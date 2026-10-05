// Crea las tablas del cimiento del ERP (orden 136) si no existen, corriendo
// los db/*.sql del cimiento —que son idempotentes— una vez por arranque del
// servidor, en orden (cada uno usa tablas del anterior). Con candado
// (advisory lock) para que dos arranques en paralelo no se pisen. Mismo patrón
// que lib/radar/esquema.ts.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { pool } from "@/db";

export const ARCHIVOS_ERP = ["moneda", "eventos", "catalogo", "stock", "ventas", "importar", "compras", "mercadolibre", "deposito", "facturacion", "tienda", "administracion", "archivos", "listas", "precios_ml", "reclamos", "ml_facturacion", "equipo", "asistente", "mensajes", "tc_dia"] as const;

/** Corre los .sql del cimiento contra una base (sirve también para los tests). */
export async function correrEsquemaErp(base: Pool): Promise<void> {
  const cliente = await base.connect();
  try {
    await cliente.query("begin");
    await cliente.query("select pg_advisory_xact_lock(7212136)");
    for (const archivo of ARCHIVOS_ERP) {
      const sql = await readFile(path.join(process.cwd(), "db", `${archivo}.sql`), "utf8");
      await cliente.query(sql);
    }
    await cliente.query("commit");
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

let listo: Promise<void> | null = null;

export function asegurarEsquemaErp(): Promise<void> {
  listo ??= correrEsquemaErp(pool).catch((e) => {
    listo = null; // que el próximo intento lo reintente
    throw e;
  });
  return listo;
}
