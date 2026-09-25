// Crea las tablas de Importaciones (ARCA + Softrade) si no existen, corriendo
// db/arca.sql (idempotente) una vez por arranque del servidor. Mismo patrón
// que lib/radar/esquema.ts. La carga de datos no pasa por acá: la hace
// scripts/arca/cargar.mjs desde la PC donde están los archivos.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@/db";

let listo: Promise<void> | null = null;

export function asegurarEsquemaArca(): Promise<void> {
  listo ??= (async () => {
    const sql = await readFile(path.join(process.cwd(), "db", "arca.sql"), "utf8");
    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      await cliente.query("select pg_advisory_xact_lock(7212002)");
      await cliente.query(sql);
      await cliente.query("commit");
    } catch (e) {
      await cliente.query("rollback").catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  })().catch((e) => {
    listo = null;
    throw e;
  });
  return listo;
}
